/**
 * 种子数据 - 报销领域 + 采购领域 + 核心概念
 * 启动时自动注入，保证平台一打开就有内容可看
 */
import { db } from "@/lib/db"

export async function ensureSeed() {
  const count = await db.concept.count()
  if (count > 0) return false

  // ===== 核心概念（Core Ontology）=====
  const person = await db.concept.create({
    data: {
      uri: "core:Person",
      labelZh: "人员",
      labelEn: "Person",
      description: "自然人，跨领域共享。员工、采购员、合同签署人、检查员都是它的具体化。",
      type: "CLASS",
      scope: "CORE",
      status: "PUBLISHED",
      ownerDomainId: null,
      jsonSchema: JSON.stringify([
        { name: "id", type: "string", required: true, label: "ID" },
        { name: "name", type: "string", required: true, label: "姓名" },
        { name: "level", type: "string", label: "职级", enum: ["P5", "P6", "M1", "M2", "M3"] },
      ]),
    },
  })

  const org = await db.concept.create({
    data: {
      uri: "core:Organization",
      labelZh: "组织",
      labelEn: "Organization",
      description: "组织单元，可以是部门、成本中心、子公司。",
      type: "CLASS",
      scope: "CORE",
      status: "PUBLISHED",
      jsonSchema: JSON.stringify([
        { name: "id", type: "string", required: true, label: "ID" },
        { name: "name", type: "string", required: true, label: "名称" },
        { name: "type", type: "string", label: "类型", enum: ["部门", "成本中心", "子公司"] },
      ]),
    },
  })

  const money = await db.concept.create({
    data: {
      uri: "core:Money",
      labelZh: "金额",
      labelEn: "Money",
      description: "金额对象，含数值 + 币种。所有费用、预算、合同金额都引用此概念。",
      type: "CLASS",
      scope: "CORE",
      status: "PUBLISHED",
      jsonSchema: JSON.stringify([
        { name: "amount", type: "number", required: true, label: "金额" },
        { name: "currency", type: "string", label: "币种", default: "CNY" },
      ]),
    },
  })

  const doc = await db.concept.create({
    data: {
      uri: "core:Document",
      labelZh: "文档",
      labelEn: "Document",
      description: "文档凭据，如发票、合同、采购单。",
      type: "CLASS",
      scope: "CORE",
      status: "PUBLISHED",
      jsonSchema: JSON.stringify([
        { name: "id", type: "string", required: true, label: "ID" },
        { name: "type", type: "string", required: true, label: "类型" },
        { name: "issuedAt", type: "date", label: "开具日期" },
      ]),
    },
  })

  // ===== 领域：报销 =====
  const reimbursement = await db.domain.create({
    data: {
      code: "reimbursement",
      nameZh: "办公报销",
      nameEn: "Reimbursement",
      description: "员工差旅、招待、办公等费用的报销审批",
      status: "ACTIVE",
      owner: "财务部",
      icon: "receipt",
      color: "#10b981",
      activeVersion: "1.0.0",
    },
  })

  // 报销领域概念 - 部分链接到 Core
  const employee = await db.concept.create({
    data: {
      uri: "reimbursement:Employee",
      labelZh: "员工",
      labelEn: "Employee",
      description: "报销场景中的员工，等同于核心 Person",
      type: "CLASS",
      scope: "DOMAIN",
      status: "PUBLISHED",
      ownerDomainId: reimbursement.id,
      jsonSchema: JSON.stringify([
        { name: "id", type: "string", required: true, label: "工号" },
        { name: "name", type: "string", required: true, label: "姓名" },
        { name: "level", type: "string", label: "职级", enum: ["P5", "P6", "M1", "M2", "M3"] },
        { name: "department", type: "string", label: "所属部门" },
      ]),
    },
  })
  // 别名 → core:Person
  await db.conceptAlias.createMany({
    data: [
      { conceptId: person.id, alias: "员工", aliasType: "LABEL", sourceDomainId: reimbursement.id, confidence: 0.95 },
      { conceptId: person.id, alias: "Employee", aliasType: "LABEL", sourceDomainId: reimbursement.id, confidence: 0.95 },
      { conceptId: person.id, alias: "reimbursement:Employee", aliasType: "URI", sourceDomainId: reimbursement.id, confidence: 1.0 },
    ],
  })
  await db.conceptEquivalence.create({
    data: {
      conceptAId: person.id,
      conceptBId: employee.id,
      equivalenceType: "EXACT",
      evidence: "DECLARED",
      status: "CONFIRMED",
      note: "报销场景的 Employee 即核心 Person 的具体化",
    },
  })

  const costCenter = await db.concept.create({
    data: {
      uri: "reimbursement:CostCenter",
      labelZh: "成本中心",
      labelEn: "CostCenter",
      description: "报销归属的成本中心，等同于核心 Organization",
      type: "CLASS",
      scope: "DOMAIN",
      status: "PUBLISHED",
      ownerDomainId: reimbursement.id,
      jsonSchema: JSON.stringify([
        { name: "id", type: "string", required: true, label: "成本中心编码" },
        { name: "name", type: "string", required: true, label: "名称" },
      ]),
    },
  })
  await db.conceptEquivalence.create({
    data: {
      conceptAId: org.id,
      conceptBId: costCenter.id,
      equivalenceType: "NARROW",
      evidence: "DECLARED",
      status: "CONFIRMED",
      note: "成本中心是 Organization 的子类型",
    },
  })

  const expenseReport = await db.concept.create({
    data: {
      uri: "reimbursement:ExpenseReport",
      labelZh: "报销单",
      labelEn: "ExpenseReport",
      description: "一次报销的完整单据",
      type: "CLASS",
      scope: "DOMAIN",
      status: "PUBLISHED",
      ownerDomainId: reimbursement.id,
      jsonSchema: JSON.stringify([
        { name: "id", type: "string", required: true, label: "单号" },
        { name: "submitter", type: "ref", ref: "Employee", required: true, label: "提交人" },
        { name: "costCenter", type: "ref", ref: "CostCenter", required: true, label: "成本中心" },
        { name: "lines", type: "array", itemRef: "ExpenseLine", required: true, label: "费用明细" },
        { name: "totalAmount", type: "number", label: "总金额" },
        { name: "status", type: "string", label: "状态", enum: ["草稿", "已提交", "已审批", "已打回"] },
      ]),
    },
  })

  const expenseLine = await db.concept.create({
    data: {
      uri: "reimbursement:ExpenseLine",
      labelZh: "费用明细",
      labelEn: "ExpenseLine",
      description: "报销单中的一条费用明细",
      type: "CLASS",
      scope: "DOMAIN",
      status: "PUBLISHED",
      ownerDomainId: reimbursement.id,
      jsonSchema: JSON.stringify([
        { name: "type", type: "string", required: true, label: "费用类型", enum: ["住宿", "餐饮", "交通", "办公", "招待", "其他"] },
        { name: "amount", type: "number", required: true, label: "金额" },
        { name: "city", type: "string", label: "城市" },
        { name: "date", type: "date", label: "发生日期" },
        { name: "invoice", type: "ref", ref: "Invoice", label: "发票" },
        { name: "customer", type: "string", label: "客户（招待必填）" },
        { name: "project", type: "string", label: "项目" },
      ]),
    },
  })

  const invoice = await db.concept.create({
    data: {
      uri: "reimbursement:Invoice",
      labelZh: "发票",
      labelEn: "Invoice",
      description: "费用对应的发票",
      type: "CLASS",
      scope: "DOMAIN",
      status: "PUBLISHED",
      ownerDomainId: reimbursement.id,
      jsonSchema: JSON.stringify([
        { name: "number", type: "string", required: true, label: "发票号" },
        { name: "amount", type: "number", required: true, label: "金额" },
        { name: "issuedAt", type: "date", label: "开具日期" },
      ]),
    },
  })
  // Invoice 是 Document 的子类型
  await db.conceptEquivalence.create({
    data: {
      conceptAId: doc.id,
      conceptBId: invoice.id,
      equivalenceType: "BROAD",
      evidence: "DECLARED",
      status: "CONFIRMED",
      note: "发票是 Document 的子类型",
    },
  })

  // DomainConcept 链接
  await db.domainConcept.createMany({
    data: [
      { domainId: reimbursement.id, localName: "Employee", linkedConceptId: employee.id, status: "PUBLISHED", jsonSchema: "[]" },
      { domainId: reimbursement.id, localName: "CostCenter", linkedConceptId: costCenter.id, status: "PUBLISHED", jsonSchema: "[]" },
      { domainId: reimbursement.id, localName: "ExpenseReport", linkedConceptId: expenseReport.id, status: "PUBLISHED", jsonSchema: "[]" },
      { domainId: reimbursement.id, localName: "ExpenseLine", linkedConceptId: expenseLine.id, status: "PUBLISHED", jsonSchema: "[]" },
      { domainId: reimbursement.id, localName: "Invoice", linkedConceptId: invoice.id, status: "PUBLISHED", jsonSchema: "[]" },
    ],
  })

  // DomainRelation
  await db.domainRelation.createMany({
    data: [
      { domainId: reimbursement.id, name: "提交", sourceDomainConceptId: employee.id, targetDomainConceptId: expenseReport.id, relationType: "SUBMIT", cardinality: "1:N", description: "员工提交报销单" },
      { domainId: reimbursement.id, name: "归属", sourceDomainConceptId: expenseReport.id, targetDomainConceptId: costCenter.id, relationType: "BELONGS_TO", cardinality: "N:1", description: "报销单归属成本中心" },
      { domainId: reimbursement.id, name: "包含", sourceDomainConceptId: expenseReport.id, targetDomainConceptId: expenseLine.id, relationType: "CONTAINS", cardinality: "1:N", description: "报销单包含多条费用明细" },
      { domainId: reimbursement.id, name: "关联", sourceDomainConceptId: expenseLine.id, targetDomainConceptId: invoice.id, relationType: "REFERENCES", cardinality: "N:1", description: "费用明细关联发票" },
    ],
  })

  // ===== 规则集 =====
  const ruleset = await db.ruleSet.create({
    data: {
      domainId: reimbursement.id,
      code: "RS-EXP-CORE",
      name: "报销核心规则集",
      description: "报销场景必跑的基础规则",
      version: 1,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  })

  const rules = [
    {
      code: "R-EXP-001",
      name: "发票号不可重复",
      severity: "ERROR",
      targetConceptId: expenseReport.id,
      targetPath: null,
      messageTemplate: "报销单内存在重复发票号",
      explanation: "公司财务制度第 3.2 条：同一报销单内发票号必须唯一，防止重复报销。",
      tags: ["发票", "去重"],
      dsl: `- id: R-EXP-001
  name: 发票号不可重复
  severity: error
  target: ExpenseReport
  when:
    call: [has_duplicate_field, lines, "invoice.number"]
  message: "报销单内存在重复发票号"
  explanation: |
    公司财务制度第 3.2 条：同一报销单内发票号必须唯一，防止重复报销。
  tags: [发票, 去重]`,
    },
    {
      code: "R-EXP-002",
      name: "住宿费超标",
      severity: "WARNING",
      targetConceptId: expenseLine.id,
      targetPath: "lines[*]",
      messageTemplate: "{{city}} 住宿 {{amount}} 元超过 {{level}} 标准，需部门经理额外审批",
      explanation: "差旅制度 4.1.2：住宿费按城市与职级有上限，超过标准需部门经理额外审批。",
      tags: ["差旅", "住宿", "超标"],
      dsl: `- id: R-EXP-002
  name: 住宿费超标
  severity: warning
  target: ExpenseReport
  targetPath: lines[*]
  when:
    all:
      - type == "住宿"
      - amount > std_hotel_max(city, employee.level)
  then:
    - require_approval: "部门经理"
    - tag: "超标"
  message: "{{city}} 住宿 {{amount}} 元超过标准，需部门经理额外审批"
  explanation: |
    差旅制度 4.1.2：住宿费按城市与职级有上限，超过标准需部门经理额外审批。
  tags: [差旅, 住宿, 超标]`,
    },
    {
      code: "R-EXP-003",
      name: "招待费必须关联客户或项目",
      severity: "ERROR",
      targetConceptId: expenseLine.id,
      targetPath: "lines[*]",
      messageTemplate: "业务招待费（{{amount}}元）必须关联客户或项目",
      explanation: "财务合规：招待费无关联对象视为违规，需补全客户或项目信息。",
      tags: ["招待", "合规"],
      dsl: `- id: R-EXP-003
  name: 招待费必须关联客户或项目
  severity: error
  target: ExpenseReport
  targetPath: lines[*]
  when:
    all:
      - type == "招待"
      - isEmpty(customer)
      - isEmpty(project)
  message: "业务招待费（{{amount}}元）必须关联客户或项目"
  explanation: |
    财务合规：招待费无关联对象视为违规，需补全客户或项目信息。
  tags: [招待, 合规]`,
    },
    {
      code: "R-EXP-004",
      name: "报销单必须有提交人",
      severity: "ERROR",
      targetConceptId: expenseReport.id,
      messageTemplate: "报销单缺少提交人",
      explanation: "所有报销单必须明确提交人，便于追溯与审批。",
      tags: ["必填"],
      dsl: `- id: R-EXP-004
  name: 报销单必须有提交人
  severity: error
  target: ExpenseReport
  when:
    isEmpty(submitter)
  message: "报销单缺少提交人"
  explanation: |
    所有报销单必须明确提交人，便于追溯与审批。
  tags: [必填]`,
    },
    {
      code: "R-EXP-005",
      name: "报销单必须有成本中心",
      severity: "ERROR",
      targetConceptId: expenseReport.id,
      messageTemplate: "报销单缺少成本中心",
      explanation: "报销必须归属成本中心，否则无法入账。",
      tags: ["必填"],
      dsl: `- id: R-EXP-005
  name: 报销单必须有成本中心
  severity: error
  target: ExpenseReport
  when:
    isEmpty(costCenter)
  message: "报销单缺少成本中心"
  explanation: |
    报销必须归属成本中心，否则无法入账。
  tags: [必填]`,
    },
    {
      code: "R-EXP-006",
      name: "总额超5000需财务审批",
      severity: "WARNING",
      targetConceptId: expenseReport.id,
      messageTemplate: "报销总额 {{totalAmount}} 元超过 5000，需财务部审批",
      explanation: "大额报销需财务部复核，金额超 5000 元触发额外审批。",
      tags: ["审批", "大额"],
      dsl: `- id: R-EXP-006
  name: 总额超5000需财务审批
  severity: warning
  target: ExpenseReport
  when:
    all:
      - isNotEmpty(totalAmount)
      - totalAmount > 5000
  then:
    - require_approval: "财务部"
  message: "报销总额 {{totalAmount}} 元超过 5000，需财务部审批"
  explanation: |
    大额报销需财务部复核，金额超 5000 元触发额外审批。
  tags: [审批, 大额]`,
    },
  ]

  for (const r of rules) {
    await db.rule.create({
      data: {
        rulesetId: ruleset.id,
        code: r.code,
        name: r.name,
        severity: r.severity,
        targetConceptId: r.targetConceptId,
        targetPath: r.targetPath ?? null,
        dsl: r.dsl,
        messageTemplate: r.messageTemplate,
        explanation: r.explanation,
        status: "PUBLISHED",
        version: 1,
        tags: JSON.stringify(r.tags),
      },
    })
  }

  // ===== 领域：采购 =====
  const procurement = await db.domain.create({
    data: {
      code: "procurement",
      nameZh: "采购申请",
      nameEn: "Procurement",
      description: "物料、服务的采购申请与审批",
      status: "ACTIVE",
      owner: "采购部",
      icon: "shopping-cart",
      color: "#f59e0b",
      activeVersion: "0.9.0",
    },
  })

  const buyer = await db.concept.create({
    data: {
      uri: "procurement:Buyer",
      labelZh: "采购员",
      labelEn: "Buyer",
      description: "采购场景的采购员，等同于核心 Person",
      type: "CLASS",
      scope: "DOMAIN",
      status: "PUBLISHED",
      ownerDomainId: procurement.id,
      jsonSchema: JSON.stringify([
        { name: "id", type: "string", required: true, label: "工号" },
        { name: "name", type: "string", required: true, label: "姓名" },
      ]),
    },
  })
  // 别名 → core:Person
  await db.conceptAlias.create({
    data: {
      conceptId: person.id,
      alias: "采购员",
      aliasType: "LABEL",
      sourceDomainId: procurement.id,
      confidence: 0.95,
    },
  })
  await db.conceptEquivalence.create({
    data: {
      conceptAId: person.id,
      conceptBId: buyer.id,
      equivalenceType: "EXACT",
      evidence: "AUTO_ALIAS",
      status: "PROPOSED",
      note: "采购员别名匹配到核心 Person，建议合并",
    },
  })

  const supplier = await db.concept.create({
    data: {
      uri: "procurement:Supplier",
      labelZh: "供应商",
      labelEn: "Supplier",
      description: "采购供应商",
      type: "CLASS",
      scope: "DOMAIN",
      status: "PUBLISHED",
      ownerDomainId: procurement.id,
      jsonSchema: JSON.stringify([
        { name: "id", type: "string", required: true, label: "供应商编码" },
        { name: "name", type: "string", required: true, label: "名称" },
        { name: "creditCode", type: "string", label: "统一社会信用代码" },
      ]),
    },
  })

  const procurementReq = await db.concept.create({
    data: {
      uri: "procurement:ProcurementRequest",
      labelZh: "采购申请单",
      labelEn: "ProcurementRequest",
      description: "一次采购的完整申请单",
      type: "CLASS",
      scope: "DOMAIN",
      status: "PUBLISHED",
      ownerDomainId: procurement.id,
      jsonSchema: JSON.stringify([
        { name: "id", type: "string", required: true, label: "单号" },
        { name: "buyer", type: "ref", ref: "Buyer", required: true, label: "采购员" },
        { name: "supplier", type: "ref", ref: "Supplier", required: true, label: "供应商" },
        { name: "items", type: "array", itemRef: "ProcurementItem", required: true, label: "采购明细" },
        { name: "totalAmount", type: "number", label: "总金额" },
      ]),
    },
  })

  await db.domainConcept.createMany({
    data: [
      { domainId: procurement.id, localName: "Buyer", linkedConceptId: buyer.id, status: "PUBLISHED", jsonSchema: "[]" },
      { domainId: procurement.id, localName: "Supplier", linkedConceptId: supplier.id, status: "PUBLISHED", jsonSchema: "[]" },
      { domainId: procurement.id, localName: "ProcurementRequest", linkedConceptId: procurementReq.id, status: "PUBLISHED", jsonSchema: "[]" },
    ],
  })

  await db.domainRelation.createMany({
    data: [
      { domainId: procurement.id, name: "提交", sourceDomainConceptId: buyer.id, targetDomainConceptId: procurementReq.id, relationType: "SUBMIT", cardinality: "1:N" },
      { domainId: procurement.id, name: "对账", sourceDomainConceptId: procurementReq.id, targetDomainConceptId: supplier.id, relationType: "REFERENCES", cardinality: "N:1" },
    ],
  })

  // 采购规则集
  const procRuleset = await db.ruleSet.create({
    data: {
      domainId: procurement.id,
      code: "RS-PROC-CORE",
      name: "采购核心规则集",
      description: "采购场景必跑的基础规则",
      version: 1,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  })

  const procRules = [
    {
      code: "R-PROC-001",
      name: "采购单必须有供应商",
      severity: "ERROR",
      targetConceptId: procurementReq.id,
      messageTemplate: "采购单缺少供应商",
      explanation: "采购必须明确供应商。",
      tags: ["必填"],
      dsl: `- id: R-PROC-001
  name: 采购单必须有供应商
  severity: error
  target: ProcurementRequest
  when:
    isEmpty(supplier)
  message: "采购单缺少供应商"
  explanation: 采购必须明确供应商。
  tags: [必填]`,
    },
    {
      code: "R-PROC-002",
      name: "采购总额超10万需总经理审批",
      severity: "WARNING",
      targetConceptId: procurementReq.id,
      messageTemplate: "采购总额 {{totalAmount}} 元超过 10 万，需总经理审批",
      explanation: "大额采购需总经理审批。",
      tags: ["审批", "大额"],
      dsl: `- id: R-PROC-002
  name: 采购总额超10万需总经理审批
  severity: warning
  target: ProcurementRequest
  when:
    all:
      - isNotEmpty(totalAmount)
      - totalAmount > 100000
  then:
    - require_approval: "总经理"
  message: "采购总额 {{totalAmount}} 元超过 10 万，需总经理审批"
  explanation: 大额采购需总经理审批。
  tags: [审批, 大额]`,
    },
  ]

  for (const r of procRules) {
    await db.rule.create({
      data: {
        rulesetId: procRuleset.id,
        code: r.code,
        name: r.name,
        severity: r.severity,
        targetConceptId: r.targetConceptId,
        dsl: r.dsl,
        messageTemplate: r.messageTemplate,
        explanation: r.explanation,
        status: "PUBLISHED",
        version: 1,
        tags: JSON.stringify(r.tags),
      },
    })
  }

  // ===== 场景 =====
  await db.scenario.create({
    data: {
      domainId: reimbursement.id,
      code: "validate_submission",
      name: "报销提交校验",
      description: "抽取报销材料，构建知识图谱，执行制度规则校验",
      inputSchema: JSON.stringify({ type: "object", properties: { text: { type: "string" } } }),
      rulesetIds: JSON.stringify([ruleset.id]),
      uiSchema: JSON.stringify({ layout: "single-page" }),
      status: "ACTIVE",
    },
  })

  await db.scenario.create({
    data: {
      domainId: procurement.id,
      code: "validate_request",
      name: "采购申请校验",
      description: "抽取采购申请材料，执行预算与供应商规则校验",
      inputSchema: JSON.stringify({ type: "object" }),
      rulesetIds: JSON.stringify([procRuleset.id]),
      status: "ACTIVE",
    },
  })

  return true
}
