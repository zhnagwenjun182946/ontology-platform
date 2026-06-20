/**
 * API Key 鉴权工具 —— 供 /api/v1/ Agent 接口使用。
 *
 * 当前为预留实现：校验 API Key 是否存在于 DB，不做细粒度权限/租户隔离。
 * 默认 key 由 seed 初始化（环境变量 DEFAULT_API_KEY 或随机生成，见启动日志）。
 */
import { db } from "@/lib/db";

export interface AuthContext {
  apiKeyId: string;
  tenantId: string;
  userId: string | null;
}

/**
 * 从请求头提取并校验 API Key。
 * 支持 X-API-Key header 或 Authorization: Bearer <key>。
 * 返回 null 表示未认证。
 */
export async function authenticate(req: Request): Promise<AuthContext | null> {
  const key = extractApiKey(req);
  if (!key) return null;

  const record = await db.apiKey.findUnique({
    where: { key },
    select: { id: true, tenantId: true, userId: true, status: true },
  });

  if (!record || record.status !== "ACTIVE") return null;

  // 更新最后使用时间（不阻塞）
  db.apiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return {
    apiKeyId: record.id,
    tenantId: record.tenantId,
    userId: record.userId,
  };
}

function extractApiKey(req: Request): string | null {
  // X-API-Key header
  const xKey = req.headers.get("x-api-key");
  if (xKey) return xKey.trim();

  // Authorization: Bearer <key>
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  return null;
}

/**
 * 构造 401 响应
 */
export function unauthorizedResponse() {
  return Response.json(
    {
      ok: false,
      error: "UNAUTHORIZED",
      message: "缺少或无效的 API Key。请在 X-API-Key 或 Authorization: Bearer 头中提供。",
    },
    { status: 401 },
  );
}
