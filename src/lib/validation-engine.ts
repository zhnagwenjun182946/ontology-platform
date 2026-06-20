/**
 * 规则校验核心逻辑 —— 从 runs/route.ts 抽取，供 /api/v1/ 和 /api/runs 共用。
 */
import { db } from "@/lib/db";
import {
  parseDsl, evaluateWhen, renderMessage, builtinFunctions,
} from "@/lib/dsl/parser";
import {
  extractStructured,
  buildSchemaPromptFromDomain,
  type DomainConceptSchema,
} from "@/lib/llm";
import {
  conceptToSingularField,
  conceptToPluralField,
  isDetailConceptResolved,
  buildDetailConceptSet,
} from "@/lib/concept-field";
import type { AgentFinding } from "@/lib/agent-types";

export interface RawFinding {
  runId: string
  ruleId: string | null
  ruleCode: string | null
  severity: string
  targetPath: string | null
  message: string
  contextJson: string
}

export interface RawExtracted {
  runId: string
  conceptLabel: string
  jsonPayload: string
}

export interface ValidationResult {
  payloadObj: any
  extractionMeta: any | null
  findings: RawFinding[]
  extractedObjects: RawExtracted[]
  rules: any[]
}

/**
 * 执行一次完整的校验流程：LLM 抽取（text 模式）→ 规则校验 → 返回结果。
 * 不落库，纯计算。
 */
