import { NextRequest, NextResponse } from "next/server";
import { autoBuildOntology, type ReusableConcept } from "@/lib/autoBuild";
import { db } from "@/lib/db";

// POST /api/autobuild - 分析材料，返回候选本体
// body: { materials, domainHint?: { code, name, description } }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { materials, domainHint } = body;

  if (!materials || typeof materials !== "string" || materials.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "materials 必填且不能为空" }, { status: 400 });
  }

  // 动态查出平台已有的核心概念（跨领域共享），注入提示词供 LLM 复用——
  // 提示词里不写死任何概念名，核心层扩展了（如新增 Equipment）提示词自动跟上。
  const coreConcepts = await db.concept.findMany({
    where: { scope: "CORE" },
    select: { labelZh: true, description: true, uri: true },
  });
  // Concept 没有 localName 字段，从 uri 反推（core:Person → Person）
  const reusableConcepts: ReusableConcept[] = coreConcepts.map((c) => ({
    localName: c.uri.startsWith("core:") ? c.uri.slice(5) : c.uri,
    labelZh: c.labelZh,
    description: c.description,
  }));

  const result = await autoBuildOntology(materials, domainHint, reusableConcepts);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
