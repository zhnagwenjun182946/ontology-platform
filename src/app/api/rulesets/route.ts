import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const domainId = req.nextUrl.searchParams.get("domainId");
  const where: any = {};
  if (domainId) where.domainId = domainId;
  const rulesets = await db.ruleSet.findMany({
    where,
    include: { domain: true, _count: { select: { rules: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rulesets);
}