export async function executeValidation(
  scenario: any,
  mode: "text" | "json",
  input: any,
  runId: string,
): Promise<ValidationResult> {
  const rulesetIds: string[] = JSON.parse(scenario.rulesetIds || "[]");
  const rules = await db.rule.findMany({
    where: { rulesetId: { in: rulesetIds }, status: "PUBLISHED" },
    include: { targetConcept: true },
  });

  // 加载领域概念：schema 提示词（text 模式）与实体抽取（所有模式）共用。
  // 实体抽取改为概念驱动后，json 模式也需要它来识别哪些字段是实体。
  const domainConcepts = await db.domainConcept.findMany({
    where: { domainId: scenario.domainId },
    include: { concept: true },
  });

  // 加载领域关系，推导「明细概念集合」：CONTAINS 的 target 即明细。
  // 比按概念名猜（Fee/Expense）可靠，不受 LLM 命名差异影响。
  // 注意：DomainRelation 的端点是 Concept.id，需经 DomainConcept.linkedConceptId
  // 反查到 localName（概念在领域内的名字）。
  const domainRelations = await db.domainRelation.findMany({
    where: { domainId: scenario.domainId },
  });
  const conceptIdToLocalName = new Map<string, string>();
  for (const dc of domainConcepts) {
    if (dc.linkedConceptId) conceptIdToLocalName.set(dc.linkedConceptId, dc.localName);
  }
  const detailSet = buildDetailConceptSet(
    domainRelations.map((r) => ({
      source: conceptIdToLocalName.get(r.sourceDomainConceptId) ?? "",
      target: conceptIdToLocalName.get(r.targetDomainConceptId) ?? "",
      relationType: r.relationType,
    })),
  );

  // 加载领域受治理标准，构建受治理函数注册表（与通用 builtinFunctions 合并）。
  // 规则 DSL 里 call 的 std_xxx 在这里按 matrix 下钻取值；未定义则函数不存在
  // → evalExpr 返回 undefined → 比较取 false（不误报），不再依赖硬编码默认值。
  const standards = await db.standard.findMany({ where: { domainId: scenario.domainId } });
  const functions = { ...builtinFunctions, ...buildGovernanceFunctions(standards) };

  let payloadObj: any;
  let extractionMeta: any = null;

  if (mode === "text") {
    const text: string = typeof input === "string" ? input : "";
    if (!text.trim()) throw new Error("文本输入为空");

    const conceptSchemas: DomainConceptSchema[] = domainConcepts.map((dc) => ({
      localName: dc.localName,
      labelZh: dc.concept?.labelZh ?? dc.localName,
      description: dc.concept?.description ?? null,
      fields: (() => {
        try { return JSON.parse(dc.concept?.jsonSchema ?? "[]") } catch { return [] }
      })(),
    }));
    const schemaPrompt = conceptSchemas.length > 0
      ? buildSchemaPromptFromDomain(scenario.domain.nameZh, conceptSchemas, detailSet)
      : "{}";

    const result = await extractStructured(text, schemaPrompt);
    extractionMeta = {
      ok: result.ok,
      error: result.error,
      usage: result.usage,
      durationMs: result.durationMs,
      raw: result.raw,
    };

    if (!result.ok || !result.data) {
      throw new Error(`LLM 抽取失败: ${result.error}`);
    }
    payloadObj = result.data;
  } else {
    payloadObj = typeof input === "string" ? JSON.parse(input) : input;
  }

  const findings: RawFinding[] = [];
  const extractedObjects: RawExtracted[] = [];

  // 实体抽取（概念驱动）：每个领域概念顶层一个字段。
  //   - 明细概念 → 复数字段（数组）：每个元素记一个实体
  //   - 主概念 → 单数字段（对象）：非 null 即记一个实体（不再用 hasIdentity 过滤，
  //     避免像 travelRequest.id=null 这种主实体被漏掉）
  // conceptLabel 用 localName（规范 PascalCase），与规则 target、InstanceGraph 一致。
  for (const dc of domainConcepts) {
    const conceptLabel = dc.localName;
    const field = isDetailConceptResolved(dc.localName, detailSet)
      ? conceptToPluralField(dc.localName)
      : conceptToSingularField(dc.localName);
    const val = payloadObj?.[field];
    if (Array.isArray(val)) {
      for (const el of val) {
        if (el && typeof el === "object") {
          extractedObjects.push({ runId, conceptLabel, jsonPayload: JSON.stringify(el) });
        }
      }
    } else if (val && typeof val === "object") {
      extractedObjects.push({ runId, conceptLabel, jsonPayload: JSON.stringify(val) });
    }
  }

  // 规则校验（领域无关）
  const ctxForEval = { ...payloadObj };

  for (const rule of rules) {
    try {
      const parsed = parseDsl(rule.dsl);
      // 概念驱动兜底用 rule.targetConcept.labelEn（如 Accommodation Fee）；
      // resolveArrayTargets 内部会去空格容错。
      const conceptName = rule.targetConcept?.labelEn ?? undefined;
      const targets = resolveArrayTargets(parsed, payloadObj, conceptName);

      if (targets && targets.length > 0) {
        // 数组逐项遍历（targetPath=xxx[*] 或概念驱动兜底命中的数组）
        for (const t of targets) {
          const itemCtx = { ...ctxForEval, ...t.item };
          if (evaluateWhen(parsed.when, itemCtx, functions)) {
            const messageText = parsed.message
              ? renderMessage(parsed.message, itemCtx, functions)
              : (rule.messageTemplate ?? "");
            findings.push({
              runId, ruleId: rule.id, ruleCode: rule.code, severity: rule.severity,
              targetPath: t.path, message: messageText, contextJson: JSON.stringify(t.item),
            });
          }
        }
      } else if (targets === null) {
        // 整单级：无 targetPath 或概念未匹配到数组 → 在 payload 上求值一次
        if (evaluateWhen(parsed.when, ctxForEval, functions)) {
          const messageText = parsed.message
            ? renderMessage(parsed.message, ctxForEval, functions)
            : (rule.messageTemplate ?? "");
          findings.push({
            runId, ruleId: rule.id, ruleCode: rule.code, severity: rule.severity,
            targetPath: parsed.targetPath ?? null, message: messageText, contextJson: JSON.stringify(payloadObj),
          });
        }
      }
      // targets !== null && targets.length === 0 → 明细数组为空，无项可检查，跳过
    } catch (e) {
      findings.push({
        runId, ruleId: rule.id, ruleCode: rule.code, severity: "INFO",
        targetPath: null, message: `规则执行异常: ${(e as Error).message}`, contextJson: "{}",
      });
    }
  }

  return { payloadObj, extractionMeta, findings, extractedObjects, rules };
}

// ============ 领域无关的辅助函数 ============

/**
 * 把领域的受治理标准（Standard.matrix）构建成函数注册表。
 *
 * 每条 Standard 对应一个受治理函数：code 为函数名，matrix 为嵌套查找表。
 * 调用时按 call 参数顺序逐层下钻 matrix 取叶子值：
 *   std_hotel_max("北上广深", "其他员工") → matrix["北上广深"]["其他员工"] → 400
 * 任一层取不到（维度值不匹配 / 缺失）→ 返回 undefined。
 *   规则里 amount > undefined → NaN 比较 → false（不误报），不再有硬编码默认值掩盖问题。
 */
