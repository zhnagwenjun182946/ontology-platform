import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const domainId = req.nextUrl.searchParams.get("domainId");
  const where: any = {};
  if (domainId) where.domainId = domainId;
  const scenarios = await db.scenario.findMany({
    where,
    include: { domain: true, _count: { select: { runs: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(scenarios);
}
