/**
 * 种子数据 - 核心概念（Person/Organization/Money/Document）
 * 启动时自动注入，保证平台一打开就有核心本体可用。
 * 默认凭据（管理员/API Key）优先从环境变量读，未设则随机生成（见日志）。
 */
import { db } from "@/lib/db"
import { randomBytes } from "crypto"

/** 生成随机 token（hex），用于未配置环境变量时的默认凭据。 */
function randomToken(len: number): string {
  return randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len)
}

export async function ensureSeed() {
  // ===== 默认租户 / 用户 / API Key =====
  // 凭据优先从环境变量读；未设则随机生成并打印到日志，避免开源后默认凭据被滥用。
  const adminUser = process.env.ADMIN_USERNAME ?? "admin";
  const adminPass = process.env.ADMIN_PASSWORD ?? randomToken(24);
  const apiKey = process.env.DEFAULT_API_KEY ?? `sk-${randomToken(32)}`;

  await db.tenant.upsert({
    where: { code: "default" },
    update: {},
    create: { code: "default", name: "默认租户", status: "ACTIVE" },
  })
  await db.user.upsert({
    where: { username: adminUser },
    update: {},
    create: { username: adminUser, passwordHash: adminPass, displayName: "管理员", role: "ADMIN", status: "ACTIVE", tenantId: "default" },
  })
  await db.apiKey.upsert({
    where: { key: apiKey },
    update: {},
    create: { key: apiKey, name: "默认 API Key", status: "ACTIVE", tenantId: "default" },
  })

  // 首次初始化时打印凭据（仅当未通过环境变量显式设置时）
  if (!process.env.ADMIN_PASSWORD || !process.env.DEFAULT_API_KEY) {
    console.log("========================================")
    console.log("[Seed] 初始凭据（请妥善保存，仅显示一次）：")
    console.log(`  管理员账号：${adminUser} / ${adminPass}`)
    console.log(`  API Key：${apiKey}`)
    console.log("  生产环境建议通过 ADMIN_PASSWORD / DEFAULT_API_KEY 环境变量设置。")
    console.log("========================================")
  }

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


  return true
}
