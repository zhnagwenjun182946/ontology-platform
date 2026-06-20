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
