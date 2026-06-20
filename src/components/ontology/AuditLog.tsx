'use client'

import * as React from 'react'
import {
  ScrollText, Search, Filter, User, GitBranch, Code2, Boxes,
  PlayCircle, FileText, History, RefreshCw, ChevronRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { useFetch } from './hooks'
import { api, fmtTime } from './lib'
import {
  LoadingState, ErrorState, EmptyState, PageHeader, SectionCard,
} from './primitives'

interface AuditItem {
  id: string
  actor: string
  action: string
  entityType: string
  entityId?: string | null
  beforeJson?: string | null
  afterJson?: string | null
  at: string
}

interface AuditResp {
  total: number
  items: AuditItem[]
}

// 实体类型 → 图标 + 颜色
const ENTITY_META: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  Concept: { icon: Boxes, color: 'text-emerald-600 dark:text-emerald-400', label: '概念' },
  Rule: { icon: Code2, color: 'text-amber-600 dark:text-amber-400', label: '规则' },
  RuleSet: { icon: GitBranch, color: 'text-teal-600 dark:text-teal-400', label: '规则集' },
  Domain: { icon: Boxes, color: 'text-rose-600 dark:text-rose-400', label: '领域' },
  Scenario: { icon: PlayCircle, color: 'text-violet-600 dark:text-violet-400', label: '场景' },
  RunRecord: { icon: History, color: 'text-slate-600 dark:text-slate-400', label: '运行' },
}

function entityMeta(t: string) {
  return ENTITY_META[t] ?? { icon: FileText, color: 'text-slate-600 dark:text-slate-400', label: t }
}

// 动作 → 颜色
const ACTION_STYLE: Record<string, string> = {
  CREATE_CONCEPT: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900',
  UPDATE_CONCEPT: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900',
  UPDATE_RULE: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900',
  CREATE_RULE: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900',
  DELETE: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900',
  PUBLISH: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-900',
}

function actionStyle(a: string) {
  return ACTION_STYLE[a] ?? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
}

// 把动作翻译成中文
const ACTION_LABEL: Record<string, string> = {
  CREATE_CONCEPT: '创建概念',
  UPDATE_CONCEPT: '更新概念',
  CREATE_RULE: '创建规则',
  UPDATE_RULE: '更新规则',
  DELETE: '删除',
  PUBLISH: '发布',
}

function actionLabel(a: string) {
  return ACTION_LABEL[a] ?? a
}

