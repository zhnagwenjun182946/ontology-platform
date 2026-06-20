import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/aggregation/map - 全平台概念地图（去重后）
// 把所有 Concept 合并，按等价关系聚合，输出每个"概念簇"
export async function GET(_req: NextRequest) {
  const concepts = await db.concept.findMany({
    include: { aliases: true, ownerDomain: true },
  });
  const eqs = await db.conceptEquivalence.findMany({
    where: { status: { in: ["CONFIRMED", "PROPOSED"] } },
    include: { conceptA: true, conceptB: true },
  });

  // Union-Find 聚类
  const parent = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    let cur = x;
    while (parent.get(cur) !== cur) {
      cur = parent.get(cur)!;
    }
    let p = x;
    while (parent.get(p) !== cur) {
      const next = parent.get(p)!;
      parent.set(p, cur);
      p = next;
    }
    return cur;
  }
  function union(a: string, b: string) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const c of concepts) parent.set(c.id, c.id);
  for (const e of eqs) {
    if (e.equivalenceType === "EXACT") union(e.conceptAId, e.conceptBId);
  }

  // 按簇分组
  const clusters = new Map<string, string[]>();
  for (const c of concepts) {
    const root = find(c.id);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(c.id);
  }

  // 输出
  const conceptMap = new Map(concepts.map(c => [c.id, c]));
  const result = Array.from(clusters.values()).map(ids => {
    const members = ids.map(id => conceptMap.get(id)!);
    const core = members.find(m => m.scope === "CORE");
    const representative = core ?? members[0];
    return {
      clusterId: representative.id,
      representativeLabel: representative.labelZh,
      representativeUri: representative.uri,
      hasCore: !!core,
      memberCount: members.length,
      members: members.map(m => ({
        id: m.id,
        uri: m.uri,
        label: m.labelZh,
        scope: m.scope,
        domain: m.ownerDomain?.nameZh ?? null,
        domainCode: m.ownerDomain?.code ?? null,
      })),
      aliases: members.flatMap(m => m.aliases.map(a => a.alias)),
      pendingEquivalences: eqs.filter(e =>
        ids.includes(e.conceptAId) && ids.includes(e.conceptBId) && e.status === "PROPOSED"
      ).length,
    };
  });

  // 按是否含 core、member 数排序
  result.sort((a, b) => {
    if (a.hasCore !== b.hasCore) return a.hasCore ? -1 : 1;
    return b.memberCount - a.memberCount;
  });

  return NextResponse.json({
    totalConcepts: concepts.length,
    totalClusters: result.length,
    totalEquivalences: eqs.length,
    clusters: result,
  });
}
