import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticate, unauthorizedResponse } from "@/lib/auth";

/**
 * GET /api/v1/domains - 领域 + 场景目录（Agent 用）
 * 返回精简结构，便于 Agent 选择 scenarioId
 */
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) return unauthorizedResponse();

  const domains = await db.domain.findMany({
    where: { status: "ACTIVE" },
    include: {
      scenarios: {
        where: { status: "ACTIVE" },
        select: { id: true, code: true, name: true, description: true },
      },
      _count: { select: { concepts: true, rulesets: true } },
    },
    orderBy: { nameZh: "asc" },
  });

  return NextResponse.json({
    ok: true,
    domains: domains.map(d => ({
      id: d.id,
      code: d.code,
      name: d.nameZh,
      description: d.description,
      conceptCount: d._count.concepts,
      rulesetCount: d._count.rulesets,
      scenarios: d.scenarios.map(s => ({
        id: s.id,
        code: s.code,
        name: s.name,
        description: s.description,
      })),
    })),
  });
}
