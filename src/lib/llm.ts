/**
 * DeepSeek LLM 客户端 - 服务端使用
 *
 * 用于把"业务提交材料文本"抽取成结构化对象。
 * DeepSeek API 兼容 OpenAI Chat Completions 格式。
 */

import {
  conceptToSingularField,
  conceptToPluralField,
  isDetailConceptResolved,
} from "@/lib/concept-field";

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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek API ${res.status}: ${errText.slice(0, 500)}`);
  }

  const json = await res.json();
  // 注意：耗时要在读完响应体之后再算——推理模型会流式输出大量内容，
  // 头部很快返回但 body 读取可能耗时很久，在 fetch 之后立即计时会严重偏低。
  const durationMs = Date.now() - start;
  const text = json.choices?.[0]?.message?.content ?? "";
  const u = json.usage;
  // 业务日志：记录 LLM 调用耗时、token 消耗（含 reasoning_tokens 诊断）
  const reasonTok = u?.completion_tokens_details?.reasoning_tokens ?? 0;
  console.log(
    `[LLM] ${MODEL} ${durationMs}ms | prompt=${u?.prompt_tokens ?? '-'} completion=${u?.completion_tokens ?? '-'} (reasoning=${reasonTok}) | contentLen=${text.length}${text.length === 0 ? ' ⚠️空内容' : ''}`,
  );
  return { text, usage: u, durationMs };
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
 * 从领域 Concept 的 jsonSchema 自动生成抽取提示词。
 *
 * 输出结构约定（与 validation-engine 实体抽取、规则 targetPath 闭环）：
 *   - 顶层每个概念一个字段，字段名 = 概念名转字段名：
 *       主概念（非明细）→ 单数字段（Employee → employee），值为对象或 null
 *       明细概念 → 复数字段（AccommodationFee → accommodationFees），值为数组
 *   - 这样多条主概念不会互相覆盖（旧实现把主概念字段平铺到顶层，
 *     Employee.id 与 TravelRequest.id 会产生重复 id 字段）。
 *   - 规则里 `travelRequest.applicant.level`、`accommodationFees[*]` 等路径
 *     与抽取字段名一一对应。
 */
export function buildSchemaPromptFromDomain(
  domainName: string,
  concepts: DomainConceptSchema[],
  detailSet?: Set<string>,
): string {
  const lines: string[] = [];
  lines.push(`领域：${domainName}`);
  lines.push("从业务材料中抽取一个 JSON 对象，顶层每个概念对应一个字段。");
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

  // 明细集合：优先用关系推导（detailSet），无则按名字兜底
  const resolvedDetailSet = detailSet ?? new Set<string>();

  lines.push("输出 JSON 结构要求：");
  lines.push("- 返回单个 JSON 对象（不要数组包裹）。");
  lines.push("- 顶层每个概念一个字段，字段名与结构如下：");

  for (const c of concepts) {
    const isDetail = isDetailConceptResolved(c.localName, resolvedDetailSet);
    const field = isDetail
      ? conceptToPluralField(c.localName)
      : conceptToSingularField(c.localName);
    const fieldBlock = renderConceptFields(c.fields);
    if (isDetail) {
      lines.push(`    "${field}": [ {`);
      lines.push(...fieldBlock.map((l) => `      ${l}`));
      lines.push(`    } ]  // ${c.labelZh}；没有该类费用用空数组 []，不要省略字段`);
    } else {
      lines.push(`    "${field}": {`);
      lines.push(...fieldBlock.map((l) => `      ${l}`));
      lines.push(`    }  // ${c.labelZh}；材料里没有则 null`);
    }
  }

  lines.push("");
  lines.push("注意：字段缺失用 null，金额用 number，日期用 YYYY-MM-DD 字符串。不要编造材料里没有的数据。");
  return lines.join("\n");
}

/** 渲染单个概念的内部字段块（不含外层 { }）。 */
function renderConceptFields(fields: ConceptField[]): string[] {
  return fields.map((f) => {
    if (f.type === "ref") {
      return `"${f.name}": { "id": "string", "name": "string" },  // ${f.label ?? ""}`;
    }
    const enumStr = f.enum?.length ? `，枚举 [${f.enum.join(", ")}]` : "";
    return `"${f.name}": "${f.type}",  // ${f.label ?? ""}${enumStr}`;
  });
}
