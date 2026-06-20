/**
 * 共享类型 + 工具函数 + 颜色映射
 * 企业级本体平台前端共享层
 */

// ============ 领域色 ============
// 每个领域一个主色（避开 indigo/blue），与种子数据 Domain.color 对齐
export const DOMAIN_COLORS: Record<string, { bg: string; text: string; ring: string; dot: string; soft: string }> = {
  reimbursement: {
    bg: "bg-emerald-100 dark:bg-emerald-950/50",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-500/30",
    dot: "bg-emerald-500",
    soft: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  procurement: {
    bg: "bg-amber-100 dark:bg-amber-950/50",
    text: "text-amber-700 dark:text-amber-300",
    ring: "ring-amber-500/30",
    dot: "bg-amber-500",
    soft: "bg-amber-50 dark:bg-amber-950/30",
  },
  contract: {
    bg: "bg-rose-100 dark:bg-rose-950/50",
    text: "text-rose-700 dark:text-rose-300",
    ring: "ring-rose-500/30",
    dot: "bg-rose-500",
    soft: "bg-rose-50 dark:bg-rose-950/30",
  },
  quality: {
    bg: "bg-teal-100 dark:bg-teal-950/50",
    text: "text-teal-700 dark:text-teal-300",
    ring: "ring-teal-500/30",
    dot: "bg-teal-500",
    soft: "bg-teal-50 dark:bg-teal-950/30",
  },
  default: {
    bg: "bg-slate-100 dark:bg-slate-800/50",
    text: "text-slate-700 dark:text-slate-300",
    ring: "ring-slate-500/30",
    dot: "bg-slate-500",
    soft: "bg-slate-50 dark:bg-slate-800/30",
  },
}

export function domainColor(code?: string | null) {
  if (!code) return DOMAIN_COLORS.default
  return DOMAIN_COLORS[code] ?? DOMAIN_COLORS.default
}

// 用于 SVG 图谱的实心色（hex），匹配上面 Tailwind 调色
export const DOMAIN_HEX: Record<string, string> = {
  reimbursement: "#10b981",
  procurement: "#f59e0b",
  contract: "#f43f5e",
  quality: "#14b8a6",
  default: "#64748b",
  core: "#0f172a", // 核心概念用深 slate
}

export function domainHex(code?: string | null) {
  if (!code) return DOMAIN_HEX.default
  return DOMAIN_HEX[code] ?? DOMAIN_HEX.default
}

// ============ severity ============
export type Severity = "ERROR" | "WARNING" | "INFO"
export const SEVERITY_STYLE: Record<Severity, { label: string; badge: string; dot: string; row: string; bar: string; hex: string }> = {
  ERROR: {
    label: "错误",
    badge: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900",
    dot: "bg-rose-500",
    row: "border-l-rose-500",
    bar: "bg-rose-500",
    hex: "#f43f5e",
  },
  WARNING: {
    label: "警告",
    badge: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
    dot: "bg-amber-500",
    row: "border-l-amber-500",
    bar: "bg-amber-500",
    hex: "#f59e0b",
  },
  INFO: {
    label: "提示",
    badge: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700",
    dot: "bg-slate-500",
    row: "border-l-slate-400",
    bar: "bg-slate-500",
    hex: "#64748b",
  },
}

export function severityStyle(s: string): typeof SEVERITY_STYLE[Severity] {
  const key = (s || "INFO").toUpperCase() as Severity
  return SEVERITY_STYLE[key] ?? SEVERITY_STYLE.INFO
}

// ============ 状态徽章 ============
export function statusBadgeClass(status?: string | null) {
  switch ((status || "").toUpperCase()) {
    case "PUBLISHED":
    case "ACTIVE":
    case "CONFIRMED":
    case "SUCCESS":
      return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900"
    case "DRAFT":
    case "PENDING":
    case "RUNNING":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900"
    case "PROPOSED":
      return "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900"
    case "DEPRECATED":
    case "FAILED":
    case "REJECTED":
    case "ARCHIVED":
      return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900"
    default:
      return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
  }
}

// ============ 等价类型 ============
export const EQUIV_LABEL: Record<string, string> = {
  EXACT: "完全等价",
  NARROW: "窄义（子类型）",
  BROAD: "宽义（父类型）",
  RELATED: "相关",
}

// ============ 时间格式化 ============
export function fmtTime(input?: string | Date | null): string {
  if (!input) return "-"
  const d = typeof input === "string" ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return "-"
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtDuration(start?: string | Date | null, end?: string | Date | null): string {
  if (!start) return "-"
  const s = typeof start === "string" ? new Date(start) : start
  const e = end ? (typeof end === "string" ? new Date(end) : end) : new Date()
  const ms = e.getTime() - s.getTime()
  if (ms < 0) return "-"
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

// ============ JSON Schema 字段解析 ============
export interface FieldDef {
  name: string
  type: string
  required?: boolean
  label?: string
  description?: string
  enum?: string[]
  ref?: string
  itemRef?: string
  default?: any
}

export function parseJsonSchema(raw?: string | null): FieldDef[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as FieldDef[]
  } catch {
    return []
  }
}

export function fieldTypeLabel(f: FieldDef): string {
  if (f.type === "ref" && f.ref) return `→ ${f.ref}`
  if (f.type === "array" && f.itemRef) return `${f.itemRef}[]`
  if (f.type === "array") return "array"
  if (f.enum && f.enum.length) return `${f.type} (enum)`
  return f.type
}

// ============ API 客户端 ============
const API_BASE = "/api"

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.status = status
  }
}

export async function api<T = any>(
  path: string,
  init?: RequestInit & { json?: any }
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  }
  let body = init?.body
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(init.json)
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    body,
    cache: "no-store",
  })
  const text = await res.text()
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`
    throw new ApiError(msg, res.status)
  }
  return data as T
}

// ============ 简单 JSON 美化 ============
export function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}
