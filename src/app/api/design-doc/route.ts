import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// GET /api/design-doc - 返回设计文档原文
export async function GET(_req: NextRequest) {
  try {
    const docPath = path.join(process.cwd(), "ONTOLOGY_PLATFORM_DESIGN.md");
    const content = await fs.readFile(docPath, "utf-8");
    return NextResponse.json({ content });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
