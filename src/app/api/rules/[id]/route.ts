import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  parseDsl, renderRuleHumanReadable, compileToShacl,
  evaluateWhen, renderMessage, builtinFunctions,
  type RuleDsl,
} from "@/lib/dsl/parser";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rule = await db.rule.findUnique({
    where: { id },
    include: {
      ruleset: { include: { domain: true } },
      targetConcept: true,
      tests: true,
    },
  });
  if (!rule) return NextResponse.json({ error: "not found" }, { status: 404 });

  let parsed: RuleDsl | null = null;
  let humanReadable: string[] = [];
  let parseError: string | null = null;
  try {
    parsed = parseDsl(rule.dsl);
    humanReadable = renderRuleHumanReadable(parsed);
  } catch (e: any) {
    parseError = e.message;
  }

  return NextResponse.json({
    ...rule,
    tags: rule.tags ? JSON.parse(rule.tags) : [],
    parsed,
    humanReadable,
    parseError,
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const before = await db.rule.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: any = {};
  if (body.dsl !== undefined) {
    data.dsl = body.dsl;
    try {
      const parsed = parseDsl(body.dsl);
      data.name = parsed.name;
      data.severity = parsed.severity ?? "WARNING";
      data.messageTemplate = parsed.message ?? null;
      data.explanation = parsed.explanation ?? null;
      data.targetPath = parsed.targetPath ?? null;
      if (parsed.tags) data.tags = JSON.stringify(parsed.tags);
    } catch {
      // DSL 错误也存，但不更新元信息
    }
  }
  if (body.status !== undefined) data.status = body.status;
  if (body.targetConceptId !== undefined) data.targetConceptId = body.targetConceptId;

  const updated = await db.rule.update({ where: { id }, data });
  await db.auditLog.create({
    data: {
      actor: body.actor ?? "web",
      action: "UPDATE_RULE",
      entityType: "Rule",
      entityId: id,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(updated),
    },
  });
  return NextResponse.json(updated);
}

// 多种 action：compile / test / evaluate
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = body.action ?? "compile";

  const rule = await db.rule.findUnique({ where: { id } });
  if (!rule) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const parsed = parseDsl(rule.dsl);

    if (action === "compile") {
      const shacl = compileToShacl(parsed);
      const updated = await db.rule.update({
        where: { id },
        data: { compiledArtifact: shacl },
      });
      return NextResponse.json({ ok: true, shacl, rule: updated });
    }

    if (action === "test") {
      const tests = await db.ruleTest.findMany({ where: { ruleId: id } });
      const results = tests.map(t => {
        const input = JSON.parse(t.sampleInput);
        const fired = evaluateWhen(parsed.when, input, builtinFunctions);
        const passed = fired ? t.expectedResult === "FAIL" : t.expectedResult === "PASS";
        return {
          name: t.name, input, expected: t.expectedResult,
          actual: fired ? "FAIL" : "PASS", passed,
          message: fired && parsed.message ? renderMessage(parsed.message, input, builtinFunctions) : null,
        };
      });
      return NextResponse.json({ ok: true, results });
    }

    if (action === "evaluate") {
      const ctxData = body.ctx ?? {};
      const fired = evaluateWhen(parsed.when, ctxData, builtinFunctions);
      const message = fired && parsed.message ? renderMessage(parsed.message, ctxData, builtinFunctions) : null;
      return NextResponse.json({ ok: true, fired, message });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
