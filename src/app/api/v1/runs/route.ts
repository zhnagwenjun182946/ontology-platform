import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticate, unauthorizedResponse } from "@/lib/auth";
import { executeValidation, toAgentFinding } from "@/lib/validation-engine";
import { generateRunReport } from "@/components/ontology/runReport";
import type { AgentRunResponse } from "@/lib/agent-types";

/**
 * POST /api/v1/runs - Agent 专用运行接口
 *
 * 鉴权：X-API-Key header 或 Authorization: Bearer <key>
 *
 * body: {
 *   scenarioId: string,         // 场景 ID
 *   mode: "text" | "json",      // text=传文本LLM抽取, json=传结构化数据
 *   text?: string,              // mode=text 时提供
 *   payload?: object,           // mode=json 时提供
 *   report?: boolean,           // 是否返回 Markdown 报告（默认 false）
 * }
 *
 * 返回 AgentRunResponse：结构化 findings + 抽取对象 + 可选报告
 */
export async function POST(req: NextRequest) {
  // 鉴权
  const auth = await authenticate(req);
  if (!auth) return unauthorizedResponse();

  const body = await req.json();
  const { scenarioId, mode = "text", report = false } = body;

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

  // 创建 run 记录（租户预留）
  const inputDocs = mode === "text" ? [body.text ?? ""] : [body.payload ?? {}];
  const run = await db.runRecord.create({
    data: {
      scenarioId,
      tenantId: auth.tenantId,
      domainVersion: scenario.domain.activeVersion ?? "0.0.0",
      inputDocuments: JSON.stringify(inputDocs),
      status: "RUNNING",
    },
  });

  try {
    const input = mode === "text" ? (body.text ?? "") : (body.payload ?? {});
    const result = await executeValidation(scenario, mode, input, run.id);

    // 落库
    if (result.findings.length > 0) {
      await db.finding.createMany({ data: result.findings });
    }
    if (result.extractedObjects.length > 0) {
      await db.extractedObject.createMany({ data: result.extractedObjects });
    }

    const errorCount = result.findings.filter(f => f.severity === "ERROR").length;
    const warnCount = result.findings.filter(f => f.severity === "WARNING").length;
    const infoCount = result.findings.filter(f => f.severity === "INFO").length;

    const summary = mode === "text"
      ? `LLM 抽取 ${result.extractionMeta?.durationMs ?? 0}ms · 共执行 ${result.rules.length} 条规则，命中 ${result.findings.length} 条（错误 ${errorCount} / 警告 ${warnCount}）`
      : `共执行 ${result.rules.length} 条规则，命中 ${result.findings.length} 条（错误 ${errorCount} / 警告 ${warnCount}）`;

    const updated = await db.runRecord.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        summary,
        extractionJson: JSON.stringify(result.payloadObj),
        extractionMeta: result.extractionMeta ? JSON.stringify(result.extractionMeta) : null,
      },
    });

    // 审计
    await db.auditLog.create({
      data: {
        actor: `api:${auth.apiKeyId}`,
        action: "CREATE_RUN",
        entityType: "RunRecord",
        entityId: run.id,
        afterJson: JSON.stringify({
          scenarioId, scenarioName: scenario.name,
          domainCode: scenario.domain.code, mode,
          status: "SUCCESS", ruleCount: result.rules.length,
          findingsCount: result.findings.length,
          extractedCount: result.extractedObjects.length,
          tenantId: auth.tenantId,
        }),
      },
    });

    console.log(`[V1/Runs] tenant=${auth.tenantId} run=${run.id} 规则=${result.rules.length} 命中=${result.findings.length}(err=${errorCount}/warn=${warnCount}) 抽取=${result.extractedObjects.length}`);

    // 构造 Agent 友好的响应
    const agentFindings = result.findings.map(toAgentFinding);

    const response: AgentRunResponse = {
      ok: true,
      runId: run.id,
      status: "SUCCESS",
      passed: result.findings.length === 0,
      summary: {
        totalFindings: result.findings.length,
        errors: errorCount,
        warnings: warnCount,
        infos: infoCount,
        extractedCount: result.extractedObjects.length,
        ruleCount: result.rules.length,
      },
      findings: agentFindings,
      extracted: result.extractedObjects.map((o, i) => ({
        id: `${run.id}#${i}`,
        conceptLabel: o.conceptLabel,
        jsonPayload: JSON.parse(o.jsonPayload),
      })),
      extraction: result.extractionMeta ? {
        ok: result.extractionMeta.ok,
        durationMs: result.extractionMeta.durationMs,
        usage: result.extractionMeta.usage,
      } : null,
    };

    // 可选：附 Markdown 报告
    if (report) {
      response.report = generateRunReport({
        id: run.id,
        status: "SUCCESS",
        summary,
        startedAt: run.startedAt.toISOString(),
        finishedAt: updated.finishedAt?.toISOString() ?? null,
        error: null,
        extractionMeta: result.extractionMeta ? JSON.stringify(result.extractionMeta) : null,
        scenario: { name: scenario.name, domain: { code: scenario.domain.code, nameZh: scenario.domain.nameZh } },
        findings: result.findings.map(f => ({
          ruleCode: f.ruleCode,
          severity: f.severity,
          targetPath: f.targetPath,
          message: f.message,
          contextJson: f.contextJson,
        })),
        extracted: result.extractedObjects.map((o, i) => ({
          id: `${run.id}#${i}`,
          conceptLabel: o.conceptLabel,
          jsonPayload: JSON.parse(o.jsonPayload),
        })),
      });
    }

    return NextResponse.json(response);
  } catch (e: any) {
    await db.runRecord.update({
      where: { id: run.id },
      data: { status: "FAILED", error: e.message, finishedAt: new Date() },
    });
    await db.auditLog.create({
      data: {
        actor: `api:${auth.apiKeyId}`,
        action: "RUN_FAILED",
        entityType: "RunRecord",
        entityId: run.id,
        afterJson: JSON.stringify({
          scenarioId, mode, status: "FAILED",
          error: e.message, tenantId: auth.tenantId,
        }),
      },
    });
    return NextResponse.json({
      ok: false,
      runId: run.id,
      status: "FAILED",
      error: e.message,
    }, { status: 500 });
  }
}
