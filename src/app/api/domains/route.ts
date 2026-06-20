import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const domains = await db.domain.findMany({
    include: { _count: { select: { concepts: true, rulesets: true, scenarios: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(domains);
}

// POST /api/domains - 新建领域
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.code || !body.nameZh) {
    return NextResponse.json({ error: "code 和 nameZh 必填" }, { status: 400 });
  }
  // 检查 code 唯一
  const exists = await db.domain.findUnique({ where: { code: body.code } });
  if (exists) {
    return NextResponse.json({ error: `领域 code '${body.code}' 已存在` }, { status: 409 });
  }
  const created = await db.domain.create({
    data: {
      code: body.code,
      nameZh: body.nameZh,
      nameEn: body.nameEn ?? null,
      description: body.description ?? null,
      owner: body.owner ?? null,
      icon: body.icon ?? "boxes",
      color: body.color ?? "#10b981",
      status: "ACTIVE",
    },
  });
  await db.auditLog.create({
    data: {
      actor: body.actor ?? "web",
      action: "CREATE_DOMAIN",
      entityType: "Domain",
      entityId: created.id,
      afterJson: JSON.stringify(created),
    },
  });
  return NextResponse.json(created, { status: 201 });
}
