'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  Boxes, Search, Filter, GitBranch, Tag, Link2, Target,
  Layers3, ArrowLeftRight, Hash, CornerDownRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

import { useFetch } from './hooks'
import {
  api, domainColor, EQUIV_LABEL, fmtTime, fieldTypeLabel,
  parseJsonSchema, severityStyle, statusBadgeClass, type FieldDef,
} from './lib'
import {
  LoadingState, ErrorState, EmptyState, PageHeader, SectionCard,
  ScopeBadge, StatusBadge, SeverityBadge,
} from './primitives'

// ============ 类型 ============
interface ConceptListItem {
  id: string
  uri: string
  labelZh: string
  labelEn?: string | null
  description?: string | null
  type: string
  scope: string
  status: string
  ownerDomainId?: string | null
  ownerDomain?: { id: string; code: string; nameZh: string; color?: string | null } | null
  aliases?: Array<{ id: string; alias: string; aliasType: string; sourceDomainId?: string | null; confidence: number }>
  version: number
  createdAt: string
  updatedAt: string
  _count: { rulesAsTarget: number; domainConcepts: number }
}

interface ConceptDetail extends ConceptListItem {
  jsonSchema: string
  rulesAsTarget: Array<{ id: string; code: string; name: string; severity: string; ruleset: { id: string; code: string; name: string; domain?: { code: string; nameZh: string } | null } }>
  domainConcepts: Array<{ id: string; domain: { id: string; code: string; nameZh: string }; localName: string; status: string }>
  equivalencesA: Array<{ id: string; equivalenceType: string; status: string; evidence: string; note?: string | null; conceptB: ConceptListItem }>
  equivalencesB: Array<{ id: string; equivalenceType: string; status: string; evidence: string; note?: string | null; conceptA: ConceptListItem }>
}

interface AggMap {
  totalConcepts: number
  totalClusters: number
  totalEquivalences: number
  clusters: Array<{
    clusterId: string
    representativeLabel: string
    representativeUri: string
    hasCore: boolean
    memberCount: number
    members: Array<{ id: string; uri: string; label: string; scope: string; domain: string | null; domainCode: string | null }>
    aliases: string[]
    pendingEquivalences: number
  }>
}

// ============ scope 筛选 ============
const SCOPES: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'CORE', label: '核心' },
  { key: 'DOMAIN', label: '领域' },
]

// ============ 主组件 ============
export function ConceptRepo() {
  const [view, setView] = React.useState<'list' | 'agg'>('list')
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="概念仓库"
        icon={Boxes}
        description="核心本体 + 领域本体，跨领域概念通过等价关系聚合到核心层。"
        actions={
          <Tabs value={view} onValueChange={(v) => setView(v as 'list' | 'agg')}>
            <TabsList>
              <TabsTrigger value="list" className="gap-1.5">
                <Layers3 className="size-3.5" /> 原始列表
              </TabsTrigger>
              <TabsTrigger value="agg" className="gap-1.5">
                <ArrowLeftRight className="size-3.5" /> 聚合视图
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      {view === 'list' ? <ConceptListView /> : <AggregationView />}
    </div>
  )
}

