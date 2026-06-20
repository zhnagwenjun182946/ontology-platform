import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";

// GET /api/init - 初始化种子数据
export async function GET(_req: NextRequest) {
  try {
    const seeded = await ensureSeed();
    const conceptCount = await db.concept.count();
    const domainCount = await db.domain.count();
    const ruleCount = await db.rule.count();
    const scenarioCount = await db.scenario.count();
    return NextResponse.json({
      ok: true,
      seeded,
      counts: { concepts: conceptCount, domains: domainCount, rules: ruleCount, scenarios: scenarioCount },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
