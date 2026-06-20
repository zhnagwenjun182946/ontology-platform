import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/aggregation/domains/[id]/overlap - 这个领域与其他领域的概念重叠矩阵
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const targetDomain = await db.domain.findUnique({ where: { id } });
  if (!targetDomain) return NextResponse.json({ error: "not found" }, { status: 404 });

  const allDomains = await db.domain.findMany();

  // 取本领域所有 concept
  const myConcepts = await db.domainConcept.findMany({
    where: { domainId: id },
    include: { concept: { include: { aliases: true } } },
  });
  const myConceptIds = new Set(myConcepts.map(c => c.linkedConceptId).filter(Boolean) as string[]);

  // 取每个其它领域的 concept
  const overlaps: Array<{
    domainId: string;
    domainCode: string;
    domainName: string;
    sharedConcepts: Array<{ id: string; label: string; uri: string }>;
    pendingEquivalences: number;
  }> = [];

  for (const other of allDomains) {
    if (other.id === id) continue;
    const otherConcepts = await db.domainConcept.findMany({
      where: { domainId: other.id },
      include: { concept: true },
    });
    const shared: Array<{ id: string; label: string; uri: string }> = [];
    let pending = 0;
    for (const oc of otherConcepts) {
      if (!oc.linkedConceptId) continue;
      if (!oc.concept) continue;
      if (myConceptIds.has(oc.linkedConceptId)) {
        shared.push({ id: oc.concept.id, label: oc.concept.labelZh, uri: oc.concept.uri });
      }
    }
    // 查找跨领域 PROPOSED 等价
    const myIds = Array.from(myConceptIds);
    if (myIds.length > 0) {
      const otherIds = otherConcepts.map(c => c.linkedConceptId).filter(Boolean) as string[];
      if (otherIds.length > 0) {
        pending = await db.conceptEquivalence.count({
          where: {
            status: "PROPOSED",
            OR: [
              { conceptAId: { in: myIds }, conceptBId: { in: otherIds } },
              { conceptAId: { in: otherIds }, conceptBId: { in: myIds } },
            ],
          },
        });
      }
    }
    overlaps.push({
      domainId: other.id,
      domainCode: other.code,
      domainName: other.nameZh,
      sharedConcepts: shared,
      pendingEquivalences: pending,
    });
  }

  overlaps.sort((a, b) => b.sharedConcepts.length - a.sharedConcepts.length);

  return NextResponse.json({
    domain: { id: targetDomain.id, code: targetDomain.code, name: targetDomain.nameZh },
    myConceptCount: myConceptIds.size,
    overlaps,
  });
}
