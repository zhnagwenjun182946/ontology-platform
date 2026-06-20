import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/aggregation/overlap-matrix - 全平台领域概念重叠矩阵
// 返回 NxN 矩阵，每个 cell 是两个领域共享的概念列表
export async function GET(_req: NextRequest) {
  const domains = await db.domain.findMany({
    where: { status: "ACTIVE" },
    include: {
      concepts: { include: { concept: { include: { aliases: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  // 每个领域的 conceptId 集合
  const domainConcepts = new Map<string, Set<string>>();
  const conceptInfo = new Map<string, { id: string; uri: string; label: string }>();
  for (const d of domains) {
    const set = new Set<string>();
    for (const dc of d.concepts) {
      if (dc.linkedConceptId) {
        set.add(dc.linkedConceptId);
        if (!conceptInfo.has(dc.linkedConceptId)) {
          conceptInfo.set(dc.linkedConceptId, {
            id: dc.concept.id,
            uri: dc.concept.uri,
            label: dc.concept.labelZh,
          });
        }
      }
    }
    domainConcepts.set(d.id, set);
  }

  // 等价关系图（Union-Find）
  const eqs = await db.conceptEquivalence.findMany({
    where: { status: { in: ["CONFIRMED", "PROPOSED"] } },
  });
  const parent = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    let cur = x;
    while (parent.get(cur) !== cur) cur = parent.get(cur)!;
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
  for (const e of eqs) {
    if (e.equivalenceType === "EXACT") union(e.conceptAId, e.conceptBId);
  }

  // 计算矩阵
  const matrix: Array<{
    a: { id: string; code: string; name: string; color: string };
    b: { id: string; code: string; name: string; color: string };
    sharedConcepts: Array<{ id: string; uri: string; label: string }>;
    pendingEquivalences: number;
  }> = [];

  const pendingMap = new Map<string, number>();
  for (const e of eqs) {
    if (e.status === "PROPOSED") {
      const key = [e.conceptAId, e.conceptBId].sort().join("|");
      pendingMap.set(key, (pendingMap.get(key) ?? 0) + 1);
    }
  }

  for (let i = 0; i < domains.length; i++) {
    for (let j = i + 1; j < domains.length; j++) {
      const a = domains[i];
      const b = domains[j];
      const setA = domainConcepts.get(a.id)!;
      const setB = domainConcepts.get(b.id)!;

      // 直接共享
      const directShared: string[] = [];
      for (const id of setA) {
        if (setB.has(id)) directShared.push(id);
      }

      // 通过等价关系共享
      const equivShared: string[] = [];
      for (const idA of setA) {
        if (directShared.includes(idA)) continue;
        const rootA = find(idA);
        for (const idB of setB) {
          if (directShared.includes(idB)) continue;
          if (find(idB) === rootA) {
            equivShared.push(idA);
            break;
          }
        }
      }

      const allShared = [...new Set([...directShared, ...equivShared])];
      const sharedConcepts = allShared
        .map(id => conceptInfo.get(id))
        .filter(Boolean)
        .map(c => ({ id: c!.id, uri: c!.uri, label: c!.label }));

      // 待评审等价数
      let pending = 0;
      for (const idA of setA) {
        for (const idB of setB) {
          const key = [idA, idB].sort().join("|");
          pending += pendingMap.get(key) ?? 0;
        }
      }

      matrix.push({
        a: { id: a.id, code: a.code, name: a.nameZh, color: a.color ?? "#64748b" },
        b: { id: b.id, code: b.code, name: b.nameZh, color: b.color ?? "#64748b" },
        sharedConcepts,
        pendingEquivalences: pending,
      });
    }
  }

  // 按共享数排序
  matrix.sort((x, y) => y.sharedConcepts.length - x.sharedConcepts.length);

  return NextResponse.json({
    domains: domains.map(d => ({
      id: d.id, code: d.code, name: d.nameZh, color: d.color,
      conceptCount: domainConcepts.get(d.id)?.size ?? 0,
    })),
    matrix,
  });
}