export function AuditLog() {
  const [filterType, setFilterType] = React.useState<string>('all')
  const [filterAction, setFilterAction] = React.useState<string>('all')
  const [filterActor, setFilterActor] = React.useState('')
  const [query, setQuery] = React.useState('')

  // 构建 query string
  const qs = React.useMemo(() => {
    const p = new URLSearchParams()
    if (filterType !== 'all') p.set('entityType', filterType)
    if (filterAction !== 'all') p.set('action', filterAction)
    if (filterActor.trim()) p.set('actor', filterActor.trim())
    p.set('limit', '200')
    return `?${p.toString()}`
  }, [filterType, filterAction, filterActor])

  const { data, loading, error, refetch } = useFetch<AuditResp>(`/audit${qs}`)

  // 客户端二次过滤（按 actor 模糊匹配 + 关键字）
  const filtered = React.useMemo(() => {
    if (!data?.items) return []
    if (!query.trim()) return data.items
    const q = query.toLowerCase()
    return data.items.filter(item =>
      item.action.toLowerCase().includes(q) ||
      item.entityType.toLowerCase().includes(q) ||
      (item.entityId ?? '').toLowerCase().includes(q) ||
      (item.beforeJson ?? '').toLowerCase().includes(q) ||
      (item.afterJson ?? '').toLowerCase().includes(q)
    )
  }, [data, query])

  // 统计：按动作聚合
  const actionCounts = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const it of filtered) {
      m.set(it.action, (m.get(it.action) ?? 0) + 1)
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [filtered])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="审计日志"
        icon={ScrollText}
        description="平台所有变更操作的留痕记录，可按实体类型/动作/操作人筛选"
        actions={
          <Button size="sm" variant="ghost" onClick={refetch}>
            <RefreshCw className="size-3.5" /> 刷新
          </Button>
        }
      />

      {/* 筛选区 */}
      <SectionCard title="筛选" description={`共 ${data?.total ?? 0} 条记录`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">实体类型</label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="Concept">概念</SelectItem>
                <SelectItem value="Rule">规则</SelectItem>
                <SelectItem value="RuleSet">规则集</SelectItem>
                <SelectItem value="Domain">领域</SelectItem>
                <SelectItem value="Scenario">场景</SelectItem>
                <SelectItem value="RunRecord">运行</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">动作</label>
            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="CREATE_CONCEPT">创建概念</SelectItem>
                <SelectItem value="UPDATE_CONCEPT">更新概念</SelectItem>
                <SelectItem value="CREATE_RULE">创建规则</SelectItem>
                <SelectItem value="UPDATE_RULE">更新规则</SelectItem>
                <SelectItem value="PUBLISH">发布</SelectItem>
                <SelectItem value="DELETE">删除</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">操作人</label>
            <Input
              value={filterActor}
              onChange={(e) => setFilterActor(e.target.value)}
              placeholder="如 web / system"
              className="h-9 text-xs"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">关键字（含 JSON 内容）</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索动作/实体/字段…"
                className="h-9 pl-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* 动作分布徽章 */}
        {actionCounts.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
            <span className="text-[11px] text-muted-foreground">动作分布：</span>
            {actionCounts.map(([action, count]) => (
              <Badge key={action} variant="outline" className={cn('gap-1 border', actionStyle(action))}>
                {actionLabel(action)} <span className="font-mono">{count}</span>
              </Badge>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 日志列表 */}
      <SectionCard
        title="日志明细"
        description={`${filtered.length} 条匹配`}
      >
        {loading ? (
          <LoadingState label="加载审计日志…" />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : filtered.length === 0 ? (
          <EmptyState title="无审计日志" hint="当前筛选条件下没有记录" icon={ScrollText} />
        ) : (
          <ul className="flex flex-col gap-2 max-h-[640px] overflow-y-auto scrollbar-thin pr-1">
            {filtered.map((item) => (
              <AuditRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

function AuditRow({ item }: { item: AuditItem }) {
  const [expanded, setExpanded] = React.useState(false)
  const meta = entityMeta(item.entityType)
  const Icon = meta.icon

  let before: any = null
  let after: any = null
  try { if (item.beforeJson) before = JSON.parse(item.beforeJson) } catch {}
  try { if (item.afterJson) after = JSON.parse(item.afterJson) } catch {}

  // 提取关键字段用于摘要
  const summaryFields = after
    ? Object.entries(after).filter(([k]) =>
        ['labelZh', 'labelEn', 'name', 'code', 'severity', 'uri', 'status'].includes(k)
      ).slice(0, 3)
    : before
    ? Object.entries(before).filter(([k]) =>
        ['labelZh', 'labelEn', 'name', 'code', 'severity', 'uri', 'status'].includes(k)
      ).slice(0, 3)
    : []

  return (
    <li className="overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50', meta.color)}>
          <Icon className="size-4" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn('border', actionStyle(item.action))}>
              {actionLabel(item.action)}
            </Badge>
            <span className="text-xs text-muted-foreground">{meta.label}</span>
            {item.entityId && (
              <code className="font-mono text-[10px] text-muted-foreground/70">{item.entityId.slice(-8)}</code>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground">{fmtTime(item.at)}</span>
          </div>
          {/* 摘要字段 */}
          {summaryFields.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
              {summaryFields.map(([k, v]) => (
                <span key={k} className="text-muted-foreground">
                  <span className="text-muted-foreground/70">{k}:</span>{' '}
                  <span className="font-medium text-foreground">{String(v)}</span>
                </span>
              ))}
            </div>
          )}
          {/* 操作人 */}
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <User className="size-3" />
            <span>{item.actor}</span>
          </div>
        </div>
        <ChevronRight className={cn('mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
      </button>

      {expanded && (before || after) && (
        <div className="grid gap-2 border-t bg-muted/30 p-3 sm:grid-cols-2">
          {before && (
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">变更前</div>
              <pre className="overflow-x-auto rounded bg-rose-50 p-2 font-mono text-[10px] text-rose-900 dark:bg-rose-950/40 dark:text-rose-200 scrollbar-thin">
                <code>{JSON.stringify(before, null, 2)}</code>
              </pre>
            </div>
          )}
          {after && (
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">变更后</div>
              <pre className="overflow-x-auto rounded bg-emerald-50 p-2 font-mono text-[10px] text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 scrollbar-thin">
                <code>{JSON.stringify(after, null, 2)}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