export function buildGovernanceFunctions(
  standards: Array<{ code: string; matrix: string }>,
): Record<string, (...args: any[]) => any> {
  const fns: Record<string, (...args: any[]) => any> = {};
  for (const s of standards) {
    if (!s.code) continue;
    let matrix: any;
    try {
      matrix = JSON.parse(s.matrix ?? "{}");
    } catch {
      matrix = {};
    }
    if (!matrix || typeof matrix !== "object" || Array.isArray(matrix)) continue;
    fns[s.code] = (...args: any[]) => {
      let cur: any = matrix;
      for (const a of args) {
        if (cur && typeof cur === "object" && !Array.isArray(cur) && a in cur) {
          cur = cur[a];
        } else {
          return undefined;
        }
      }
      return typeof cur === "number" ? cur : undefined;
    };
  }
  return fns;
}

interface ArrayTarget {
  path: string;    // 如 "accommodationFees[0]"
  item: any;       // 该数组元素
}

/**
 * 解析规则要遍历的数组目标（领域无关）：
 * 1. targetPath 形如 "<field>[*]" → 直接遍历 payload[<field>]，数组为空时返回 []
 * 2. targetPath 缺省但 rule.target 是概念名 → 推断该概念对应的复数字段名，
 *    若 payload 中存在同名数组则遍历之（概念驱动兜底），数组为空时返回 []
 * 3. 都没有 → 返回 null，表示走整单级
 *
 * conceptName 可能为 Concept.labelEn（带空格，如 "Accommodation Fee"），
 * conceptToPluralField 内部去空格容错，故 "Accommodation Fee" → accommodationFees。
 *
 * 返回值语义：
 * - null：无数组目标，规则应在整单层求值
 * - []：找到了数组目标但数组为空，规则应跳过（无明细可检查）
 * - 非空数组：逐项遍历
 */
export function resolveArrayTargets(
  parsed: { targetPath?: string; target?: string },
  payloadObj: any,
  ruleTarget?: string,
): ArrayTarget[] | null {
  if (!payloadObj || typeof payloadObj !== "object") return null;

  // 1. targetPath = <field>[*]
  if (parsed.targetPath) {
    const m = parsed.targetPath.match(/^(\w+)\[\*\]$/);
    if (m) {
      const arr = payloadObj[m[1]];
      if (Array.isArray(arr)) {
        return arr.map((item, idx) => ({ path: `${m[1]}[${idx}]`, item }));
      }
      // targetPath 指向 xxx[*] 但字段不存在或非数组 → 视为明细级规则，无明细则跳过
      return [];
    }
    // targetPath 不是 xxx[*] 形式 → 走整单级
    return null;
  }

  // 2. 概念驱动兜底：按 rule.target 推断字段名
  const conceptName = parsed.target ?? ruleTarget;
  if (!conceptName) return null;

  // 尝试该概念对应的复数字段名（如 AccommodationFee → accommodationFees）
  const candidateFields = new Set<string>();
  candidateFields.add(conceptToPluralField(conceptName));
  // 也尝试小写概念名本身（如 accommodationfee）
  candidateFields.add(conceptName.replace(/\s+/g, "").toLowerCase());

  for (const field of candidateFields) {
    const arr = payloadObj[field];
    if (Array.isArray(arr)) {
      return arr.map((item, idx) => ({ path: `${field}[${idx}]`, item }));
    }
  }
  // 未找到对应数组 → 走整单级
  return null;
}

/**
 * 把 RawFinding 转成结构化 AgentFinding（对 Agent 友好）。
 */
export function toAgentFinding(f: RawFinding): AgentFinding {
  // 从 targetPath 提取字段名（如 lines[0] → lines[0]）
  const field = f.targetPath;
  // 从 contextJson 提取违规值
  let value: any = undefined;
  if (f.contextJson && f.contextJson !== "{}") {
    try { value = JSON.parse(f.contextJson) } catch { /* ignore */ }
  }
  // 从 message 推断建议
  let suggestion: string | null = null;
  if (f.severity === "ERROR") {
    suggestion = "请修正上述违规后重新提交";
  } else if (f.severity === "WARNING") {
    suggestion = "建议确认是否需要额外审批";
  }
  return {
    ruleCode: f.ruleCode ?? "UNKNOWN",
    severity: (f.severity as "ERROR" | "WARNING" | "INFO"),
    targetPath: f.targetPath,
    field: field ?? null,
    value,
    constraint: null,
    message: f.message,
    suggestion,
    context: value,
  };
}
