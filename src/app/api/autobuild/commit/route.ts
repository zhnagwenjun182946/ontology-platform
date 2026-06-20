import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { AutoBuildResult } from "@/lib/autoBuild";
import { findIsolatedConcepts } from "@/lib/autoBuild";
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
  const standards = sel.standards ?? [];

  // 关系完整性校验：领域内所有概念必须连通，不允许孤立。
  // 不相干的概念不该进同一领域；autoBuild 已尝试自愈重试，这里作最终兜底。
  const isolated = findIsolatedConcepts(concepts, relations);
  if (isolated.length > 0) {
    return NextResponse.json({
      ok: false,
      error: `关系完整性校验失败：以下概念没有任何关系连接（孤立），请补关系或移除：${isolated.join("、")}`,
      isolated,
    }, { status: 400 });
  }

  // 2. 创建概念
  // autoBuild 产出的概念一律 DOMAIN 作用域（ownerDomainId = 当前领域），
  // 不再把 isCore 概念提升为 CORE——核心层只放固定的基础本体（Person/Organization/Money/Document），
  // 领域概念通过 mapsToCore 建等价关系（owl:equivalentClass）链到基础概念，而非变成核心概念本身。
  const conceptIdMap = new Map<string, string>(); // localName → conceptId
  for (const c of concepts) {
    const linkedCoreId = linkToCore?.[c.localName] ?? null;
    const uri = `${domain.code}:${c.localName}`;

    // 若该 URI 的 Concept 已存在（同领域重建），则复用，避免唯一约束冲突
    let created = await db.concept.findUnique({ where: { uri } });
    if (!created) {
      created = await db.concept.create({
        data: {
          uri,
          labelZh: c.labelZh,
          labelEn: c.labelEn ?? null,
          description: c.description ?? null,
          type: "CLASS",
          scope: "DOMAIN",
          status: "PUBLISHED",
          ownerDomainId: domain.id,
          jsonSchema: JSON.stringify(c.fields ?? []),
          createdBy: "autobuild",
        },
      });
    }

    // 建立「领域概念 ↔ 基础核心概念」的等价关系（owl:equivalentClass）。
    // 来源二选一：显式 linkToCore（UI 手动），或 autoBuild 的 mapsToCore（LLM 自动映射）。
    // 这让核心概念被领域引用 → 图谱连通，不再孤立。幂等：已存在则跳过。
    const coreLocalName = linkedCoreId ? null : (c.mapsToCore ?? null);
    let coreConceptId: string | null = linkedCoreId ?? null;
    if (!coreConceptId && coreLocalName) {
      const coreConcept = await db.concept.findUnique({ where: { uri: `core:${coreLocalName}` } });
      coreConceptId = coreConcept?.id ?? null;
    }
    if (coreConceptId && coreConceptId !== created.id) {
      const dup = await db.conceptEquivalence.findFirst({
        where: { conceptAId: coreConceptId, conceptBId: created.id },
      });
      if (!dup) {
        await db.conceptEquivalence.create({
          data: {
            conceptAId: coreConceptId,
            conceptBId: created.id,
            equivalenceType: "EXACT",
            evidence: "AUTO_ALIAS",
            status: "PROPOSED",
            note: `智能建库自动映射：${c.localName} 等价于基础核心概念`,
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

  // 6. 创建受治理标准（领域级，与规则集平级）
  for (const s of standards) {
    if (!s.code) continue; // 没有 code 的标准无意义（规则 call 不到）
    // 幂等：同领域同 code 已存在则更新 matrix
    await db.standard.upsert({
      where: { domainId_code: { domainId: domain.id, code: s.code } },
      update: { matrix: JSON.stringify(s.matrix ?? {}), description: s.description ?? null },
      create: {
        domainId: domain.id,
        code: s.code,
        matrix: JSON.stringify(s.matrix ?? {}),
        description: s.description ?? null,
      },
    });
  }

  await db.auditLog.create({
    data: {
      actor: "web",
      action: "AUTOBUILD",
      entityType: "Domain",
      entityId: domain.id,
        afterJson: JSON.stringify({
          // 完整快照（用户勾选的原始候选，而非仅数量）
          selected: { concepts, relations, rules, scenarios, standards },
          counts: {
            concepts: concepts.length,
            relations: relations.length,
            rules: rules.length,
            scenarios: scenarios.length,
            standards: standards.length,
          },
          hasBuildSource: !!buildSource,
        }),
      },
    });

  // 返回创建结果
  const updated = await db.domain.findUnique({
    where: { id: domain.id },
    include: {
      _count: { select: { concepts: true, rulesets: true, scenarios: true, standards: true } },
    },
  });

  console.log(`[Commit] 领域=${domain.code}(${domain.id}) 入库 概念=${concepts.length} 关系=${relations.length} 规则=${rules.length} 场景=${scenarios.length} 标准=${standards.length}`);

  return NextResponse.json({
    ok: true,
    domain: updated,
    created: {
      concepts: concepts.length,
      relations: relations.length,
      rules: rules.length,
      scenarios: scenarios.length,
      standards: standards.length,
    },
  }, { status: 201 });
}
