import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticate, unauthorizedResponse } from "@/lib/auth";

/**
 * GET /api/v1/scenarios - 所有可用场景列表（Agent 用）
 * 可选 ?domainCode=xxx 过滤
 */
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) return unauthorizedResponse();

  const domainCode = req.nextUrl.searchParams.get("domainCode");
  let domainId: string | undefined;
  if (domainCode) {
    const dom = await db.domain.findUnique({ where: { code: domainCode }, select: { id: true } });
    domainId = dom?.id;
  }
  const where: any = { status: "ACTIVE" };
  if (domainId) where.domainId = domainId;

  const scenarios = await db.scenario.findMany({
    where,
    include: { domain: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    ok: true,
    scenarios: scenarios.map(s => ({
      id: s.id,
      code: s.code,
      name: s.name,
      description: s.description,
      domainCode: s.domain.code,
      domainName: s.domain.nameZh,
    })),
  });
}
