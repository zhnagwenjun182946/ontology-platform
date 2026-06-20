import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const domainId = req.nextUrl.searchParams.get("domainId");
  const rulesetId = req.nextUrl.searchParams.get("rulesetId");
  const where: any = {};
  if (rulesetId) where.rulesetId = rulesetId;
  if (domainId) where.ruleset = { domainId };

  const rules = await db.rule.findMany({
    where,
    include: {
      ruleset: { include: { domain: true } },
      targetConcept: true,
      _count: { select: { tests: true, findings: true } },
    },
    orderBy: { code: "asc" },
  });
  return NextResponse.json(rules);
}
