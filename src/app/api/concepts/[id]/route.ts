import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const concept = await db.concept.findUnique({
    where: { id },
    include: {
      aliases: true,
      ownerDomain: true,
      rulesAsTarget: { include: { ruleset: true } },
      domainConcepts: { include: { domain: true } },
      equivalencesA: { include: { conceptB: true } },
      equivalencesB: { include: { conceptA: true } },
      _count: { select: { rulesAsTarget: true, domainConcepts: true } },
    },
  });
  if (!concept) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(concept);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const before = await db.concept.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });
  const updated = await db.concept.update({
    where: { id },
    data: {
      labelZh: body.labelZh,
      labelEn: body.labelEn,
      description: body.description,
      jsonSchema: JSON.stringify(body.jsonSchema ?? []),
    },
  });
  await db.auditLog.create({
    data: {
      actor: body.actor ?? "web",
      action: "UPDATE_CONCEPT",
      entityType: "Concept",
      entityId: id,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(updated),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.concept.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
