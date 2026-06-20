import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/dashboard/trends - Findings 趋势 + Top 命中规则
export async function GET(_req: NextRequest) {
  // 1. 按天聚合 Findings（最近 14 天）
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const findings = await db.finding.findMany({
    where: { createdAt: { gte: since } },
    select: { severity: true, createdAt: true, ruleId: true, ruleCode: true },
  });

  // 按天分桶
  const dayMap = new Map<string, { ERROR: number; WARNING: number; INFO: number }>();
  for (const f of findings) {
    const day = f.createdAt.toISOString().slice(0, 10);
    if (!dayMap.has(day)) dayMap.set(day, { ERROR: 0, WARNING: 0, INFO: 0 });
    const bucket = dayMap.get(day)!;
    if (f.severity === "ERROR") bucket.ERROR++;
    else if (f.severity === "WARNING") bucket.WARNING++;
    else bucket.INFO++;
  }
  const trend = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, counts]) => ({ day, ...counts }));

  // 2. Top 命中规则（按命中次数）
  const ruleHitMap = new Map<string, { ruleCode: string; count: number; severity: string }>();
  for (const f of findings) {
    const key = f.ruleCode || "unknown";
    if (!ruleHitMap.has(key)) {
      ruleHitMap.set(key, { ruleCode: key, count: 0, severity: f.severity });
    }
    ruleHitMap.get(key)!.count++;
  }
  const topRules = Array.from(ruleHitMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 3. 按领域聚合 Findings（通过 run → scenario → domain）
  const runs = await db.runRecord.findMany({
    where: { startedAt: { gte: since } },
    include: {
      scenario: { include: { domain: true } },
      findings: { select: { severity: true } },
    },
  });
  const domainMap = new Map<string, { domain: string; domainCode: string; total: number; error: number; warning: number; info: number; runs: number }>();
  for (const r of runs) {
    const code = r.scenario?.domain?.code ?? "unknown";
    const name = r.scenario?.domain?.nameZh ?? "未知";
    if (!domainMap.has(code)) {
      domainMap.set(code, { domain: name, domainCode: code, total: 0, error: 0, warning: 0, info: 0, runs: 0 });
    }
    const d = domainMap.get(code)!;
    d.runs++;
    for (const f of r.findings) {
      d.total++;
      if (f.severity === "ERROR") d.error++;
      else if (f.severity === "WARNING") d.warning++;
      else d.info++;
    }
  }
  const domainStats = Array.from(domainMap.values());

  return NextResponse.json({
    window: { since: since.toISOString(), until: new Date().toISOString() },
    totalFindings: findings.length,
    trend,
    topRules,
    domainStats,
  });
}
