/**
 * 智能建库（Auto-Build）
 *
 * 把公司材料文本喂给 DeepSeek，让它一次性输出：
 * - 候选概念（含字段定义）
 * - 候选关系
 * - 候选规则 DSL
 * - 候选 scenario
 *
 * 用户在前端勾选/编辑后，调 commit API 入库。
 */

import { chat } from "./llm";

export interface CandidateConcept {
  localName: string;
  labelZh: string;
  labelEn?: string;
  description?: string;
  isCore?: boolean; // 是否建议作为核心概念
  fields: Array<{
    name: string;
    type: string; // string | number | date | ref | array
    required?: boolean;
    label?: string;
    ref?: string;
    itemRef?: string;
    enum?: string[];
  }>;
}

export interface CandidateRelation {
  name: string;
  source: string; // localName
  target: string; // localName
  relationType: string; // CONTAINS | BELONGS_TO | REFERENCES | SUBMIT | APPROVE
  cardinality: string; // 1:1 | 1:N | N:M
  description?: string;
}

export interface CandidateRule {
  code: string;
  name: string;
  severity: "ERROR" | "WARNING" | "INFO";
  target: string; // localName
  targetPath?: string;
  dsl: string; // 完整 DSL YAML
  message: string;
  explanation?: string;
  tags?: string[];
}

export interface CandidateScenario {
  code: string;
  name: string;
  description?: string;
}

export interface AutoBuildResult {
  concepts: CandidateConcept[];
  relations: CandidateRelation[];
  rules: CandidateRule[];
  scenarios: CandidateScenario[];
  // 元信息
  modelSummary?: string;
  raw?: string;
}

export interface AutoBuildResponse {
  ok: boolean;
  result?: AutoBuildResult;
  usage?: any;
  durationMs?: number;
  error?: string;
}

const SYSTEM_PROMPT = `你是企业本体建模专家。你的任务是根据用户提供的公司业务材料，自动设计一个领域的本体（ontology）。

要求：
1. 输出一个严格的 JSON 对象，包含 concepts / relations / rules / scenarios 四个数组。
2. 概念命名：localName 用 PascalCase（如 Employee、ExpenseReport），labelZh 用中文。
3. 字段类型必须是：string / number / date / boolean / ref / array。
4. 关系类型必须是：CONTAINS / BELONGS_TO / REFERENCES / SUBMIT / APPROVE 之一。
5. 规则 DSL 必须遵守以下语法（重要！）：
   - when 子句支持：
     * isEmpty(path) / isNotEmpty(path) / exists(path)
     * path == "字符串" / path != "x" / path > 100 / path >= 100 / path < 100 / path <= 100
     * path in [a, b, c] / path not_in [a, b]
     * func(args)  # 受治理函数调用，如 std_hotel_max(city, employee.level)
     * all: [条件列表]  # 且
     * any: [条件列表]  # 或
     * not (条件)
   - 字符串字面量必须用双引号
   - message 用 {{path}} 插值
   - 多行 explanation 用 | 块标量
6. 规则 severity 必须是 error / warning / info 之一（小写）。
7. 至少产出 3 个概念、2 个关系、2 条规则。

【scenarios（使用场景/Action）抽取规则 —— 重点】
一个业务领域通常有多个"使用场景"，每个场景对应材料中描述的一个具体业务动作（Action）。
你必须通读材料，把材料里出现过的每一个独立业务动作都识别为一个 scenario，而不是只给一个笼统的"提交校验"。
常见动作来源包括但不限于：
- 制度流程中各办理环节（如"出差申请"、"费用报销"、"暂借款申请"、"借款冲销"、"应酬申请"等）
- 材料中明确列出的"动作一/动作二/动作三"或编号动作（A-01、A-05 等），每个动作应单独成一个 scenario
- 不同的提交/审批/校验入口
对每个 scenario：code 用 snake_case 英文（如 submit_travel_request、apply_loan、reimburse_expense），
name 用中文动作名，description 说明该动作触发什么校验。通常一个领域应识别出 3 个以上 scenario。

输出 JSON Schema：
{
  "concepts": [
    {
      "localName": "Employee",
      "labelZh": "员工",
      "labelEn": "Employee",
      "description": "报销场景中的员工",
      "isCore": false,
      "fields": [
        { "name": "id", "type": "string", "required": true, "label": "工号" },
        { "name": "name", "type": "string", "required": true, "label": "姓名" },
        { "name": "level", "type": "string", "label": "职级", "enum": ["P5","P6","M1","M2","M3"] }
      ]
    }
  ],
  "relations": [
    { "name": "提交", "source": "Employee", "target": "ExpenseReport", "relationType": "SUBMIT", "cardinality": "1:N", "description": "员工提交报销单" }
  ],
  "rules": [
    {
      "code": "R-EXP-001",
      "name": "发票号不可重复",
      "severity": "error",
      "target": "ExpenseReport",
      "targetPath": null,
      "dsl": "- id: R-EXP-001\\n  name: 发票号不可重复\\n  severity: error\\n  target: ExpenseReport\\n  when:\\n    call: [has_duplicate_field, lines, \\"invoice.number\\"]\\n  message: \\"报销单内存在重复发票号\\"\\n  explanation: |\\n    发票号必须唯一\\n  tags: [发票, 去重]",
      "message": "报销单内存在重复发票号",
      "explanation": "发票号必须唯一",
      "tags": ["发票","去重"]
    }
  ],
  "scenarios": [
    { "code": "submit_travel_request", "name": "提交出差申请", "description": "出差前提交审批单，校验审批状态、路线完整性" },
    { "code": "reimburse_expense", "name": "费用报销", "description": "提交报销单及发票，校验住宿费标准、餐补时间、发票去重" },
    { "code": "apply_loan", "name": "申请暂借款", "description": "出差/采购前申请借款，校验是否有未冲销借款" }
  ]
}

注意：DSL 字符串里的换行用 \\n 转义，双引号用 \\" 转义。`;

