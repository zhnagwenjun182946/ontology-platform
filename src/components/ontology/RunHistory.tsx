'use client'

import * as React from 'react'
import { History, RefreshCw, ChevronRight, Clock, ListChecks, Boxes, FileText, ClipboardCopy } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import { useFetch } from './hooks'
import { api, domainColor, fmtTime, fmtDuration, prettyJson, severityStyle } from './lib'
import {
  LoadingState, ErrorState, EmptyState, PageHeader, SectionCard,
  SeverityBadge, StatusBadge,
} from './primitives'
import { InstanceGraph, type InstanceExtracted, type InstanceFinding } from './InstanceGraph'
import { generateRunReport } from './runReport'
import { Pagination } from './Pagination'

interface RunListItem {
  id: string
  status: string
  startedAt: string
  finishedAt: string | null
  summary: string | null
  scenario: { id: string; name: string; domain?: { code: string; nameZh: string; color?: string | null } | null }
  _count: { findings: number; extracted: number }
}

interface RunDetail extends RunListItem {
  error?: string | null
  domainVersion?: string | null
  inputDocuments?: string
  extractionJson?: string | null
  extractionMeta?: string | null
  findings: Array<{
    id: string
    severity: string
    targetPath?: string | null
    message: string
    contextJson?: string
    rule?: { id: string; code: string; name: string; severity: string } | null
    ruleCode?: string | null
  }>
  extracted: Array<{
    id: string
    conceptLabel?: string | null
    jsonPayload: string
  }>
}

const STATUS_FILTER: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'SUCCESS', label: '成功' },
  { key: 'FAILED', label: '失败' },
  { key: 'RUNNING', label: '运行中' },
]

