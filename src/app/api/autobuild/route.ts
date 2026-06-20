import { NextRequest, NextResponse } from "next/server";
import { autoBuildOntology } from "@/lib/autoBuild";

// POST /api/autobuild - 分析材料，返回候选本体
// body: { materials, domainHint?: { code, name, description } }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { materials, domainHint } = body;

  if (!materials || typeof materials !== "string" || materials.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "materials 必填且不能为空" }, { status: 400 });
  }

  const result = await autoBuildOntology(materials, domainHint);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
