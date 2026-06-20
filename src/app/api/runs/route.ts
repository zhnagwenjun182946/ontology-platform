import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  parseDsl, evaluateWhen, renderMessage, builtinFunctions,
} from "@/lib/dsl/parser";
import {
  extractStructured,
  buildReimbursementSchemaPrompt,
  buildProcurementSchemaPrompt,
  buildSchemaPromptFromDomain,
  type DomainConceptSchema,
} from "@/lib/llm";

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

  const rulesetIds: string[] = JSON.parse(scenario.rulesetIds || "[]");
  const rules = await db.rule.findMany({
    where: { rulesetId: { in: rulesetIds }, status: "PUBLISHED" },
    include: { targetConcept: true },
  });

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
    let payloadObj: any;
    let extractionMeta: any = null;

    if (mode === "text") {
      // 调 LLM 抽取
      const text: string = body.text ?? "";
      if (!text.trim()) {
        throw new Error("文本输入为空");
      }

      // 根据领域选 schema：优先从领域 Concept.jsonSchema 自动生成，
      // 兜底用硬编码的报销/采购 schema
      let schemaPrompt: string;
      const domainCode = scenario.domain.code;
      if (domainCode === "reimbursement") {
        schemaPrompt = buildReimbursementSchemaPrompt();
      } else if (domainCode === "procurement") {
        schemaPrompt = buildProcurementSchemaPrompt();
      } else {
        // 从领域概念自动生成抽取 schema
        const domainConcepts = await db.domainConcept.findMany({
          where: { domainId: scenario.domainId },
          include: { concept: true },
        });
        const conceptSchemas: DomainConceptSchema[] = domainConcepts.map((dc) => ({
          localName: dc.localName,
          labelZh: dc.concept?.labelZh ?? dc.localName,
          description: dc.concept?.description ?? null,
          fields: (() => {
            try {
              return JSON.parse(dc.concept?.jsonSchema ?? "[]");
            } catch {
              return [];
            }
          })(),
        }));
        schemaPrompt = conceptSchemas.length > 0
          ? buildSchemaPromptFromDomain(scenario.domain.nameZh, conceptSchemas)
          : "{}";
      }

      const result = await extractStructured(text, schemaPrompt);
      extractionMeta = {
        ok: result.ok,
        error: result.error,
        usage: result.usage,
        durationMs: result.durationMs,
        raw: result.raw,
      };

      if (!result.ok || !result.data) {
        await db.runRecord.update({
          where: { id: run.id },
          data: {
            status: "FAILED",
            error: `LLM 抽取失败: ${result.error}`,
            finishedAt: new Date(),
          },
        });
        return NextResponse.json({
          ok: false,
          runId: run.id,
          extraction: extractionMeta,
          error: result.error,
        }, { status: 500 });
      }

      payloadObj = result.data;
    } else {
      // JSON 模式：直接用 payload
      payloadObj = typeof body.payload === "string" ? JSON.parse(body.payload) : body.payload;
    }

    const findings: any[] = [];
    const extractedObjects: any[] = [];

    // 记录抽取的对象（通用：lines/items 明细数组 + 主单据/借款等嵌套对象）
    if (Array.isArray(payloadObj?.lines)) {
      for (const line of payloadObj.lines) {
        extractedObjects.push({
          runId: run.id,
          conceptLabel: "ExpenseItem",
          jsonPayload: JSON.stringify(line),
        });
      }
    }
    if (Array.isArray(payloadObj?.items)) {
      for (const item of payloadObj.items) {
        extractedObjects.push({
          runId: run.id,
          conceptLabel: "ProcurementItem",
          jsonPayload: JSON.stringify(item),
        });
      }
    }
    // 记录主单据/借款/员工等嵌套对象（LLM 常把单据概念抽成顶层嵌套对象）
    const knownMainLabels: Record<string, string> = {
      loan: "Loan",
      expenseReport: "ExpenseReport",
      employee: "Employee",
      submitter: "Employee",
      travelRequest: "TravelRequest",
      borrower: "Employee",
    };
    if (payloadObj && typeof payloadObj === "object") {
      for (const [key, label] of Object.entries(knownMainLabels)) {
        const v = (payloadObj as any)[key];
        if (v && typeof v === "object" && !Array.isArray(v)) {
          extractedObjects.push({
            runId: run.id,
            conceptLabel: label,
            jsonPayload: JSON.stringify(v),
          });
        }
      }
    }

    // 把 employee 上下文合并进 ctx（用于 std_hotel_max）
    const ctxForEval = {
      ...payloadObj,
      employee: payloadObj?.employee ?? payloadObj?.submitter ?? { level: "P5" },
    };

    for (const rule of rules) {
      try {
        const parsed = parseDsl(rule.dsl);
        let fired = false;
        let messageText = rule.messageTemplate ?? "";

        if (parsed.targetPath && parsed.targetPath.includes("lines[*]")) {
          const lines = payloadObj?.lines ?? [];
          for (let idx = 0; idx < lines.length; idx++) {
            const line = lines[idx];
            const lineCtx = { ...ctxForEval, ...line, employee: ctxForEval.employee };
            if (evaluateWhen(parsed.when, lineCtx, builtinFunctions)) {
              fired = true;
              if (parsed.message) {
                messageText = renderMessage(parsed.message, lineCtx, builtinFunctions);
              }
              findings.push({
                runId: run.id,
                ruleId: rule.id,
                ruleCode: rule.code,
                severity: rule.severity,
                targetPath: `lines[${idx}]`,
                message: messageText,
                contextJson: JSON.stringify(line),
              });
            }
          }
        } else if (parsed.targetPath && parsed.targetPath.includes("items[*]")) {
          const items = payloadObj?.items ?? [];
          for (let idx = 0; idx < items.length; idx++) {
            const item = items[idx];
            const itemCtx = { ...ctxForEval, ...item };
            if (evaluateWhen(parsed.when, itemCtx, builtinFunctions)) {
              fired = true;
              if (parsed.message) {
                messageText = renderMessage(parsed.message, itemCtx, builtinFunctions);
              }
              findings.push({
                runId: run.id,
                ruleId: rule.id,
                ruleCode: rule.code,
                severity: rule.severity,
                targetPath: `items[${idx}]`,
                message: messageText,
                contextJson: JSON.stringify(item),
              });
            }
          }
        } else {
          fired = evaluateWhen(parsed.when, ctxForEval, builtinFunctions);
          if (fired) {
            if (parsed.message) {
              messageText = renderMessage(parsed.message, ctxForEval, builtinFunctions);
            }
            findings.push({
              runId: run.id,
              ruleId: rule.id,
              ruleCode: rule.code,
              severity: rule.severity,
              targetPath: parsed.targetPath ?? null,
              message: messageText,
              contextJson: JSON.stringify(payloadObj),
            });
          }
        }
      } catch (e) {
        findings.push({
          runId: run.id,
          ruleId: rule.id,
          ruleCode: rule.code,
          severity: "INFO",
          targetPath: null,
          message: `规则执行异常: ${(e as Error).message}`,
          contextJson: "{}",
        });
      }
    }

    if (findings.length > 0) {
      await db.finding.createMany({ data: findings });
    }
    if (extractedObjects.length > 0) {
      await db.extractedObject.createMany({ data: extractedObjects });
    }

    const errorCount = findings.filter(f => f.severity === "ERROR").length;
    const warnCount = findings.filter(f => f.severity === "WARNING").length;

    const summary = mode === "text"
      ? `LLM 抽取 ${extractionMeta?.durationMs ?? 0}ms · 共执行 ${rules.length} 条规则，命中 ${findings.length} 条（错误 ${errorCount} / 警告 ${warnCount}）`
      : `共执行 ${rules.length} 条规则，命中 ${findings.length} 条（错误 ${errorCount} / 警告 ${warnCount}）`;

    const updated = await db.runRecord.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        summary,
      },
    });

    return NextResponse.json({
      ...updated,
      findings,
      extracted: extractedObjects.map(o => ({
        ...o,
        jsonPayload: JSON.parse(o.jsonPayload),
      })),
      extractedCount: extractedObjects.length,
      ruleCount: rules.length,
      extraction: extractionMeta,
      payload: payloadObj,
    });
  } catch (e: any) {
    await db.runRecord.update({
      where: { id: run.id },
      data: { status: "FAILED", error: e.message, finishedAt: new Date() },
    });
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
