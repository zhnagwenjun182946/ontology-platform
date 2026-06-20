import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/audit?entityType=&entityId=&actor=&action=&limit=
export async function GET(req: NextRequest) {
  const entityType = req.nextUrl.searchParams.get("entityType");
  const entityId = req.nextUrl.searchParams.get("entityId");
  const actor = req.nextUrl.searchParams.get("actor");
  const action = req.nextUrl.searchParams.get("action");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100", 10);

  const where: any = {};
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (actor) where.actor = { contains: actor };
  if (action) where.action = { contains: action };

  const logs = await db.auditLog.findMany({
    where,
    take: limit,
    orderBy: { at: "desc" },
  });

  return NextResponse.json({
    total: logs.length,
    items: logs,
  });
}