/**
 * 调 DeepSeek 让它根据材料生成本体候选
 */
export async function autoBuildOntology(
  materials: string,
  domainHint?: { code?: string; name?: string; description?: string },
): Promise<AutoBuildResponse> {
  const start = Date.now();

  const userPrompt = [
    domainHint?.name ? `领域名称：${domainHint.name}` : "",
    domainHint?.code ? `领域 code：${domainHint.code}` : "",
    domainHint?.description ? `领域描述：${domainHint.description}` : "",
    "",
    "公司业务材料：",
    "```",
    materials,
    "```",
  ].filter(Boolean).join("\n");

  try {
    const { text: raw, usage, durationMs } = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { jsonMode: true, temperature: 0.2, maxTokens: 12288 },
    );

    console.log(`[AutoBuild] 领域=${domainHint?.code ?? '-'} 材料长度=${materials.length} 耗时=${durationMs}ms raw长度=${raw.length}`);

    // 解析 JSON
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      // 兜底：从 markdown 代码块提取
      const m = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
      if (m) {
        try { data = JSON.parse(m[1]); } catch {}
      }
    }

    if (!data || typeof data !== "object") {
      // 打印 raw 片段辅助诊断（可能被 token 截断或返回非 JSON 文本）
      console.error(`[AutoBuild] JSON 解析失败，raw 前 500 字符：${raw.slice(0, 500)}`);
      return { ok: false, raw, error: "LLM 返回不是合法 JSON", durationMs };
    }

    // 规范化
    const result: AutoBuildResult = {
      concepts: Array.isArray(data.concepts) ? data.concepts.map(normalizeConcept) : [],
      relations: Array.isArray(data.relations) ? data.relations.map(normalizeRelation) : [],
      rules: Array.isArray(data.rules) ? data.rules.map(normalizeRule) : [],
      scenarios: Array.isArray(data.scenarios) ? data.scenarios.map(normalizeScenario) : [],
      modelSummary: data.modelSummary,
      raw,
    };

    return { ok: true, result, usage, durationMs };
  } catch (e: any) {
    return { ok: false, error: e.message, durationMs: Date.now() - start };
  }
}

function normalizeConcept(c: any): CandidateConcept {
  return {
    localName: String(c.localName ?? c.name ?? "Unknown"),
    labelZh: String(c.labelZh ?? c.label ?? c.localName ?? "未命名"),
    labelEn: c.labelEn ? String(c.labelEn) : undefined,
    description: c.description ? String(c.description) : undefined,
    isCore: !!c.isCore,
    fields: Array.isArray(c.fields) ? c.fields.map((f: any) => ({
      name: String(f.name ?? "field"),
      type: String(f.type ?? "string"),
      required: !!f.required,
      label: f.label ? String(f.label) : undefined,
      ref: f.ref ? String(f.ref) : undefined,
      itemRef: f.itemRef ? String(f.itemRef) : undefined,
      enum: Array.isArray(f.enum) ? f.enum.map(String) : undefined,
    })) : [],
  };
}

function normalizeRelation(r: any): CandidateRelation {
  return {
    name: String(r.name ?? "关联"),
    source: String(r.source ?? r.from ?? ""),
    target: String(r.target ?? r.to ?? ""),
    relationType: String(r.relationType ?? r.type ?? "REFERENCES").toUpperCase(),
    cardinality: String(r.cardinality ?? "1:N"),
    description: r.description ? String(r.description) : undefined,
  };
}

function normalizeRule(r: any): CandidateRule {
  return {
    code: String(r.code ?? `R-${Math.random().toString(36).slice(2, 6).toUpperCase()}`),
    name: String(r.name ?? "未命名规则"),
    severity: (String(r.severity ?? "warning").toUpperCase()) as "ERROR" | "WARNING" | "INFO",
    target: String(r.target ?? ""),
    targetPath: r.targetPath ? String(r.targetPath) : undefined,
    dsl: String(r.dsl ?? ""),
    message: String(r.message ?? ""),
    explanation: r.explanation ? String(r.explanation) : undefined,
    tags: Array.isArray(r.tags) ? r.tags.map(String) : undefined,
  };
}

function normalizeScenario(s: any): CandidateScenario {
  return {
    code: String(s.code ?? "validate"),
    name: String(s.name ?? "校验场景"),
    description: s.description ? String(s.description) : undefined,
  };
}
