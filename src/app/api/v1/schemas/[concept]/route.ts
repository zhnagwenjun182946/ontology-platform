import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticate, unauthorizedResponse } from "@/lib/auth";
import { parseJsonSchema } from "@/components/ontology/lib";

/**
 * GET /api/v1/schemas/:concept - 概念的标准 JSON Schema（Agent 用）
 *
 * :concept 可以是 concept id、uri、或 labelEn/labelZh。
 * 返回标准 JSON Schema 格式，Agent 可用它验证数据结构、生成表单。
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ concept: string }> }) {
  const auth = await authenticate(req);
  if (!auth) return unauthorizedResponse();

  const { concept: query } = await ctx.params;

  // 多路匹配：id / uri / labelEn / labelZh
  const concept = await db.concept.findFirst({
    where: {
      OR: [
        { id: query },
        { uri: query },
        { labelEn: query },
        { labelZh: query },
      ],
    },
  });

  if (!concept) {
    return NextResponse.json({ ok: false, error: `概念 '${query}' 不存在` }, { status: 404 });
  }

  const fields = parseJsonSchema(concept.jsonSchema);

  // 转成标准 JSON Schema
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const f of fields) {
    const type = jsonSchemaType(f.type);
    const prop: any = { type, description: f.label ?? f.name };

    if (f.enum && f.enum.length > 0) {
      prop.enum = f.enum;
    }
    if (f.ref) {
      // ref 字段：对象引用
      prop.type = "object";
      prop.description = `${f.label ?? f.name}（引用 ${f.ref}）`;
    }

    properties[f.name] = prop;
    if (f.required) required.push(f.name);
  }

  const jsonSchema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: concept.labelZh,
    description: concept.description ?? undefined,
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
  };

  return NextResponse.json({
    ok: true,
    concept: {
      id: concept.id,
      uri: concept.uri,
      labelZh: concept.labelZh,
      labelEn: concept.labelEn,
      scope: concept.scope,
      description: concept.description,
    },
    jsonSchema,
  });
}

function jsonSchemaType(t: string): string {
  switch (t) {
    case "string": return "string";
    case "number": return "number";
    case "date": return "string"; // ISO 日期字符串
    case "boolean": return "boolean";
    case "ref": return "object";
    case "array": return "array";
    default: return "string";
  }
}
