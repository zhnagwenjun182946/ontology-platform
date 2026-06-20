import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { executeValidation } from "@/lib/validation-engine";

// GET /api/runs?limit=
export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20", 10);
  const runs = await db.runRecord.findMany({
    take: limit,
    orderBy: { startedAt: "desc" },
    include: {
      scenario: { include: { domain: true } },
      _count: { select: { findings: true, extracted: true } },
    },
  });
  return NextResponse.json(runs);
}

// POST /api/runs - 创建一次运行（同步执行）
// body: { scenarioId, mode: "json"|"text", payload | text }
//   - mode="json":  payload 为已结构化对象，直接跑规则
//   - mode="text":  text 为业务材料原文，先调 DeepSeek 抽取，再跑规则
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { scenarioId, mode = "json" } = body;

  const scenario = await db.scenario.findUnique({
    where: { id: scenarioId },
    include: { domain: true },
  });
  if (!scenario) return NextResponse.json({ error: "scenario not found" }, { status: 404 });

  // 创建 run
  const inputDocs = mode === "text" ? [body.text] : [body.payload];
  const run = await db.runRecord.create({
    data: {
      scenarioId,
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

    const summary = mode === "text"
      ? `LLM 抽取 ${result.extractionMeta?.durationMs ?? 0}ms · 共执行 ${result.rules.length} 条规则，命中 ${result.findings.length} 条（错误 ${errorCount} / 警告 ${warnCount}）`
      : `共执行 ${result.rules.length} 条规则，命中 ${result.findings.length} 条（错误 ${errorCount} / 警告 ${warnCount}）`;

    const updated = await db.runRecord.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        summary,
        // 留存 LLM 抽取完整结果 + 调用元信息
        extractionJson: JSON.stringify(result.payloadObj),
        extractionMeta: result.extractionMeta ? JSON.stringify(result.extractionMeta) : null,
      },
    });

    // 运行成功审计
    await db.auditLog.create({
      data: {
        actor: "web",
        action: "CREATE_RUN",
        entityType: "RunRecord",
        entityId: run.id,
        afterJson: JSON.stringify({
          scenarioId,
          scenarioName: scenario.name,
          domainCode: scenario.domain.code,
          mode,
          status: "SUCCESS",
          ruleCount: result.rules.length,
          findingsCount: result.findings.length,
          extractedCount: result.extractedObjects.length,
        }),
      },
    });

    if (mode === "text") {
      console.log(`[Run] 抽取成功 run=${run.id} 耗时=${result.extractionMeta?.durationMs ?? 0}ms 对象字段=${Object.keys(result.payloadObj || {}).join(',')}`);
    }
    console.log(`[Run] 完成 run=${run.id} 规则=${result.rules.length} 命中=${result.findings.length}(err=${errorCount}/warn=${warnCount}) 抽取对象=${result.extractedObjects.length}`);

    return NextResponse.json({
      ...updated,
      // db.runRecord.update 不 include scenario，这里补上已加载的 scenario（含 domain），
      // 供前端运行报告展示场景名/领域名，避免显示「未知场景/未知领域」
      scenario,
      findings: result.findings,
      extracted: result.extractedObjects.map((o, i) => ({
        ...o,
        // createMany 不回填 id，用 runId+序号生成稳定唯一 id（前端用作 key）
        id: `${run.id}#${i}`,
        jsonPayload: JSON.parse(o.jsonPayload),
      })),
      extractedCount: result.extractedObjects.length,
      ruleCount: result.rules.length,
      extraction: result.extractionMeta,
      payload: result.payloadObj,
    });
  } catch (e: any) {
    await db.runRecord.update({
      where: { id: run.id },
      data: { status: "FAILED", error: e.message, finishedAt: new Date() },
    });
    // 运行失败审计
    await db.auditLog.create({
      data: {
        actor: "web",
        action: "RUN_FAILED",
        entityType: "RunRecord",
        entityId: run.id,
        afterJson: JSON.stringify({
          scenarioId,
          scenarioName: scenario.name,
          domainCode: scenario.domain.code,
          mode,
          status: "FAILED",
          error: e.message,
        }),
      },
    });
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