// ============ 原始列表视图 ============
function ConceptListView() {
  const [scope, setScope] = React.useState('all')
  const [q, setQ] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const path = `/concepts?scope=${scope}`
  const { data, loading, error, refetch } = useFetch<ConceptListItem[]>(path)

  React.useEffect(() => {
    if (!selectedId && data && data.length > 0) {
      setSelectedId(data[0].id)
    }
  }, [data, selectedId])

  const filtered = React.useMemo(() => {
    if (!data) return []
    const k = q.trim().toLowerCase()
    if (!k) return data
    return data.filter(c =>
      c.uri.toLowerCase().includes(k) ||
      c.labelZh.toLowerCase().includes(k) ||
      (c.labelEn || '').toLowerCase().includes(k) ||
      (c.description || '').toLowerCase().includes(k)
    )
  }, [data, q])

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      {/* 左：列表 */}
      <SectionCard
        title="概念列表"
        description={`${filtered.length} / ${data?.length ?? 0} 个`}
        bodyClassName="p-0"
        action={
          <Button size="sm" variant="ghost" onClick={refetch} aria-label="刷新">
            <Filter className="size-3.5" /> 刷新
          </Button>
        }
      >
        <div className="flex flex-col gap-2 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索 URI / 名称 / 描述"
              className="h-8 pl-8 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="搜索概念"
            />
          </div>
          <Tabs value={scope} onValueChange={setScope}>
            <TabsList className="grid w-full grid-cols-3">
              {SCOPES.map(s => (
                <TabsTrigger key={s.key} value={s.key} className="text-xs">{s.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="max-h-[640px] overflow-y-auto scrollbar-thin">
          {loading ? (
            <LoadingState label="加载概念…" />
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : filtered.length === 0 ? (
            <EmptyState title="无匹配概念" />
          ) : (
            <ul className="flex flex-col">
              {filtered.map(c => {
                const dc = domainColor(c.ownerDomain?.code)
                const active = c.id === selectedId
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        'flex w-full flex-col gap-1.5 border-l-2 px-3 py-2.5 text-left transition-colors',
                        active
                          ? 'border-l-primary bg-primary/5'
                          : 'border-l-transparent hover:bg-muted/40'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className={cn('size-1.5 shrink-0 rounded-full', dc.dot)} />
                          <span className="truncate text-sm font-medium text-foreground">{c.labelZh}</span>
                          {c.labelEn && <span className="truncate text-[10px] text-muted-foreground">/ {c.labelEn}</span>}
                        </div>
                        <ScopeBadge scope={c.scope} />
                      </div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">{c.uri}</div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {c.ownerDomain && (
                          <span className={cn('rounded px-1.5 py-0.5', dc.bg, dc.text)}>
                            {c.ownerDomain.nameZh}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-0.5">
                          <Target className="size-2.5" />
                          {c._count.rulesAsTarget} 规则
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SectionCard>

      {/* 右：详情 */}
      <ConceptDetailPanel id={selectedId} />
    </div>
  )
}

function ConceptDetailPanel({ id }: { id: string | null }) {
  const { data, loading, error, refetch } = useFetch<ConceptDetail>(id ? `/concepts/${id}` : null)

  if (!id) return <SectionCard title="概念详情"><EmptyState title="选择左侧概念查看详情" /></SectionCard>
  if (loading) return <SectionCard title="概念详情"><LoadingState label="加载概念详情…" /></SectionCard>
  if (error || !data) return <SectionCard title="概念详情"><ErrorState message={error || '加载失败'} onRetry={refetch} /></SectionCard>

  const fields = parseJsonSchema(data.jsonSchema)
  const dc = domainColor(data.ownerDomain?.code)
  const allEqs = [
    ...data.equivalencesA.map(e => ({ ...e, other: e.conceptB, dir: 'A→B' as const })),
    ...data.equivalencesB.map(e => ({ ...e, other: e.conceptA, dir: 'B→A' as const })),
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* 基本信息 */}
      <SectionCard
        title={data.labelZh}
        description={data.description || '无描述'}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <ScopeBadge scope={data.scope} />
            <StatusBadge status={data.status} />
            {data.ownerDomain && (
              <Badge variant="outline" className={cn('gap-1 border-0', dc.bg, dc.text)}>
                <span className={cn('size-1.5 rounded-full', dc.dot)} />
                {data.ownerDomain.nameZh}
              </Badge>
            )}
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <InfoRow icon={Hash} label="URI" value={<code className="font-mono text-foreground">{data.uri}</code>} />
          <InfoRow icon={Tag} label="英文标签" value={data.labelEn || '-'} />
          <InfoRow icon={Layers3} label="类型 / 版本" value={`${data.type} · v${data.version}`} />
          <InfoRow icon={Target} label="被引用" value={`${data._count.rulesAsTarget} 规则 · ${data.domainConcepts.length} 领域`} />
          <InfoRow icon={Link2} label="创建时间" value={fmtTime(data.createdAt)} />
          <InfoRow icon={Link2} label="更新时间" value={fmtTime(data.updatedAt)} />
        </div>
      </SectionCard>

      {/* 字段定义 */}
      <SectionCard
        title="字段定义"
        description={`从 jsonSchema 解析 · ${fields.length} 个字段`}
        bodyClassName="p-0"
      >
        {fields.length === 0 ? (
          <EmptyState title="无字段定义" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">字段</TableHead>
                  <TableHead className="text-xs">类型</TableHead>
                  <TableHead className="text-xs">必填</TableHead>
                  <TableHead className="text-xs">说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map(f => (
                  <TableRow key={f.name} className="text-xs">
                    <TableCell className="font-mono font-medium">{f.name}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{fieldTypeLabel(f as FieldDef)}</TableCell>
                    <TableCell>
                      {f.required ? (
                        <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">必填</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {f.label || '-'}
                      {f.enum && f.enum.length > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground/80">({f.enum.join('/')})</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 等价关系 */}
        <SectionCard
          title="等价关系"
          description={`${allEqs.length} 条`}
          action={<GitBranch className="size-4 text-muted-foreground" />}
        >
          {allEqs.length === 0 ? (
            <EmptyState title="无等价关系" />
          ) : (
            <ul className="flex flex-col gap-2">
              {allEqs.map(e => {
                const odc = domainColor(e.other.ownerDomain?.code)
                return (
                  <li key={e.id} className="flex flex-col gap-1 rounded-md border p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className={cn('border-0', statusBadgeClass(e.status))}>{e.status}</Badge>
                      <span className="text-[10px] text-muted-foreground">{EQUIV_LABEL[e.equivalenceType] || e.equivalenceType}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CornerDownRight className="size-3 text-muted-foreground" />
                      <span className="font-mono text-[11px] text-foreground">{e.other.uri}</span>
                    </div>
                    <div className="flex items-center gap-1.5 pl-4">
                      {e.other.ownerDomain && (
                        <Badge variant="outline" className={cn('border-0', odc.bg, odc.text)}>
                          {e.other.ownerDomain.nameZh}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">{e.other.labelZh}</span>
                    </div>
                    {e.note && <div className="pl-4 text-[10px] italic text-muted-foreground">{e.note}</div>}
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        {/* 别名 */}
        <SectionCard
          title="别名 / 同义词"
          description={`${(data.aliases || []).length} 个`}
          action={<Tag className="size-4 text-muted-foreground" />}
        >
          {(!data.aliases || data.aliases.length === 0) ? (
            <EmptyState title="无别名" />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.aliases.map(a => {
                const adc = domainColor(undefined) // 别名来源领域在响应里只有 id，做安全降级
                return (
                  <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Tag className="size-3 text-muted-foreground" />
                      <span className="font-medium">{a.alias}</span>
                      <Badge variant="outline" className="text-[10px]">{a.aliasType}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>置信度</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className={cn('h-full', a.confidence >= 0.9 ? 'bg-emerald-500' : a.confidence >= 0.7 ? 'bg-amber-500' : 'bg-slate-400')}
                          style={{ width: `${Math.round(a.confidence * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono">{a.confidence.toFixed(2)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* 被引用规则 */}
      <SectionCard
        title="被引用规则"
        description={`${data.rulesAsTarget.length} 条规则以本概念为目标`}
        bodyClassName="p-0"
      >
        {data.rulesAsTarget.length === 0 ? (
          <EmptyState title="无规则引用" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">Code</TableHead>
                  <TableHead className="text-xs">名称</TableHead>
                  <TableHead className="text-xs">严重度</TableHead>
                  <TableHead className="text-xs">规则集</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rulesAsTarget.map(r => (
                  <TableRow key={r.id} className="text-xs">
                    <TableCell className="font-mono">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell><SeverityBadge severity={r.severity} /></TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {r.ruleset.code}
                      {r.ruleset.domain && <span className="ml-1">· {r.ruleset.domain.nameZh}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/30 px-2.5 py-1.5">
      <Icon className="size-3 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium text-foreground">{value}</span>
    </div>
  )
}

// ============ 聚合视图 ============
function AggregationView() {
  const { data, loading, error, refetch } = useFetch<AggMap>('/aggregation/map')

  if (loading) return <LoadingState label="加载聚合地图…" />
  if (error || !data) return <ErrorState message={error || '加载失败'} onRetry={refetch} />

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiMini label="总概念数" value={data.totalConcepts} />
        <KpiMini label="聚合簇数" value={data.totalClusters} accent="emerald" />
        <KpiMini label="等价关系数" value={data.totalEquivalences} accent="amber" />
        <KpiMini label="去重率" value={`${((1 - data.totalClusters / Math.max(data.totalConcepts, 1)) * 100).toFixed(0)}%`} accent="rose" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {data.clusters.map(cluster => {
          const domains = Array.from(new Set(cluster.members.map(m => m.domainCode).filter(Boolean))) as string[]
          return (
            <div
              key={cluster.clusterId}
              className={cn(
                'flex flex-col gap-2.5 rounded-xl border p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-md',
                cluster.hasCore ? 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20' : 'border-border bg-card'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <div className="flex items-center gap-1.5">
                    {cluster.hasCore && (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                        CORE
                      </Badge>
                    )}
                    <span className="truncate text-sm font-semibold">{cluster.representativeLabel}</span>
                  </div>
                  <code className="truncate font-mono text-[10px] text-muted-foreground">{cluster.representativeUri}</code>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {cluster.memberCount}
                  </span>
                  {cluster.pendingEquivalences > 0 && (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                      待评审 {cluster.pendingEquivalences}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {domains.map(code => {
                  const dc = domainColor(code)
                  return (
                    <span key={code} className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', dc.bg, dc.text)}>
                      {code}
                    </span>
                  )
                })}
              </div>
              <div className="mt-1 flex flex-col gap-1 border-t pt-2">
                {cluster.members.map(m => {
                  const mdc = domainColor(m.domainCode)
                  return (
                    <div key={m.id} className="flex items-center gap-1.5 text-[11px]">
                      <span className={cn('size-1.5 rounded-full', mdc.dot)} />
                      <span className="font-mono text-muted-foreground">{m.uri}</span>
                    </div>
                  )
                })}
              </div>
              {cluster.aliases.length > 0 && (
                <div className="flex flex-wrap gap-1 border-t pt-2">
                  {cluster.aliases.slice(0, 6).map((a, i) => (
                    <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {a}
                    </span>
                  ))}
                  {cluster.aliases.length > 6 && (
                    <span className="text-[10px] text-muted-foreground">+{cluster.aliases.length - 6}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KpiMini({ label, value, accent = 'slate' }: { label: string; value: React.ReactNode; accent?: 'slate' | 'emerald' | 'amber' | 'rose' }) {
  const accentMap: Record<string, string> = {
    slate: 'text-slate-700 dark:text-slate-300',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-700 dark:text-amber-300',
    rose: 'text-rose-700 dark:text-rose-300',
  }
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border bg-card p-3">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn('text-xl font-semibold', accentMap[accent])}>{value}</span>
    </div>
  )
}
