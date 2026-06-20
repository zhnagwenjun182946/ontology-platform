/**
 * DeepSeek LLM 客户端 - 服务端使用
 *
 * 用于把"业务提交材料文本"抽取成结构化对象。
 * DeepSeek API 兼容 OpenAI Chat Completions 格式。
 */

const API_KEY = process.env.DEEPSEEK_API_KEY || "";
const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmExtractionResult {
  ok: boolean;
  data?: any;
  raw?: string;
  error?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  durationMs?: number;
}

/**
 * 调 DeepSeek Chat Completions，返回原始文本。
 */
export async function chat(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {},
): Promise<{ text: string; usage: any; durationMs: number }> {
  const start = Date.now();
  const body: any = {
    model: MODEL,
    messages,
    temperature: opts.temperature ?? 0.1,
    max_tokens: opts.maxTokens ?? 2048,
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const durationMs = Date.now() - start;

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek API ${res.status}: ${errText.slice(0, 500)}`);
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  return { text, usage: json.usage, durationMs };
}

/**
 * 把"业务文本 + 概念 schema"喂给 DeepSeek，要求返回结构化 JSON 对象。
 *
 * @param text 业务提交材料原文
 * @param schemaPrompt 概念 schema 描述（人类可读）
 * @param extraSystem 额外系统提示
 */
export async function extractStructured(
  text: string,
  schemaPrompt: string,
  extraSystem?: string,
): Promise<LlmExtractionResult> {
  if (!API_KEY) {
    return { ok: false, error: "DEEPSEEK_API_KEY 未配置" };
  }

  const systemPrompt = [
    "你是一个企业数据抽取助手。",
    "你的任务是把用户提交的业务材料文本，抽取成严格符合给定 Schema 的 JSON 对象。",
    "",
    "要求：",
    "1. 只返回一个 JSON 对象，不要任何解释、不要 markdown 代码块。",
    "2. 字段缺失时用 null，不要编造。",
    "3. 金额、日期等必须用合法的 JSON 类型（number / string）。",
    "4. 数组字段如果没有数据，返回空数组 []。",
    "",
    "目标 Schema：",
    schemaPrompt,
    "",
    extraSystem || "",
  ].filter(Boolean).join("\n");

  try {
    const { text: raw, usage, durationMs } = await chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `业务材料：\n${text}` },
      ],
      // 推理模型（deepseek-v4-pro）会消耗 reasoning_tokens，max_tokens 需留足
      // 给思考 + 输出，否则 2048 全被 reasoning 吃光、content 为空。
      { jsonMode: true, temperature: 0.1, maxTokens: 6144 },
    );

    // 尝试解析 JSON
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      // 兜底：从 markdown 代码块里提取
      const m = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
      if (m) {
        try { data = JSON.parse(m[1]); } catch {}
      }
    }

    if (!data || typeof data !== "object") {
      return { ok: false, raw, error: "LLM 返回不是合法 JSON 对象", usage, durationMs };
    }

    return { ok: true, data, raw, usage, durationMs };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/**
 * 生成报销领域的 schema 提示词。
 * 后续可以从 Concept.jsonSchema 自动生成，这里硬编码报销场景。
 */
export function buildReimbursementSchemaPrompt(): string {
  return `{
  "id": "string, 报销单号",
  "submitter": {
    "id": "string, 工号",
    "name": "string, 姓名",
    "level": "string, 职级，必须是 P5/P6/M1/M2/M3 之一",
    "department": "string, 所属部门（可选）"
  },
  "costCenter": {
    "id": "string, 成本中心编码",
    "name": "string, 成本中心名称"
  },
  "totalAmount": "number, 报销总金额（如果材料没有明说，等于所有 lines.amount 之和）",
  "employee": { "level": "string, 同 submitter.level，用于规则校验" },
  "lines": [
    {
      "type": "string, 费用类型，必须是 住宿/餐饮/交通/办公/招待/其他 之一",
      "amount": "number, 金额",
      "city": "string, 城市（住宿/差旅必填）",
      "date": "string, 发生日期 YYYY-MM-DD（可选）",
      "invoice": { "number": "string, 发票号", "amount": "number, 发票金额" },
      "customer": "string, 客户名称（招待必填，没有则 null）",
      "project": "string, 项目名称（可选）"
    }
  ]
}`;
}

/**
 * 采购场景 schema 提示词
 */
export function buildProcurementSchemaPrompt(): string {
  return `{
  "id": "string, 采购单号",
  "buyer": {
    "id": "string, 采购员工号",
    "name": "string, 姓名"
  },
  "supplier": {
    "id": "string, 供应商编码",
    "name": "string, 供应商名称",
    "creditCode": "string, 统一社会信用代码（可选）"
  },
  "items": [
    {
      "name": "string, 物料/服务名称",
      "quantity": "number, 数量",
      "unitPrice": "number, 单价",
      "amount": "number, 金额"
    }
  ],
  "totalAmount": "number, 采购总金额"
}`;
}

/**
 * 领域概念字段定义（与 Concept.jsonSchema 对应）
 */
export interface ConceptField {
  name: string;
  type: string;
  required?: boolean;
  label?: string;
  ref?: string;
  itemRef?: string;
  enum?: string[];
}

export interface DomainConceptSchema {
  localName: string;
  labelZh: string;
  description?: string | null;
  fields: ConceptField[];
}

/**
 * 从领域 Concept 的 jsonSchema 自动生成抽取提示词，替代硬编码的报销/采购 schema。
 *
 * 生成策略：
 * - 把每个概念的字段按 {字段名: "type, 说明"} 形式列出；
 * - ref 字段展开为嵌套对象（如 borrower: { id, name }）；
 * - 要求 LLM 把材料抽取成一个"主单据"对象，其中：
 *   · 主单据包含所有非明细概念的内联字段；
 *   · 明细类概念（名字含 Item/Line/Detail）放入 lines 数组；
 *   · 借款类概念（Loan）作为顶层 loan 字段；
 * - 这样规则引擎按 lines[*] / loan.* 等路径就能取到值。
 */
export function buildSchemaPromptFromDomain(
  domainName: string,
  concepts: DomainConceptSchema[],
): string {
  const lines: string[] = [];
  lines.push(`领域：${domainName}`);
  lines.push("从业务材料中抽取一个 JSON 对象，需包含以下概念的字段：");
  lines.push("");

  // 概念字段说明
  for (const c of concepts) {
    lines.push(`【${c.labelZh}（${c.localName}）】${c.description ?? ""}`);
    for (const f of c.fields) {
      const req = f.required ? "必填" : "可选";
      const enumStr = f.enum?.length ? `，枚举: [${f.enum.join(", ")}]` : "";
      const refStr = f.ref ? `，引用 ${f.ref}` : "";
      lines.push(`  - ${f.name} (${f.type}, ${req}): ${f.label ?? ""}${enumStr}${refStr}`);
    }
    lines.push("");
  }

  // 区分明细概念与主/单据概念
  const detailNames = ["item", "line", "detail"];
  const isDetail = (c: DomainConceptSchema) =>
    detailNames.some((k) => c.localName.toLowerCase().includes(k));
  const detailConcepts = concepts.filter(isDetail);
  const mainConcepts = concepts.filter((c) => !isDetail(c));

  lines.push("输出 JSON 结构要求：");
  lines.push("- 返回单个 JSON 对象（不要数组包裹）。");
  // 主单据字段：把所有主概念的字段平铺到顶层
  const mainFields: string[] = [];
  for (const c of mainConcepts) {
    for (const f of c.fields) {
      if (f.type === "ref") {
        // ref 字段展开为嵌套对象
        mainFields.push(`"${f.name}": { "id": "string", "name": "string" }  // ${f.label ?? ""}`);
      } else {
        mainFields.push(`"${f.name}": "${f.type}"  // ${f.label ?? ""}`);
      }
    }
  }
  lines.push("- 顶层对象包含以下字段：");
  for (const mf of mainFields) lines.push(`    ${mf}`);

  // 明细数组
  if (detailConcepts.length > 0) {
    const dc = detailConcepts[0];
    lines.push(`- 把每一条${dc.labelZh}放入 "lines" 数组，每个元素结构：`);
    for (const f of dc.fields) {
      if (f.type === "ref") {
        lines.push(`    "${f.name}": { "number": "string", "amount": "number" }  // ${f.label ?? ""}`);
      } else {
        const enumStr = f.enum?.length ? `，枚举 [${f.enum.join(", ")}]` : "";
        lines.push(`    "${f.name}": "${f.type}"  // ${f.label ?? ""}${enumStr}`);
      }
    }
  }

  lines.push("");
  lines.push("注意：字段缺失用 null，金额用 number，日期用 YYYY-MM-DD 字符串。不要编造材料里没有的数据。");
  return lines.join("\n");
}
