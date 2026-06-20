'use client'

import * as React from 'react'
import {
  Grid3x3, RefreshCw, Boxes, GitBranch, ArrowRight, AlertCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { useFetch } from './hooks'
import { domainColor } from './lib'
import {
  LoadingState, ErrorState, EmptyState, PageHeader, SectionCard,
} from './primitives'

interface DomainInfo {
  id: string
  code: string
  name: string
  color?: string | null
  conceptCount: number
}

interface MatrixCell {
  a: DomainInfo
  b: DomainInfo
  sharedConcepts: Array<{ id: string; uri: string; label: string }>
  pendingEquivalences: number
}

interface OverlapResp {
  domains: DomainInfo[]
  matrix: MatrixCell[]
}

export function OverlapMatrix() {
  const { data, loading, error, refetch } = useFetch<OverlapResp>('/aggregation/overlap-matrix')
  const [selected, setSelected] = React.useState<MatrixCell | null>(null)

  if (loading) return <LoadingState label="加载重叠矩阵…" />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  const domains = data?.domains ?? []
  const matrix = data?.matrix ?? []

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="跨领域重叠矩阵"
        icon={Grid3x3}
        description="可视化任意两个领域之间共享的概念，发现可下沉到核心本体的候选"
        actions={
          <Button size="sm" variant="ghost" onClick={refetch}>
            <RefreshCw className="size-3.5" /> 刷新
          </Button>
        }
      />

      {/* 概览 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="领域数" value={domains.length} accent="emerald" />
        <StatCard label="领域对" value={matrix.length} accent="slate" />
        <StatCard
          label="有共享的对"
          value={matrix.filter(m => m.sharedConcepts.length > 0).length}
          accent="amber"
        />
        <StatCard
          label="共享概念总数"
          value={matrix.reduce((s, m) => s + m.sharedConcepts.length, 0)}
          accent="emerald"
        />
      </div>

      {/* 矩阵网格 */}
      <SectionCard
        title="领域对矩阵"
        description="点击单元格查看共享概念详情"
      >
        {matrix.length === 0 ? (
          <EmptyState title="无领域对" hint="需要至少 2 个领域" icon={Grid3x3} />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {matrix.map((cell, idx) => {
              const shared = cell.sharedConcepts.length
              const hasPending = cell.pendingEquivalences > 0
              const isSelected = selected?.a.id === cell.a.id && selected?.b.id === cell.b.id
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelected(isSelected ? null : cell)}
                  className={cn(
                    'group flex flex-col gap-2 rounded-lg border p-3 text-left transition-all hover:shadow-md',
                    shared > 0
                      ? 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 dark:border-emerald-900 dark:bg-emerald-950/20'
                      : 'border-slate-200 bg-card hover:border-slate-300 dark:border-slate-700',
                    isSelected && 'ring-2 ring-primary/40'
                  )}
                >
                  {/* 两个领域 */}
                  <div className="flex items-center gap-2">
                    <DomainChip d={cell.a} />
                    <ArrowRight className="size-3 text-muted-foreground" />
                    <DomainChip d={cell.b} />
                  </div>

                  {/* 共享数 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Boxes className={cn('size-3.5', shared > 0 ? 'text-emerald-500' : 'text-muted-foreground')} />
                      <span className={cn('text-sm font-semibold', shared > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>
                        {shared} 个共享概念
                      </span>
                    </div>
                    {hasPending && (
                      <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300">
                        <AlertCircle className="size-2.5" /> {cell.pendingEquivalences} 待评审
                      </Badge>
                    )}
                  </div>

                  {/* 共享概念预览 */}
                  {shared > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {cell.sharedConcepts.slice(0, 3).map(c => (
                        <Badge key={c.id} variant="outline" className="border-0 bg-card px-1.5 py-0 text-[10px]">
                          {c.label}
                        </Badge>
                      ))}
                      {shared > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{shared - 3} 更多</span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* 选中详情 */}
      {selected && <CellDetail cell={selected} />}
    </div>
  )
}

function DomainChip({ d }: { d: DomainInfo }) {
  const dc = domainColor(d.code)
  return (
    <div className={cn('flex items-center gap-1.5 rounded-md px-2 py-1', dc.bg, dc.text)}>
      <span className={cn('size-1.5 rounded-full', dc.dot)} />
      <span className="text-xs font-medium">{d.name}</span>
      <span className="text-[10px] opacity-70">({d.conceptCount})</span>
    </div>
  )
}

function CellDetail({ cell }: { cell: MatrixCell }) {
  const shared = cell.sharedConcepts
  const dcA = domainColor(cell.a.code)
  const dcB = domainColor(cell.b.code)

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <GitBranch className="size-4 text-emerald-500" />
          {cell.a.name} ↔ {cell.b.name} · 共享概念详情
        </span>
      }
      description={`${shared.length} 个共享概念 · ${cell.pendingEquivalences} 条待评审等价`}
    >
      {shared.length === 0 ? (
        <EmptyState title="无共享概念" hint="这两个领域目前没有交集" icon={Boxes} />
      ) : (
        <ul className="flex flex-col gap-2">
          {shared.map(c => (
            <li key={c.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                <Boxes className="size-4 text-emerald-500" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{c.label}</span>
                  <code className="font-mono text-[10px] text-muted-foreground">{c.uri}</code>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className={cn('rounded px-1', dcA.bg, dcA.text)}>{cell.a.name}</span>
                  <span className="opacity-50">·</span>
                  <span className={cn('rounded px-1', dcB.bg, dcB.text)}>{cell.b.name}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {cell.pendingEquivalences > 0 && (
        <div className="mt-3 rounded-md border border-violet-200 bg-violet-50 p-3 text-xs text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300">
          <AlertCircle className="mr-1 inline size-3" />
          这两个领域有 <strong>{cell.pendingEquivalences}</strong> 条待评审的等价关系。
          建议到「概念仓库 → 聚合视图」确认后，可将公共概念下沉到核心本体。
        </div>
      )}
    </SectionCard>
  )
}

function StatCard({ label, value, accent = 'slate' }: {
  label: string
  value: React.ReactNode
  accent?: 'emerald' | 'amber' | 'rose' | 'slate'
}) {
  const accentMap: Record<string, string> = {
    emerald: 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20',
    amber: 'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20',
    rose: 'border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20',
    slate: 'border-slate-200 bg-card dark:border-slate-700',
  }
  return (
    <div className={cn('rounded-lg border p-3', accentMap[accent])}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
    </div>
  )
}
