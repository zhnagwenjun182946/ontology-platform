import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const findings = await db.finding.findMany({
    where: { runId: id },
    include: { rule: true },
    orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(findings);
}