export function RunHistory() {
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [page, setPage] = React.useState(1)
  const { data, loading, error, refetch } = useFetch<RunListItem[]>('/runs?limit=50')

  const filtered = React.useMemo(() => {
    if (!data) return []
    if (statusFilter === 'all') return data
    return data.filter(r => r.status === statusFilter)
  }, [data, statusFilter])

  // 前端分页
  const pageSize = 15
  const totalPages = Math.ceil(filtered.length / pageSize)
  const currentPage = Math.min(page, totalPages || 1)
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  React.useEffect(() => { setPage(1) }, [statusFilter])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="运行记录"
        icon={History}
        description="所有场景执行的历史记录，点击查看检查结果和提取的数据。"
        actions={
          <Button size="sm" variant="outline" onClick={refetch}>
            <RefreshCw className="size-3.5" /> 刷新
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            {STATUS_FILTER.map(s => (
              <TabsTrigger key={s.key} value={s.key} className="text-xs">{s.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <span className="ml-auto text-xs text-muted-foreground">
          共 {filtered.length} 条记录
        </span>
      </div>

      <SectionCard bodyClassName="p-0">
        {loading ? (
          <LoadingState label="加载运行记录…" />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : filtered.length === 0 ? (
          <EmptyState title="无运行记录" hint="前往场景试运行跑一次" icon={Clock} />
        ) : (
          <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">场景</TableHead>
                  <TableHead className="text-xs">领域</TableHead>
                  <TableHead className="text-xs">状态</TableHead>
                  <TableHead className="text-xs text-center">检查结果</TableHead>
                  <TableHead className="text-xs text-center">抽取</TableHead>
                  <TableHead className="text-xs">开始时间</TableHead>
                  <TableHead className="text-xs text-right">耗时</TableHead>
                  <TableHead className="text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map(r => {
                  const dom = r.scenario?.domain
                  const c = domainColor(dom?.code)
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer text-xs"
                      onClick={() => setSelectedId(r.id)}
                    >
                      <TableCell className="font-medium text-foreground">{r.scenario?.name ?? '-'}</TableCell>
                      <TableCell>
                        {dom && (
                          <Badge variant="outline" className={cn('gap-1 border-0', c.bg, c.text)}>
                            <span className={cn('size-1.5 rounded-full', c.dot)} />
                            {dom.nameZh}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-center font-mono">
                        <span className={cn(
                          'inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                          r._count.findings > 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        )}>
                          {r._count.findings}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono text-muted-foreground">{r._count.extracted}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{fmtTime(r.startedAt)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtDuration(r.startedAt, r.finishedAt)}</TableCell>
                      <TableCell><ChevronRight className="size-3 text-muted-foreground" /></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination total={filtered.length} page={currentPage} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </SectionCard>

      <RunDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  )
}

function RunDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const open = !!id
  const [detail, setDetail] = React.useState<RunDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!id) {
      setDetail(null)
      setError(null)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    api<RunDetail>(`/runs/${id}`)
      .then(d => {
        if (!alive) return
        setDetail(d)
        setLoading(false)
      })
      .catch(e => {
        if (!alive) return
        setError(e.message || '加载失败')
        setLoading(false)
      })
    return () => { alive = false }
  }, [id])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex h-[92vh] w-[96vw] !max-w-[96vw] !p-0 flex-col gap-0 overflow-hidden">
        <DialogHeader className="shrink-0 border-b px-6 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {detail?.scenario?.name ?? '运行详情'}
            {detail && <StatusBadge status={detail.status} />}
          </DialogTitle>
          <DialogDescription>
            运行 ID <code className="font-mono text-[10px]">{id}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="flex flex-col gap-3">
          {loading ? (
            <LoadingState label="加载运行详情…" />
          ) : error ? (
            <ErrorState message={error} />
          ) : !detail ? null : (
            <>
              {/* 摘要 */}
              <div className="grid grid-cols-2 gap-2">
                <MiniStat icon={ListChecks} label="检查结果" value={detail.findings.length} accent={detail.findings.length > 0 ? 'rose' : 'emerald'} />
                <MiniStat icon={Boxes} label="抽取对象" value={detail.extracted.length} accent="slate" />
              </div>
              {detail.summary && (
                <div className="rounded-md bg-muted/40 p-2.5 text-xs">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">摘要</div>
                  <div className="text-foreground">{detail.summary}</div>
                </div>
              )}
              <div className="flex items-center justify-between rounded-md border bg-card p-2.5 text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">开始</span>
                  <span className="font-mono text-foreground">{fmtTime(detail.startedAt)}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[10px] text-muted-foreground">耗时</span>
                  <span className="font-mono text-foreground">{fmtDuration(detail.startedAt, detail.finishedAt)}</span>
                </div>
              </div>

              {detail.error && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                  <div className="font-medium">错误信息</div>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{detail.error}</pre>
                </div>
              )}

              <Tabs defaultValue="findings">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="findings" className="text-xs">检查结果 ({detail.findings.length})</TabsTrigger>
                  <TabsTrigger value="graph" className="text-xs">关系图</TabsTrigger>
                  <TabsTrigger value="report" className="text-xs">运行报告</TabsTrigger>
                  <TabsTrigger value="extracted" className="text-xs">抽取对象 ({detail.extracted.length})</TabsTrigger>
                  <TabsTrigger value="raw" className="text-xs">原始数据</TabsTrigger>
                </TabsList>
                <TabsContent value="findings" className="mt-2">
                  {detail.findings.length === 0 ? (
                    <EmptyState title="无检查结果" hint="所有规则均通过" icon={ListChecks} />
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {[...detail.findings]
                        .sort((a, b) => {
                          const o: Record<string, number> = { ERROR: 0, WARNING: 1, INFO: 2 }
                          return (o[a.severity] ?? 3) - (o[b.severity] ?? 3)
                        })
                        .map(f => {
                          const s = severityStyle(f.severity)
                          return (
                            <li key={f.id} className={cn('rounded-md border-l-4 bg-card p-2.5 text-xs', s.row)}>
                              <div className="flex items-center gap-1.5">
                                {(f.rule?.code || f.ruleCode) && (
                                  <code className="font-mono text-[11px] font-semibold">{f.rule?.code || f.ruleCode}</code>
                                )}
                                <SeverityBadge severity={f.severity} />
                                {f.targetPath && (
                                  <code className="font-mono text-[10px] text-muted-foreground">@ {f.targetPath}</code>
                                )}
                              </div>
                              <div className="mt-1 text-foreground">{f.message}</div>
                              {f.contextJson && f.contextJson !== '{}' && (
                                <pre className="mt-1.5 overflow-x-auto rounded bg-muted/40 p-1.5 font-mono text-[10px] text-muted-foreground scrollbar-thin">
                                  <code>{prettyJson(f.contextJson)}</code>
                                </pre>
                              )}
                            </li>
                          )
                        })}
                    </ul>
                  )}
                </TabsContent>
                <TabsContent value="graph" className="mt-2">
                  {detail.extracted.length === 0 ? (
                    <EmptyState title="无抽取对象" hint="无可可视化的实体" icon={Boxes} />
                  ) : (
                    <InstanceGraph
                      extracted={detail.extracted.map((e): InstanceExtracted => ({
                        id: e.id,
                        conceptLabel: e.conceptLabel,
                        jsonPayload: (() => {
                          try { return typeof e.jsonPayload === 'string' ? JSON.parse(e.jsonPayload) : e.jsonPayload } catch { return {} }
                        })(),
                      }))}
                      findings={detail.findings.map((f): InstanceFinding => ({
                        id: f.id,
                        ruleCode: f.ruleCode ?? f.rule?.code ?? null,
                        severity: f.severity,
                        targetPath: f.targetPath,
                        message: f.message,
                        contextJson: f.contextJson,
                      }))}
                      domainCode={detail.scenario?.domain?.code}
                      height="full"
                    />
                  )}
                </TabsContent>
                <TabsContent value="report" className="mt-2">
                  {(() => {
                    const report = generateRunReport({
                      id: detail.id,
                      status: detail.status,
                      summary: detail.summary,
                      startedAt: detail.startedAt,
                      finishedAt: detail.finishedAt,
                      error: detail.error,
                      inputDocuments: detail.inputDocuments,
                      extractionMeta: detail.extractionMeta,
                      scenario: detail.scenario,
                      findings: detail.findings.map(f => ({
                        ruleCode: f.ruleCode ?? f.rule?.code ?? null,
                        severity: f.severity,
                        targetPath: f.targetPath,
                        message: f.message,
                        contextJson: f.contextJson,
                        rule: f.rule ? { code: f.rule.code, name: f.rule.name, severity: f.rule.severity } : null,
                      })),
                      extracted: detail.extracted.map(e => ({
                        id: e.id,
                        conceptLabel: e.conceptLabel,
                        jsonPayload: (() => { try { return typeof e.jsonPayload === 'string' ? JSON.parse(e.jsonPayload) : e.jsonPayload } catch { return {} } })(),
                      })),
                    })
                    return (
                      <div className="relative">
                        <Button
                          size="sm"
                          variant="outline"
                          className="absolute right-2 top-2 z-10 h-7 gap-1 text-[11px]"
                          onClick={() => {
                            navigator.clipboard.writeText(report)
                            toast.success('报告已复制到剪贴板')
                          }}
                        >
                          <ClipboardCopy className="size-3" /> 复制
                        </Button>
                        <pre className="max-h-[500px] overflow-auto rounded-md bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground scrollbar-thin">
                          <code>{report}</code>
                        </pre>
                      </div>
                    )
                  })()}
                </TabsContent>
                <TabsContent value="extracted" className="mt-2">
                  {detail.extracted.length === 0 ? (
                    <EmptyState title="无抽取对象" icon={Boxes} />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {detail.extracted.map((e, i) => (
                        <li key={e.id || i} className="rounded-md border bg-card p-2.5 text-xs">
                          <div className="mb-1 flex items-center gap-1.5">
                            <Boxes className="size-3 text-muted-foreground" />
                            <Badge variant="outline" className="text-[10px]">
                              {e.conceptLabel || '未分类'}
                            </Badge>
                          </div>
                          <pre className="overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[10px] text-foreground scrollbar-thin">
                            <code>{prettyJson(e.jsonPayload)}</code>
                          </pre>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
                <TabsContent value="raw" className="mt-2">
                  <div className="flex flex-col gap-3 text-xs">
                    {/* AI 处理信息 */}
                    {detail.extractionMeta && (() => {
                      const meta = (() => { try { return JSON.parse(detail.extractionMeta!) } catch { return null } })()
                      if (!meta) return null
                      return (
                        <div className="rounded-md border bg-card p-2.5">
                          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">AI 处理信息</div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div><span className="text-muted-foreground">状态：</span>{meta.ok ? '成功' : '失败'}</div>
                            <div><span className="text-muted-foreground">耗时：</span>{meta.durationMs ?? '-'}ms</div>
                            {meta.usage && <div><span className="text-muted-foreground">输入字数：</span>{meta.usage.prompt_tokens ?? '-'}</div>}
                            {meta.usage && <div><span className="text-muted-foreground">输出字数：</span>{meta.usage.completion_tokens ?? '-'}</div>}
                          </div>
                        </div>
                      )
                    })()}

                    {/* 输入材料原文 */}
                    {detail.inputDocuments && detail.inputDocuments !== '[]' && (
                      <div className="rounded-md border bg-card p-2.5">
                        <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">输入材料原文</div>
                        <pre className="max-h-60 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px] text-foreground scrollbar-thin">
                          <code>{(() => { try { return JSON.parse(detail.inputDocuments!).join('\n\n') } catch { return detail.inputDocuments } })()}</code>
                        </pre>
                      </div>
                    )}

                    {/* AI 抽取完整结果 */}
                    {detail.extractionJson && (
                      <div className="rounded-md border bg-card p-2.5">
                        <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">AI 抽取完整结果</div>
                        <pre className="max-h-80 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px] text-foreground scrollbar-thin">
                          <code>{prettyJson(detail.extractionJson)}</code>
                        </pre>
                      </div>
                    )}

                    {!detail.extractionJson && !detail.inputDocuments && (
                      <EmptyState title="无原始数据" hint="本次运行为结构化模式或未保存" icon={FileText} />
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MiniStat({ icon: Icon, label, value, accent = 'slate' }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  accent?: 'emerald' | 'amber' | 'rose' | 'slate'
}) {
  const accentMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
  }
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-2">
      <div className={cn('flex size-7 items-center justify-center rounded', accentMap[accent])}>
        <Icon className="size-3.5" />
      </div>
      <div className="flex flex-col gap-0">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold text-foreground">{value}</span>
      </div>
    </div>
  )
}
