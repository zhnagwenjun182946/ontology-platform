'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  Code2, FileText, Cpu, Play, Save, RefreshCw, Search,
  FolderTree, Tag, Target, Calendar, AlertTriangle, CheckCircle2, XCircle, Sparkles,
  ChevronRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import { useFetch } from './hooks'
import { api, domainColor, fmtTime, severityStyle } from './lib'
import {
  LoadingState, ErrorState, EmptyState, PageHeader, SectionCard,
  SeverityBadge, StatusBadge,
} from './primitives'

interface RuleList {
  id: string
  code: string
  name: string
  severity: string
  status: string
  targetPath?: string | null
  ruleset: { id: string; code: string; name: string; domain?: { code: string; nameZh: string; color?: string | null } | null }
  targetConcept?: { id: string; uri: string; labelZh: string } | null
  _count: { tests: number; findings: number }
}

interface RuleDetail extends RuleList {
  dsl: string
  messageTemplate?: string | null
  explanation?: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
  parsed: any
  humanReadable: string[]
  parseError?: string | null
  compiledArtifact?: string | null
}

const SEV_FILTER: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'ERROR', label: '错误' },
  { key: 'WARNING', label: '警告' },
  { key: 'INFO', label: '提示' },
]

const SAMPLE_CTX = `{
  "id": "R2024-001",
  "type": "住宿",
  "city": "上海",
  "amount": 900,
  "employee": { "level": "M1" },
  "lines": [
    { "type": "住宿", "amount": 900, "city": "上海", "invoice": { "number": "INV001" } }
  ]
}`

