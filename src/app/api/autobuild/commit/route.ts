import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { AutoBuildResult } from "@/lib/autoBuild";
import { parseDsl } from "@/lib/dsl/parser";

// POST /api/autobuild/commit - 把候选本体入库
// body: {
//   domainId or domain: { code, nameZh, ... },
//   selected: { concepts, relations, rules, scenarios },  // 用户勾选后的子集
//   linkToCore?: { [localName]: coreConceptId }  // 可选：链接到已有核心概念
// }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { domainId, domain: newDomain, selected, linkToCore, buildSource } = body;
  // buildSource: { materials, domainHint, llmRaw, usage, durationMs } —— 建库来源留存

  // 1. 确定领域
  let domain;
  if (domainId) {
    domain = await db.domain.findUnique({ where: { id: domainId } });
    if (!domain) return NextResponse.json({ error: "domain not found" }, { status: 404 });
  } else if (newDomain) {
    // 新建领域
    const exists = await db.domain.findUnique({ where: { code: newDomain.code } });
    if (exists) return NextResponse.json({ error: `领域 code '${newDomain.code}' 已存在` }, { status: 409 });
    domain = await db.domain.create({
      data: {
        code: newDomain.code,
        nameZh: newDomain.nameZh,
        nameEn: newDomain.nameEn ?? null,
        description: newDomain.description ?? null,
        owner: newDomain.owner ?? null,
        icon: newDomain.icon ?? "boxes",
        color: newDomain.color ?? "#10b981",
        status: "ACTIVE",
        // 留存建库来源
        rawMaterials: buildSource?.materials ?? null,
        buildMeta: buildSource ? JSON.stringify({
          domainHint: buildSource.domainHint ?? null,
          llmRaw: buildSource.llmRaw ?? null,
          usage: buildSource.usage ?? null,
          durationMs: buildSource.durationMs ?? null,
          builtAt: new Date().toISOString(),
        }) : null,
      },
    });
    await db.auditLog.create({
      data: {
        actor: "web",
        action: "CREATE_DOMAIN",
        entityType: "Domain",
        entityId: domain.id,
        afterJson: JSON.stringify(domain),
      },
    });
  } else {
    return NextResponse.json({ error: "需要 domainId 或 domain 参数" }, { status: 400 });
  }

  const sel: Partial<AutoBuildResult> = selected || {};
  const concepts = sel.concepts ?? [];
  const relations = sel.relations ?? [];
  const rules = sel.rules ?? [];
  const scenarios = sel.scenarios ?? [];

  // 2. 创建概念（支持复用已存在的核心概念，避免 URI 冲突）
  const conceptIdMap = new Map<string, string>(); // localName → conceptId
  for (const c of concepts) {
    const linkedCoreId = linkToCore?.[c.localName] ?? null;
    const uri = linkedCoreId
      ? `${domain.code}:${c.localName}`
      : c.isCore
      ? `core:${c.localName}`
      : `${domain.code}:${c.localName}`;

    // 若该 URI 的 Concept 已存在（常见：isCore 概念与已有核心概念同名），则复用，避免唯一约束冲突
    let created = await db.concept.findUnique({ where: { uri } });
    if (!created) {
      created = await db.concept.create({
        data: {
          uri,
          labelZh: c.labelZh,
          labelEn: c.labelEn ?? null,
          description: c.description ?? null,
          type: "CLASS",
          scope: c.isCore ? "CORE" : "DOMAIN",
          status: "PUBLISHED",
          ownerDomainId: c.isCore ? null : domain.id,
          jsonSchema: JSON.stringify(c.fields ?? []),
          createdBy: "autobuild",
        },
      });
    }

    // 如果显式链接到核心概念，补建等价关系（幂等：已存在则跳过）
    if (linkedCoreId && linkedCoreId !== created.id) {
      const dup = await db.conceptEquivalence.findFirst({
        where: { conceptAId: linkedCoreId, conceptBId: created.id },
      });
      if (!dup) {
        await db.conceptEquivalence.create({
          data: {
            conceptAId: linkedCoreId,
            conceptBId: created.id,
            equivalenceType: "EXACT",
            evidence: "AUTO_ALIAS",
            status: "PROPOSED",
            note: `智能建库自动识别：${c.localName} 等同于已有核心概念`,
          },
        });
      }
    }

    // 创建 DomainConcept（幂等：该领域下同名 localName 已存在则跳过）
    const existingDc = await db.domainConcept.findUnique({
      where: { domainId_localName: { domainId: domain.id, localName: c.localName } },
    });
    if (!existingDc) {
      await db.domainConcept.create({
        data: {
          domainId: domain.id,
          localName: c.localName,
          linkedConceptId: created.id,
          status: "PUBLISHED",
          jsonSchema: "[]",
        },
      });
    }

    conceptIdMap.set(c.localName, created.id);
  }

  // 3. 创建关系
  for (const r of relations) {
    const sourceId = conceptIdMap.get(r.source);
    const targetId = conceptIdMap.get(r.target);
    if (!sourceId || !targetId) continue; // 跳过找不到的
    await db.domainRelation.create({
      data: {
        domainId: domain.id,
        name: r.name,
        sourceDomainConceptId: sourceId,
        targetDomainConceptId: targetId,
        relationType: r.relationType,
        cardinality: r.cardinality,
        description: r.description ?? null,
      },
    });
  }

  // 4. 创建规则集 + 规则
  if (rules.length > 0) {
    const ruleset = await db.ruleSet.create({
      data: {
        domainId: domain.id,
        code: `RS-${domain.code.toUpperCase().slice(0, 6)}-AUTO`,
        name: `${domain.nameZh}规则集（自动生成）`,
        description: "由智能建库自动生成",
        version: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    for (const r of rules) {
      const targetConceptId = r.target ? conceptIdMap.get(r.target) : null;
      // 校验 DSL 可解析
      let dslValid = true;
      try { parseDsl(r.dsl); } catch { dslValid = false; }

      await db.rule.create({
        data: {
          rulesetId: ruleset.id,
          code: r.code,
          name: r.name,
          severity: r.severity,
          targetConceptId: targetConceptId ?? null,
          targetPath: r.targetPath ?? null,
          dsl: r.dsl,
          messageTemplate: r.message,
          explanation: r.explanation ?? null,
          status: dslValid ? "PUBLISHED" : "DRAFT",
          version: 1,
          tags: JSON.stringify(r.tags ?? []),
        },
      });
    }

    // 5. 创建 scenario（绑定规则集）
    for (const s of scenarios) {
      await db.scenario.create({
        data: {
          domainId: domain.id,
          code: s.code,
          name: s.name,
          description: s.description ?? null,
          inputSchema: JSON.stringify({ type: "object" }),
          rulesetIds: JSON.stringify([ruleset.id]),
          status: "ACTIVE",
        },
      });
    }
  }

  await db.auditLog.create({
    data: {
      actor: "web",
      action: "AUTOBUILD",
      entityType: "Domain",
      entityId: domain.id,
      afterJson: JSON.stringify({
        // 完整快照（用户勾选的原始候选，而非仅数量）
        selected: { concepts, relations, rules, scenarios },
        counts: {
          concepts: concepts.length,
          relations: relations.length,
          rules: rules.length,
          scenarios: scenarios.length,
        },
        hasBuildSource: !!buildSource,
      }),
    },
  });

  // 返回创建结果
  const updated = await db.domain.findUnique({
    where: { id: domain.id },
    include: {
      _count: { select: { concepts: true, rulesets: true, scenarios: true } },
    },
  });

  console.log(`[Commit] 领域=${domain.code}(${domain.id}) 入库 概念=${concepts.length} 关系=${relations.length} 规则=${rules.length} 场景=${scenarios.length}`);

  return NextResponse.json({
    ok: true,
    domain: updated,
    created: {
      concepts: concepts.length,
      relations: relations.length,
      rules: rules.length,
      scenarios: scenarios.length,
    },
  }, { status: 201 });
}
