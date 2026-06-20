'use client'

import * as React from 'react'
import {
  Boxes, FileCode2, GitBranch, Layers, AlertTriangle, Sparkles,
  ArrowRight, Wand2, Activity, CircleDot, Clock, TrendingUp, Trophy,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Area, AreaChart,
} from 'recharts'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useFetch } from './hooks'
import {
  domainColor, severityStyle, fmtTime, fmtDuration,
} from './lib'
import {
  LoadingState, ErrorState, EmptyState, KpiCard, SectionCard,
  SeverityBadge, StatusBadge,
} from './primitives'
import type { TabKey } from './AppShell'

interface StatsResp {
  concepts: number
  coreConcepts: number
  domains: number
  rules: number
  scenarios: number
  runs: number
  findings: number
  equivalences: number
  pendingEquivalences: number
  recentRuns: Array<{
    id: string
    status: string
    startedAt: string
    finishedAt: string | null
    summary: string | null
    scenario: { id: string; name: string; domain?: { code: string; nameZh: string; color?: string | null } | null }
  }>
  findingsBySeverity: Array<{ severity: string; _count: number }>
  rulesBySeverity: Array<{ severity: string; _count: number }>
  domainsWithCounts: Array<{
    id: string; code: string; nameZh: string; color?: string | null
    _count: { concepts: number; rulesets: number }
    scenarios?: { length: number } | number
  }>
}

interface TrendsResp {
  window: { since: string; until: string }
  totalFindings: number
  trend: Array<{ day: string; ERROR: number; WARNING: number; INFO: number }>
  topRules: Array<{ ruleCode: string; count: number; severity: string }>
  domainStats: Array<{
    domain: string; domainCode: string; total: number
    error: number; warning: number; info: number; runs: number
  }>
}

const PIE_COLORS: Record<string, string> = {
  ERROR: '#f43f5e',
  WARNING: '#f59e0b',
  INFO: '#64748b',
}

