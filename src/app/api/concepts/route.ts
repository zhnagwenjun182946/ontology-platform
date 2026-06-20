import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope") || "all";
  const where: any = {};
  if (scope !== "all") where.scope = scope;

  const concepts = await db.concept.findMany({
    where,
    include: {
      aliases: true,
      ownerDomain: true,
      _count: { select: { rulesAsTarget: true, domainConcepts: true } },
    },
    orderBy: [{ scope: "asc" }, { labelZh: "asc" }],
  });
  return NextResponse.json(concepts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const created = await db.concept.create({
    data: {
      uri: body.uri,
      labelZh: body.labelZh,
      labelEn: body.labelEn ?? null,
      description: body.description ?? null,
      type: body.type ?? "CLASS",
      scope: body.scope ?? "DOMAIN",
      status: "DRAFT",
      ownerDomainId: body.ownerDomainId ?? null,
      jsonSchema: JSON.stringify(body.jsonSchema ?? []),
      createdBy: body.createdBy ?? "web",
    },
  });
  await db.auditLog.create({
    data: {
      actor: body.createdBy ?? "web",
      action: "CREATE_CONCEPT",
      entityType: "Concept",
      entityId: created.id,
      afterJson: JSON.stringify(created),
    },
  });
  return NextResponse.json(created);
}
