import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [asA, asB] = await Promise.all([
    db.conceptEquivalence.findMany({
      where: { conceptAId: id },
      include: { conceptB: true },
    }),
    db.conceptEquivalence.findMany({
      where: { conceptBId: id },
      include: { conceptA: true },
    }),
  ]);
  return NextResponse.json({ asA, asB });
}

// PATCH /api/concepts/[id]/equivalences - 评审等价关系
// body: { equivalenceId, status: "CONFIRMED" | "REJECTED" }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { equivalenceId, status } = body;

  if (!equivalenceId || !["CONFIRMED", "REJECTED"].includes(status)) {
    return NextResponse.json({ error: "需要 equivalenceId 和 status (CONFIRMED|REJECTED)" }, { status: 400 });
  }

  const before = await db.conceptEquivalence.findUnique({ where: { id: equivalenceId } });
  if (!before) return NextResponse.json({ error: "等价关系不存在" }, { status: 404 });
  // 确保该等价关系属于这个概念
  if (before.conceptAId !== id && before.conceptBId !== id) {
    return NextResponse.json({ error: "等价关系不属于该概念" }, { status: 403 });
  }

  const updated = await db.conceptEquivalence.update({
    where: { id: equivalenceId },
    data: { status },
  });

  await db.auditLog.create({
    data: {
      actor: "web",
      action: "REVIEW_EQUIVALENCE",
      entityType: "ConceptEquivalence",
      entityId: equivalenceId,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(updated),
    },
  });

  return NextResponse.json(updated);
}
