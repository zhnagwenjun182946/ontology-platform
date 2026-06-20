import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest) {
  const [
    conceptCount, domainCount, ruleCount, scenarioCount,
    runCount, findingCount, coreCount, equivalenceCount, pendingEqCount,
    recentRuns, findingsBySeverity, rulesBySeverity, domainsWithCounts,
  ] = await Promise.all([
    db.concept.count(),
    db.domain.count(),
    db.rule.count(),
    db.scenario.count(),
    db.runRecord.count(),
    db.finding.count(),
    db.concept.count({ where: { scope: "CORE" } }),
    db.conceptEquivalence.count(),
    db.conceptEquivalence.count({ where: { status: "PROPOSED" } }),
    db.runRecord.findMany({ take: 5, orderBy: { startedAt: "desc" }, include: { scenario: { include: { domain: true } } } }),
    db.finding.groupBy({ by: ["severity"], _count: true }),
    db.rule.groupBy({ by: ["severity"], _count: true }),
    db.domain.findMany({ include: { _count: { select: { concepts: true, rulesets: true } } } }),
  ]);

  return NextResponse.json({
    concepts: conceptCount, coreConcepts: coreCount, domains: domainCount,
    rules: ruleCount, scenarios: scenarioCount, runs: runCount,
    findings: findingCount, equivalences: equivalenceCount, pendingEquivalences: pendingEqCount,
    recentRuns, findingsBySeverity, rulesBySeverity, domainsWithCounts,
  });
}
