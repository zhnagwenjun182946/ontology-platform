import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticate, unauthorizedResponse } from "@/lib/auth";
import { executeValidation, toAgentFinding } from "@/lib/validation-engine";
import type { AgentValidateResponse } from "@/lib/agent-types";

/**
 * POST /api/v1/validate - 无副作用校验接口（不落库，纯计算）
 *
 * 鉴权：X-API-Key header 或 Authorization: Bearer <key>
 *
 * body: {
 *   scenarioId: string,
 *   mode: "text" | "json",
 *   text?: string,
 *   payload?: object,
 * }
 *
 * 返回 AgentValidateResponse：结构化 findings，不写 DB
 */
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) return unauthorizedResponse();

  const body = await req.json();
  const { scenarioId, mode = "json" } = body;

  if (!scenarioId) {
    return NextResponse.json({ ok: false, error: "scenarioId 必填" }, { status: 400 });
  }

  const scenario = await db.scenario.findUnique({
    where: { id: scenarioId },
    include: { domain: true },
  });
  if (!scenario) {
    return NextResponse.json({ ok: false, error: "场景不存在" }, { status: 404 });
  }

  try {
    const input = mode === "text" ? (body.text ?? "") : (body.payload ?? {});
    const result = await executeValidation(scenario, mode, input, "validate-temp");

    const errorCount = result.findings.filter(f => f.severity === "ERROR").length;
    const warnCount = result.findings.filter(f => f.severity === "WARNING").length;
    const infoCount = result.findings.filter(f => f.severity === "INFO").length;

    const agentFindings = result.findings.map(toAgentFinding);

    const response: AgentValidateResponse = {
      ok: true,
      passed: result.findings.length === 0,
      summary: {
        totalFindings: result.findings.length,
        errors: errorCount,
        warnings: warnCount,
        infos: infoCount,
        ruleCount: result.rules.length,
      },
      findings: agentFindings,
    };

    console.log(`[V1/Validate] tenant=${auth.tenantId} scenario=${scenarioId} 规则=${result.rules.length} 命中=${result.findings.length}(err=${errorCount}/warn=${warnCount})`);

    return NextResponse.json(response);
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e.message,
    }, { status: 500 });
  }
}