export function RuleEngine() {
  const [sevFilter, setSevFilter] = React.useState('all')
  const [q, setQ] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [collapsedSets, setCollapsedSets] = React.useState<Set<string>>(new Set())
  const { data, loading, error, refetch } = useFetch<RuleList[]>('/rules')

  const toggleCollapse = (id: string) => {
    setCollapsedSets(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 按 ruleset 分组
  const grouped = React.useMemo(() => {
    if (!data) return []
    const filtered = data.filter(r => {
      if (sevFilter !== 'all' && r.severity !== sevFilter) return false
      const k = q.trim().toLowerCase()
      if (!k) return true
      return r.code.toLowerCase().includes(k) ||
        r.name.toLowerCase().includes(k) ||
        (r.ruleset?.code || '').toLowerCase().includes(k)
    })
    const map = new Map<string, { ruleset: RuleList['ruleset']; rules: RuleList[] }>()
    for (const r of filtered) {
      const key = r.ruleset.id
      if (!map.has(key)) map.set(key, { ruleset: r.ruleset, rules: [] })
      map.get(key)!.rules.push(r)
    }
    return Array.from(map.values())
  }, [data, sevFilter, q])

  React.useEffect(() => {
    if (!selectedId && data && data.length > 0) {
      setSelectedId(data[0].id)
    }
  }, [data, selectedId])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="规则引擎"
        icon={Code2}
        description="规则编辑 · 中文说明 · 一键测试"
        actions={
          <Button size="sm" variant="outline" onClick={refetch}>
            <RefreshCw className="size-3.5" /> 刷新
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* 左侧规则列表 */}
        <SectionCard
          title="规则列表"
          description={`${data?.length ?? 0} 条规则`}
          bodyClassName="p-0"
        >
          <div className="flex flex-col gap-2 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索 code / 名称"
                className="h-8 pl-8 text-sm"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Tabs value={sevFilter} onValueChange={setSevFilter}>
              <TabsList className="grid w-full grid-cols-4">
                {SEV_FILTER.map(s => (
                  <TabsTrigger key={s.key} value={s.key} className="text-xs">{s.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div>
            {loading ? (
              <LoadingState label="加载规则…" />
            ) : error ? (
              <ErrorState message={error} onRetry={refetch} />
            ) : grouped.length === 0 ? (
              <EmptyState title="无匹配规则" />
            ) : (
              <>
              {grouped.map(({ ruleset, rules }) => {
                const dc = domainColor(ruleset.domain?.code)
                const isCollapsed = collapsedSets.has(ruleset.id)
                return (
                  <div key={ruleset.id} className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(ruleset.id)}
                      className="flex w-full items-center gap-1.5 border-y bg-muted/40 px-3 py-1.5 text-left transition-colors hover:bg-muted/60"
                    >
                      <ChevronRight className={cn('size-3 text-muted-foreground transition-transform', !isCollapsed && 'rotate-90')} />
                      <FolderTree className="size-3 text-muted-foreground" />
                      <span className="text-[11px] font-semibold text-foreground">{ruleset.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{ruleset.code}</span>
                      <span className="text-[10px] text-muted-foreground">{rules.length} 条</span>
                      {ruleset.domain && (
                        <Badge variant="outline" className={cn('ml-auto border-0 text-[10px]', dc.bg, dc.text)}>
                          {ruleset.domain.nameZh}
                        </Badge>
                      )}
                    </button>
                    {!isCollapsed && (
                      <>
                      {rules.map(r => {
                        const active = r.id === selectedId
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setSelectedId(r.id)}
                            className={cn(
                              'flex flex-col gap-1 border-l-2 px-3 py-2.5 pl-6 text-left transition-colors',
                              active ? 'border-l-primary bg-primary/5' : 'border-l-transparent hover:bg-muted/40'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-semibold text-foreground">{r.code}</span>
                              <SeverityBadge severity={r.severity} />
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                {r._count.findings} 命中
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">{r.name}</div>
                            {r.targetPath && (
                              <code className="font-mono text-[10px] text-muted-foreground/80">→ {r.targetPath}</code>
                            )}
                          </button>
                        )
                      })}
                      </>
                    )}
                  </div>
                )
              })}
              </>
            )}
          </div>
        </SectionCard>

        {/* 右侧详情 */}
        <RuleDetailPanel id={selectedId} />
      </div>
    </div>
  )
}

function RuleDetailPanel({ id }: { id: string | null }) {
  const { data, loading, error, refetch, setData } = useFetch<RuleDetail>(id ? `/rules/${id}` : null)
  const [tab, setTab] = React.useState<'human' | 'dsl' | 'shacl'>('human')
  const [dslDraft, setDslDraft] = React.useState('')
  const [shacl, setShacl] = React.useState<string | null>(null)
  const [compiling, setCompiling] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [evalCtx, setEvalCtx] = React.useState(SAMPLE_CTX)
  const [evalResult, setEvalResult] = React.useState<{ fired: boolean; message: string | null } | null>(null)
  const [evaluating, setEvaluating] = React.useState(false)

  React.useEffect(() => {
    if (data) {
      setDslDraft(data.dsl)
      setShacl(data.compiledArtifact || null)
      setEvalResult(null)
      setTab('human')
    }
  }, [data?.id])

  if (!id) return <SectionCard title="规则详情"><EmptyState title="选择规则查看详情" /></SectionCard>
  if (loading) return <SectionCard title="规则详情"><LoadingState label="加载规则详情…" /></SectionCard>
  if (error || !data) return <SectionCard title="规则详情"><ErrorState message={error || '加载失败'} onRetry={refetch} /></SectionCard>

  const dc = domainColor(data.ruleset?.domain?.code)

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await api<RuleDetail>(`/rules/${id}`, {
        method: 'PUT',
        json: { dsl: dslDraft, actor: 'web' },
      })
      // 重新拉详情以拿到新的 humanReadable / parsed
      const fresh = await api<RuleDetail>(`/rules/${id}`)
      setData(fresh)
      setShacl(fresh.compiledArtifact || null)
      toast.success('规则已保存', { description: updated.code })
    } catch (e: any) {
      toast.error('保存失败', { description: e.message })
    } finally {
      setSaving(false)
    }
  }

  const handleCompile = async () => {
    setCompiling(true)
    try {
      const r = await api<{ ok: boolean; shacl: string }>(`/rules/${id}`, {
        method: 'POST', json: { action: 'compile' },
      })
      setShacl(r.shacl)
      toast.success('生成成功', { description: '校验规则已生成' })
    } catch (e: any) {
      toast.error('生成失败', { description: e.message })
    } finally {
      setCompiling(false)
    }
  }

  const handleEvaluate = async () => {
    setEvaluating(true)
    setEvalResult(null)
    try {
      let ctx: any
      try {
        ctx = JSON.parse(evalCtx)
      } catch {
        toast.error('JSON 格式错误')
        setEvaluating(false)
        return
      }
      const r = await api<{ ok: boolean; fired: boolean; message: string | null }>(`/rules/${id}`, {
        method: 'POST', json: { action: 'evaluate', ctx },
      })
      setEvalResult({ fired: r.fired, message: r.message })
      if (r.fired) {
        toast.warning('规则命中', { description: r.message ?? '' })
      } else {
        toast.success('规则未命中')
      }
    } catch (e: any) {
      toast.error('执行失败', { description: e.message })
    } finally {
      setEvaluating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 元信息卡 */}
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <code className="font-mono text-sm font-semibold">{data.code}</code>
            <span className="text-sm font-medium text-foreground">{data.name}</span>
          </span>
        }
        description={data.explanation}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={data.severity} />
            <StatusBadge status={data.status} />
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <MetaItem icon={FolderTree} label="规则集" value={
            <span className="flex items-center gap-1.5">
              {data.ruleset.domain && (
                <span className={cn('size-1.5 rounded-full', dc.dot)} />
              )}
              <span>{data.ruleset.name}</span>
            </span>
          } />
          <MetaItem icon={Target} label="目标概念" value={data.targetConcept?.labelZh ?? '-'} />
          <MetaItem icon={Tag} label="标签" value={
            <div className="flex flex-wrap gap-1">
              {(data.tags || []).map(t => (
                <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
              ))}
              {(!data.tags || data.tags.length === 0) && <span className="text-muted-foreground">-</span>}
            </div>
          } />
          <MetaItem icon={Calendar} label="创建时间" value={fmtTime(data.createdAt)} />
        </div>
        {data.targetPath && (
          <div className="mt-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
            <span className="text-muted-foreground">作用路径：</span>
            <code className="font-mono text-foreground">{data.targetPath}</code>
          </div>
        )}
        {data.parseError && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <div>
              <div className="font-medium">规则格式错误</div>
              <div className="font-mono text-[11px]">{data.parseError}</div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* 三视图 */}
      <SectionCard
        title="规则视图"
        bodyClassName="p-0"
        action={
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="human" className="gap-1.5 text-xs"><FileText className="size-3.5" /> 可读</TabsTrigger>
              <TabsTrigger value="dsl" className="gap-1.5 text-xs"><Code2 className="size-3.5" /> 规则配置</TabsTrigger>
              <TabsTrigger value="shacl" className="gap-1.5 text-xs"><Cpu className="size-3.5" /> 校验规则</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        <div className="p-3">
          {tab === 'human' && <HumanReadableView lines={data.humanReadable} severity={data.severity} message={data.messageTemplate} />}
          {tab === 'dsl' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">规则配置文本，可直接编辑</span>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setDslDraft(data.dsl)}>
                    还原
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving || dslDraft === data.dsl}>
                    {saving ? <RefreshCw className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    保存
                  </Button>
                </div>
              </div>
              <Textarea
                value={dslDraft}
                onChange={(e) => setDslDraft(e.target.value)}
                className="min-h-[360px] resize-y bg-slate-50 font-mono text-xs leading-relaxed dark:bg-slate-900/50 scrollbar-thin"
                spellCheck={false}
                aria-label="规则编辑器"
              />
            </div>
          )}
          {tab === 'shacl' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">生成的校验规则（只读）</span>
                <Button size="sm" variant="outline" onClick={handleCompile} disabled={compiling}>
                  {compiling ? <RefreshCw className="size-3.5 animate-spin" /> : <Cpu className="size-3.5" />}
                  {shacl ? '重新编译' : '编译'}
                </Button>
              </div>
              {shacl ? (
                <pre className="max-h-[420px] overflow-auto rounded-md bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100 scrollbar-thin">
                  <code>{shacl}</code>
                </pre>
              ) : (
                <EmptyState
                  title="尚未编译"
                  hint="点击「生成」创建校验规则"
                  icon={Cpu}
                />
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* 试运行 */}
      <SectionCard
        title="试运行"
        description="输入上下文 JSON，直接求值规则是否命中"
        action={<Play className="size-4 text-muted-foreground" />}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">输入测试数据</span>
            <Button size="sm" variant="ghost" onClick={() => setEvalCtx(SAMPLE_CTX)}>
              <Sparkles className="size-3.5" /> 加载示例
            </Button>
          </div>
          <Textarea
            value={evalCtx}
            onChange={(e) => setEvalCtx(e.target.value)}
            className="min-h-[160px] resize-y bg-slate-50 font-mono text-xs leading-relaxed dark:bg-slate-900/50 scrollbar-thin"
            spellCheck={false}
            aria-label="试运行输入"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleEvaluate} disabled={evaluating}>
              {evaluating ? <RefreshCw className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              运行求值
            </Button>
            {evalResult && (
              <div className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium',
                evalResult.fired
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
              )}>
                {evalResult.fired ? <XCircle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
                {evalResult.fired ? '命中规则' : '未命中'}
              </div>
            )}
          </div>
          {evalResult?.message && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">渲染后的 message</div>
              <div className="font-medium text-foreground">{evalResult.message}</div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}

function MetaItem({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-muted/30 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="text-foreground">{value}</div>
    </div>
  )
}

// ============ 可读视图 ============
function HumanReadableView({
  lines, severity, message,
}: {
  lines: string[]
  severity: string
  message?: string | null
}) {
  if (!lines || lines.length === 0) {
    return <EmptyState title="无可读渲染" hint="规则格式错误或未提供" />
  }
  const s = severityStyle(severity)

  // 分类渲染：识别每行的语义
  return (
    <div className="flex flex-col gap-2.5">
      <div className={cn('rounded-lg border-l-4 p-3', s.row, 'bg-muted/30')}>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={severity} />
          <span className="text-xs font-medium text-muted-foreground">规则等级</span>
        </div>
      </div>
      {lines.map((line, i) => (
        <ReadableLine key={i} line={line} />
      ))}
      {message && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">提示语模板</div>
          <div className="font-mono text-xs text-amber-900 dark:text-amber-200">{message}</div>
        </div>
      )}
    </div>
  )
}

function ReadableLine({ line }: { line: string }) {
  // 识别"键：值"模式
  const m = line.match(/^([^：:]+)[：:]\s*(.*)$/)
  const key = m?.[1]?.trim()
  const val = m?.[2]?.trim()
  const isHeader = /规则\s+\S+/.test(key || '')

  if (isHeader && key) {
    return (
      <div className="rounded-lg border bg-card p-3">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{key}</div>
        <div className="text-sm font-semibold text-foreground">{val}</div>
      </div>
    )
  }

  if (key && val) {
    return (
      <div className="flex items-start gap-2 rounded-lg border bg-card p-2.5">
        <div className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" />
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{key}</div>
          <div className="text-sm text-foreground">{val}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-2.5 text-sm text-foreground">
      {line}
    </div>
  )
}
