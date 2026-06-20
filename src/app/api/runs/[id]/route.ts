import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = await db.runRecord.findUnique({
    where: { id },
    include: {
      scenario: { include: { domain: true } },
      findings: { include: { rule: true }, orderBy: { severity: "asc" } },
      // 按 createdAt 升序保证 lines[N]/items[N] 索引映射可靠
      extracted: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
}
