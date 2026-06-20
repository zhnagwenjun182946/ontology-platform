/**
 * 规则校验核心逻辑 —— 从 runs/route.ts 抽取，供 /api/v1/ 和 /api/runs 共用。
 */
import { db } from "@/lib/db";
import {
  parseDsl, evaluateWhen, renderMessage, builtinFunctions,
} from "@/lib/dsl/parser";
import {
  extractStructured,
  buildReimbursementSchemaPrompt,
  buildProcurementSchemaPrompt,
  buildSchemaPromptFromDomain,
  type DomainConceptSchema,
} from "@/lib/llm";
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
  const domainCode = scenario.domain.code;
  const rulesetIds: string[] = JSON.parse(scenario.rulesetIds || "[]");
  const rules = await db.rule.findMany({
    where: { rulesetId: { in: rulesetIds }, status: "PUBLISHED" },
    include: { targetConcept: true },
  });

  let payloadObj: any;
  let extractionMeta: any = null;

  if (mode === "text") {
    const text: string = typeof input === "string" ? input : "";
    if (!text.trim()) throw new Error("文本输入为空");

    let schemaPrompt: string;
    if (domainCode === "reimbursement") {
      schemaPrompt = buildReimbursementSchemaPrompt();
    } else if (domainCode === "procurement") {
      schemaPrompt = buildProcurementSchemaPrompt();
    } else {
      const domainConcepts = await db.domainConcept.findMany({
        where: { domainId: scenario.domainId },
        include: { concept: true },
      });
      const conceptSchemas: DomainConceptSchema[] = domainConcepts.map((dc) => ({
        localName: dc.localName,
        labelZh: dc.concept?.labelZh ?? dc.localName,
        description: dc.concept?.description ?? null,
        fields: (() => {
          try { return JSON.parse(dc.concept?.jsonSchema ?? "[]") } catch { return [] }
        })(),
      }));
      schemaPrompt = conceptSchemas.length > 0
        ? buildSchemaPromptFromDomain(scenario.domain.nameZh, conceptSchemas)
        : "{}";
    }

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

  // 记录抽取对象
  if (Array.isArray(payloadObj?.lines)) {
    for (const line of payloadObj.lines) {
      extractedObjects.push({ runId, conceptLabel: "ExpenseItem", jsonPayload: JSON.stringify(line) });
    }
  }
  if (Array.isArray(payloadObj?.items)) {
    for (const item of payloadObj.items) {
      extractedObjects.push({ runId, conceptLabel: "ProcurementItem", jsonPayload: JSON.stringify(item) });
    }
  }
  const knownMainLabels: Record<string, string> = {
    loan: "Loan", expenseReport: "ExpenseReport",
    employee: "Employee", submitter: "Employee",
    travelRequest: "TravelRequest", borrower: "Employee",
  };
  if (payloadObj && typeof payloadObj === "object") {
    for (const [key, label] of Object.entries(knownMainLabels)) {
      const v = (payloadObj as any)[key];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const hasIdentity = v.id || v.name || v.loanId || v.number || v.code;
        if (hasIdentity) {
          extractedObjects.push({ runId, conceptLabel: label, jsonPayload: JSON.stringify(v) });
        }
      }
    }
  }
  if (payloadObj && typeof payloadObj === "object") {
    const hasNestedMain = extractedObjects.some(o =>
      o.conceptLabel === "ExpenseReport" || o.conceptLabel === "ProcurementRequest" || o.conceptLabel === "Loan"
    );
    if (!hasNestedMain) {
      const isReimbursement = payloadObj.submitter || (payloadObj.id && Array.isArray(payloadObj.lines));
      const isProcurement = payloadObj.buyer || (payloadObj.id && Array.isArray(payloadObj.items));
      if (isReimbursement || isProcurement) {
        extractedObjects.push({
          runId,
          conceptLabel: isProcurement ? "ProcurementRequest" : "ExpenseReport",
          jsonPayload: JSON.stringify(payloadObj),
        });
      }
    }
  }

  // 规则校验
  const ctxForEval = {
    ...payloadObj,
    employee: payloadObj?.employee ?? payloadObj?.submitter ?? { level: "P5" },
  };

  for (const rule of rules) {
    try {
      const parsed = parseDsl(rule.dsl);
      let messageText = rule.messageTemplate ?? "";

      if (parsed.targetPath && parsed.targetPath.includes("lines[*]")) {
        const lines = payloadObj?.lines ?? [];
        for (let idx = 0; idx < lines.length; idx++) {
          const line = lines[idx];
          const lineCtx = { ...ctxForEval, ...line, employee: ctxForEval.employee };
          if (evaluateWhen(parsed.when, lineCtx, builtinFunctions)) {
            if (parsed.message) messageText = renderMessage(parsed.message, lineCtx, builtinFunctions);
            findings.push({
              runId, ruleId: rule.id, ruleCode: rule.code, severity: rule.severity,
              targetPath: `lines[${idx}]`, message: messageText, contextJson: JSON.stringify(line),
            });
          }
        }
      } else if (parsed.targetPath && parsed.targetPath.includes("items[*]")) {
        const items = payloadObj?.items ?? [];
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          const itemCtx = { ...ctxForEval, ...item };
          if (evaluateWhen(parsed.when, itemCtx, builtinFunctions)) {
            if (parsed.message) messageText = renderMessage(parsed.message, itemCtx, builtinFunctions);
            findings.push({
              runId, ruleId: rule.id, ruleCode: rule.code, severity: rule.severity,
              targetPath: `items[${idx}]`, message: messageText, contextJson: JSON.stringify(item),
            });
          }
        }
      } else {
        if (evaluateWhen(parsed.when, ctxForEval, builtinFunctions)) {
          if (parsed.message) messageText = renderMessage(parsed.message, ctxForEval, builtinFunctions);
          findings.push({
            runId, ruleId: rule.id, ruleCode: rule.code, severity: rule.severity,
            targetPath: parsed.targetPath ?? null, message: messageText, contextJson: JSON.stringify(payloadObj),
          });
        }
      }
    } catch (e) {
      findings.push({
        runId, ruleId: rule.id, ruleCode: rule.code, severity: "INFO",
        targetPath: null, message: `规则执行异常: ${(e as Error).message}`, contextJson: "{}",
      });
    }
  }

  return { payloadObj, extractionMeta, findings, extractedObjects, rules };
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
