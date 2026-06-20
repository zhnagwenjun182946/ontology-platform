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

// DELETE /api/domains/[id] - 删除领域（级联删除所有相关数据）
// 领域删除时，schema 级联清除：DomainConcept / DomainRelation / RuleSet→Rule→RuleTest / Scenario / Standard。
// 额外处理两个未声明级联的外键：
//   - Concept.ownerDomain：该领域「独占」的概念一并删除（避免删领域后残留孤儿概念）；
//     被「其他领域」DomainConcept 引用的概念视为共用，只解除归属（ownerDomainId=null）不删。
//     CORE 概念 ownerDomainId 为 null，永不受影响。
//   - RunRecord.scenario：先删运行记录（Findings 随 runId 级联清除）。
// 概念删除时，其 ConceptAlias / ConceptEquivalence 由 schema ON DELETE CASCADE 自动清除；
// Rule.targetConceptId / DomainConcept.linkedConceptId 为 ON DELETE SET NULL，安全。
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const before = await db.domain.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 该领域拥有的概念（DOMAIN scope，ownerDomainId=id）
  const owned = await db.concept.findMany({
    where: { ownerDomainId: id },
    select: { id: true },
  });
  const ownedIds = owned.map((c) => c.id);

  // 其中被「其他领域」DomainConcept 引用的 → 共用，只解除归属；其余 → 独占，删除
  const sharedRows = await db.domainConcept.findMany({
    where: { domainId: { not: id }, linkedConceptId: { in: ownedIds } },
    select: { linkedConceptId: true },
  });
  const sharedIds = new Set(
    sharedRows.map((r) => r.linkedConceptId).filter((x): x is string => !!x),
  );
  const exclusiveIds = ownedIds.filter((cid) => !sharedIds.has(cid));

  await db.$transaction([
    // 1. 运行记录（Scenario 无级联到 RunRecord，先删避免阻塞）
    db.runRecord.deleteMany({ where: { scenario: { domainId: id } } }),
    // 2. 删领域本身——schema 级联清除 DomainConcept / DomainRelation / RuleSet→Rule / Scenario / Standard。
    //    必须在删概念之前：DomainRelation.source/targetDomainConceptId 是必需外键（RESTRICT），
    //    领域没删前它的关联关系还在，此时删概念会触发外键约束。
    db.domain.delete({ where: { id } }),
    // 3. 领域删完后，独占概念已无任何 DomainRelation 引用，可安全删除
    //    （其 ConceptAlias / ConceptEquivalence 由 schema ON DELETE CASCADE 自动清除；
    //     Rule.targetConceptId / DomainConcept.linkedConceptId 为 SET NULL）
    ...(exclusiveIds.length > 0
      ? [db.concept.deleteMany({ where: { id: { in: exclusiveIds } } })]
      : []),
    // 共用概念（被其他领域引用）此时 ownerDomainId 已被领域删除的 SET NULL 置空，无需再动
  ]);

  await db.auditLog.create({
    data: {
      actor: "web",
      action: "DELETE_DOMAIN",
      entityType: "Domain",
      entityId: id,
      beforeJson: JSON.stringify({
        ...before,
        _deletedExclusiveConcepts: exclusiveIds.length,
        _detachedSharedConcepts: sharedIds.size,
      }),
    },
  });
  return NextResponse.json({ ok: true, deletedConcepts: exclusiveIds.length });
}
