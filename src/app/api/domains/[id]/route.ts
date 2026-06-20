import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const domain = await db.domain.findUnique({
    where: { id },
    include: {
      concepts: { include: { concept: true } },
      relations: {
        include: { sourceDomainConcept: true, targetDomainConcept: true },
      },
      rulesets: { include: { _count: { select: { rules: true } } } },
      scenarios: true,
    },
  });
  if (!domain) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(domain);
}

// PUT /api/domains/[id] - 更新领域
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const before = await db.domain.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });
  const updated = await db.domain.update({
    where: { id },
    data: {
      nameZh: body.nameZh ?? before.nameZh,
      nameEn: body.nameEn ?? before.nameEn,
      description: body.description ?? before.description,
      owner: body.owner ?? before.owner,
      icon: body.icon ?? before.icon,
      color: body.color ?? before.color,
      status: body.status ?? before.status,
    },
  });
  await db.auditLog.create({
    data: {
      actor: body.actor ?? "web",
      action: "UPDATE_DOMAIN",
      entityType: "Domain",
      entityId: id,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(updated),
    },
  });
  return NextResponse.json(updated);
}

// DELETE /api/domains/[id] - 删除领域（级联删除）
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const before = await db.domain.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });
  await db.domain.delete({ where: { id } });
  await db.auditLog.create({
    data: {
      actor: "web",
      action: "DELETE_DOMAIN",
      entityType: "Domain",
      entityId: id,
      beforeJson: JSON.stringify(before),
    },
  });
  return NextResponse.json({ ok: true });
}