export function Dashboard({ onNavigate }: { onNavigate: (k: TabKey) => void }) {
  const { data, loading, error, refetch } = useFetch<StatsResp>('/stats')
  const { data: trends, loading: trendsLoading } = useFetch<TrendsResp>('/dashboard/trends')

  if (loading) return <LoadingState label="加载平台统计数据…" />
  if (error || !data) return <ErrorState message={error || '加载失败'} onRetry={refetch} />

  const sevData = (data.findingsBySeverity || []).map(s => ({
    name: severityStyle(s.severity).label,
    key: s.severity,
    value: s._count,
    color: PIE_COLORS[s.severity] || '#94a3b8',
  }))
  const totalFindings = sevData.reduce((a, b) => a + b.value, 0)
  const rulesBySev = (data.rulesBySeverity || [])

  // 趋势数据
  const trendData = (trends?.trend ?? []).map(t => ({
    day: t.day.slice(5), // MM-DD
    ERROR: t.ERROR,
    WARNING: t.WARNING,
    INFO: t.INFO,
    total: t.ERROR + t.WARNING + t.INFO,
  }))
  const topRules = trends?.topRules ?? []
  const domainStats = trends?.domainStats ?? []

  return (
    <div className="flex flex-col gap-6">
      {/* 欢迎区 */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 dark:from-emerald-950/40 dark:via-card dark:to-teal-950/30 md:p-6">
        <div className="absolute right-4 top-4 hidden sm:block">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
            <Sparkles className="size-7" />
          </div>
        </div>
        <div className="flex flex-col gap-3 pr-0 sm:pr-20">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {data.concepts} 概念 · {data.domains} 领域 · {data.rules} 规则 · {data.scenarios} 场景已就绪
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            欢迎使用智规平台
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            在这里管理业务概念和规则，上传业务材料即可自动识别概念并生成校验规则。
            不同业务领域之间可以共享通用概念（如报销中的"员工"和采购中的"采购员"可视为同一个"人员"），
            所有规则用通俗易懂的方式呈现，业务人员也能看懂。
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={() => onNavigate('concepts')}>
              <Boxes className="size-4" /> 浏览概念仓库
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate('autobuild')}>
              <Wand2 className="size-4" /> 智能建库
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('scenario')}>
              <ArrowRight className="size-4" /> 立即试运行
            </Button>
          </div>
        </div>
      </div>

      {/* KPI 卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="核心概念" value={data.coreConcepts} hint={`共 ${data.concepts} 个概念`} icon={Boxes} accent="emerald" />
        <KpiCard label="领域数" value={data.domains} hint="已创建" icon={Layers} accent="amber" />
        <KpiCard label="规则数" value={data.rules} hint="已发布" icon={FileCode2} accent="emerald" />
        <KpiCard label="运行数" value={data.runs} hint="累计" icon={Activity} accent="slate" />
        <KpiCard label="待评审等价" value={data.pendingEquivalences} hint={`共 ${data.equivalences} 条等价`} icon={GitBranch} accent="amber" />
        <KpiCard label="检查结果数" value={data.findings} hint="累计命中" icon={AlertTriangle} accent="rose" />
      </div>

      {/* 趋势图 + 严重度饼图 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-500" />
              检查结果趋势（近 14 天）
            </span>
          }
          description={`累计 ${trends?.totalFindings ?? 0} 条检查结果`}
          className="lg:col-span-2"
        >
          {trendsLoading ? (
            <LoadingState label="加载趋势…" />
          ) : trendData.length === 0 ? (
            <EmptyState title="暂无趋势数据" hint="运行场景后会有数据" icon={TrendingUp} />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradError" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gradWarn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gradInfo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748b" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid hsl(var(--border))',
                      fontSize: 11,
                      background: 'hsl(var(--background))',
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="ERROR" stackId="1" stroke="#f43f5e" strokeWidth={2} fill="url(#gradError)" />
                  <Area type="monotone" dataKey="WARNING" stackId="1" stroke="#f59e0b" strokeWidth={2} fill="url(#gradWarn)" />
                  <Area type="monotone" dataKey="INFO" stackId="1" stroke="#64748b" strokeWidth={1.5} fill="url(#gradInfo)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="规则严重度分布"
          description={`检查结果共 ${totalFindings} 条`}
        >
          {totalFindings === 0 ? (
            <EmptyState title="暂无检查结果" hint="去试运行一条报销单试试" icon={CircleDot} />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sevData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {sevData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid hsl(var(--border))',
                        fontSize: 12,
                      }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex w-full flex-col gap-1 text-xs">
                {rulesBySev.map(r => (
                  <div key={r.severity} className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${severityStyle(r.severity).dot}`} />
                      <span>{severityStyle(r.severity).label}</span>
                    </div>
                    <span className="font-mono text-muted-foreground">{r._count} 规则</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Top 规则 + 领域统计 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Trophy className="size-4 text-amber-500" />
              Top 命中规则榜
            </span>
          }
          description="近 14 天命中次数最多的规则"
        >
          {topRules.length === 0 ? (
            <EmptyState title="暂无命中数据" hint="运行场景后会有数据" icon={Trophy} />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topRules} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="ruleCode"
                    tick={{ fontSize: 10, fontFamily: 'monospace' }}
                    stroke="hsl(var(--muted-foreground))"
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid hsl(var(--border))',
                      fontSize: 11,
                      background: 'hsl(var(--background))',
                    }}
                    formatter={(v: any) => [`${v} 次`, '命中']}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {topRules.map((r, i) => (
                      <Cell key={i} fill={PIE_COLORS[r.severity] || '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Activity className="size-4 text-emerald-500" />
              领域检查结果分布
            </span>
          }
          description="近 14 天各领域的运行与命中分布"
        >
          {domainStats.length === 0 ? (
            <EmptyState title="暂无领域统计" hint="运行场景后会有数据" icon={Activity} />
          ) : (
            <ul className="flex flex-col gap-3">
              {domainStats.map(d => {
                const dc = domainColor(d.domainCode)
                const errPct = d.total > 0 ? (d.error / d.total) * 100 : 0
                const warnPct = d.total > 0 ? (d.warning / d.total) * 100 : 0
                const infoPct = d.total > 0 ? (d.info / d.total) * 100 : 0
                return (
                  <li key={d.domainCode} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn('size-2.5 rounded-full', dc.dot)} />
                        <span className="text-sm font-medium text-foreground">{d.domain}</span>
                        <Badge variant="outline" className="border-0 bg-slate-100 px-1 text-[10px] dark:bg-slate-800">
                          {d.runs} 次运行
                        </Badge>
                      </div>
                      <span className="text-sm font-semibold text-foreground">{d.total}</span>
                    </div>
                    {/* 堆叠条 */}
                    <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                      <div className="bg-rose-500" style={{ width: `${errPct}%` }} />
                      <div className="bg-amber-500" style={{ width: `${warnPct}%` }} />
                      <div className="bg-slate-500" style={{ width: `${infoPct}%` }} />
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-rose-500" /> 错误 {d.error}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-amber-500" /> 警告 {d.warning}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-slate-500" /> 提示 {d.info}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* 领域覆盖 */}
      <SectionCard
        title="领域覆盖"
        description="各领域已注册概念、规则集与场景"
      >
        {data.domainsWithCounts.length === 0 ? (
          <EmptyState title="暂无领域" hint="请等待数据加载完成" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.domainsWithCounts.map(d => {
              const c = domainColor(d.code)
              const sc = typeof d.scenarios === 'number' ? d.scenarios : (d.scenarios as any)?.length ?? 0
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onNavigate('concepts')}
                  className="group flex flex-col gap-2.5 rounded-lg border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`size-2.5 rounded-full ${c.dot}`} />
                      <span className="font-medium text-foreground">{d.nameZh}</span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">{d.code}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${c.bg} ${c.text}`}>
                      <Boxes className="size-3" /> {d._count.concepts} 概念
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                      <FileCode2 className="size-3" /> {d._count.rulesets} 规则集
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                      <Activity className="size-3" /> {sc} 场景
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* 最近运行 */}
      <SectionCard
        title="最近运行"
        description="最近 5 次执行"
        action={
          <Button size="sm" variant="ghost" onClick={() => onNavigate('runs')}>
            查看全部 <ArrowRight className="size-3.5" />
          </Button>
        }
      >
        {data.recentRuns.length === 0 ? (
          <EmptyState
            title="还没有运行记录"
            hint="前往场景试运行，跑一次报销单校验"
            icon={Clock}
          />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">场景</TableHead>
                  <TableHead className="text-xs">领域</TableHead>
                  <TableHead className="text-xs">状态</TableHead>
                  <TableHead className="text-xs">摘要</TableHead>
                  <TableHead className="text-xs text-right">开始时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentRuns.map(r => {
                  const dom = r.scenario?.domain
                  const c = domainColor(dom?.code)
                  return (
                    <TableRow key={r.id} className="cursor-pointer text-xs" onClick={() => onNavigate('runs')}>
                      <TableCell className="font-medium">{r.scenario?.name ?? '-'}</TableCell>
                      <TableCell>
                        {dom && (
                          <Badge variant="outline" className={`gap-1 ${c.bg} ${c.text} border-0`}>
                            <span className={`size-1.5 rounded-full ${c.dot}`} />
                            {dom.nameZh}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="max-w-md truncate text-muted-foreground">{r.summary ?? '-'}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {fmtTime(r.startedAt)}
                        <div className="text-[10px]">{fmtDuration(r.startedAt, r.finishedAt)}</div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
