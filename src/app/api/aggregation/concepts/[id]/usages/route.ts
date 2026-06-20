import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/aggregation/concepts/[id]/usages - 这个概念被谁引用
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [rules, domains, equivalences] = await Promise.all([
    db.rule.findMany({
      where: { targetConceptId: id },
      include: { ruleset: { include: { domain: true } } },
    }),
    db.domainConcept.findMany({
      where: { linkedConceptId: id },
      include: { domain: true },
    }),
    db.conceptEquivalence.findMany({
      where: { OR: [{ conceptAId: id }, { conceptBId: id }] },
      include: { conceptA: true, conceptB: true },
    }),
  ]);

  return NextResponse.json({
    rules: rules.map(r => ({
      id: r.id, code: r.code, name: r.name,
      severity: r.severity, domain: r.ruleset.domain.nameZh,
    })),
    domains: domains.map(d => ({
      id: d.domain.id, code: d.domain.code, name: d.domain.nameZh,
      localName: d.localName,
    })),
    equivalences: equivalences.map(e => ({
      id: e.id,
      type: e.equivalenceType,
      status: e.status,
      other: e.conceptAId === id ? e.conceptB : e.conceptA,
      evidence: e.evidence,
      note: e.note,
    })),
  });
}
