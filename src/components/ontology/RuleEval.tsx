'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  FlaskConical, PlayCircle, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, ChevronRight, Brain, FileJson, Sparkles,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

import { useFetch } from './hooks'
import { api, severityStyle } from './lib'
import {
  LoadingState, ErrorState, EmptyState, PageHeader, SectionCard,
  SeverityBadge,
} from './primitives'

interface RuleSet {
  id: string
  code: string
  name: string
  domain: { id: string; code: string; nameZh: string }
  _count: { rules: number }
}

interface TestResult {
  ruleset: { id: string; code: string; name: string; domain: string; domainCode: string }
  summary: {
    totalRules: number
    parsedRules: number
    parseErrors: number
    totalTests: number
    passedTests: number
    testPassRate: number | null
    userFiredRules: number
  }
  results: Array<{
    ruleId: string
    ruleCode: string
    ruleName: string
    severity: string
    targetConcept: string | null
    parseError: string | null
    humanReadable: string[]
    tests: Array<{
      testId: string
      name: string
      expected: string
      actual: string
      passed: boolean
      message: string
    }>
    testSummary: { passed: number; total: number; rate: number | null }
    userEval: { fired: boolean; message: string } | { error: string } | null
  }>
}

const SAMPLE_CTX = `{
  "id": "R2024-001",
  "submitter": { "id": "E001", "name": "张艾丽", "level": "M1" },
  "costCenter": { "id": "CC001", "name": "先进材料研究院" },
  "totalAmount": 5800,
  "employee": { "level": "M1" },
  "lines": [
    { "type": "住宿", "amount": 900, "city": "上海", "date": "2024-06-10", "invoice": { "number": "INV001", "amount": 900 } },
    { "type": "招待", "amount": 1200, "city": "上海", "date": "2024-06-11", "invoice": { "number": "INV002", "amount": 1200 } },
    { "type": "住宿", "amount": 450, "city": "苏州", "date": "2024-06-12", "invoice": { "number": "INV001", "amount": 450 } }
  ]
}`

export function RuleEval() {
  const [rulesetId, setRulesetId] = React.useState<string | null>(null)
  const [ctxText, setCtxText] = React.useState(SAMPLE_CTX)
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<TestResult | null>(null)
  const { data: rulesets, loading, error, refetch } = useFetch<RuleSet[]>('/rulesets')

  const handleRun = async () => {
    if (!rulesetId) {
      toast.error('请先选择规则集')
      return
    }
    let ctx: any = null
    if (ctxText.trim()) {
      try { ctx = JSON.parse(ctxText) }
      catch (e: any) {
        toast.error('ctx JSON 格式错误', { description: e.message })
        return
      }
    }
    setRunning(true)
    setResult(null)
    try {
      const r = await api<TestResult>(`/rulesets/${rulesetId}/test`, {
        method: 'POST',
        json: { ctx },
      })
      setResult(r)
      toast.success('评测完成', {
        description: `${r.summary.parsedRules}/${r.summary.totalRules} 规则解析 · ${r.summary.userFiredRules} 条命中`,
      })
    } catch (e: any) {
      toast.error('评测失败', { description: e.message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="规则评测"
        icon={FlaskConical}
        description="批量跑规则集 + 黄金样本；可选提供 ctx 测试整体命中情况"
        actions={
          <Button size="sm" variant="ghost" onClick={refetch}>
            <RefreshCw className="size-3.5" /> 刷新规则集
          </Button>
        }
      />

      {/* 选择规则集 + ctx 输入 */}
      <SectionCard
        title="评测配置"
        description="选择规则集，可选填 ctx 实时求值"
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">规则集</label>
              {loading ? (
                <LoadingState label="加载规则集…" />
              ) : error ? (
                <ErrorState message={error} onRetry={refetch} />
              ) : (
                <Select
                  value={rulesetId ?? undefined}
                  onValueChange={(v) => { setRulesetId(v); setResult(null) }}
                >
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="选择规则集" /></SelectTrigger>
                  <SelectContent>
                    {rulesets?.map(rs => (
                      <SelectItem key={rs.id} value={rs.id}>
                        <span className="flex items-center gap-2">
                          <Badge variant="outline" className="border-0 bg-slate-100 px-1 text-[9px] dark:bg-slate-800">
                            {rs.domain.nameZh}
                          </Badge>
                          <span className="font-mono text-[11px]">{rs.code}</span>
                          <span className="text-xs">{rs.name}</span>
                          <span className="text-[10px] text-muted-foreground">({rs._count.rules})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">操作</label>
              <div className="flex items-center gap-2">
                <Button onClick={handleRun} disabled={running || !rulesetId} size="sm" className="h-9">
                  {running ? <RefreshCw className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                  {running ? '评测中…' : '开始评测'}
                </Button>
                <Button size="sm" variant="ghost" className="h-9" onClick={() => setCtxText(SAMPLE_CTX)}>
                  <Sparkles className="size-3.5" /> 加载示例 ctx
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">
              <FileJson className="mr-1 inline size-3" />
              ctx (JSON，可选) — 对每条规则求值，看是否命中
            </label>
            <Textarea
              value={ctxText}
              onChange={(e) => setCtxText(e.target.value)}
              placeholder="留空只跑黄金样本"
              className="min-h-[200px] resize-y bg-slate-50 font-mono text-xs leading-relaxed dark:bg-slate-900/50 scrollbar-thin"
              spellCheck={false}
            />
          </div>
        </div>
      </SectionCard>

      {/* 结果 */}
      {result && <EvalResult result={result} />}
    </div>
  )
}

function EvalResult({ result }: { result: TestResult }) {
  const s = result.summary
  const passRate = s.testPassRate ?? 0
  const passRateColor = passRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : passRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'

  return (
    <div className="flex flex-col gap-4">
      {/* 汇总卡 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryStat icon={Brain} label="总规则" value={s.totalRules} accent="slate" />
        <SummaryStat icon={CheckCircle2} label="解析成功" value={s.parsedRules} accent="emerald" />
        <SummaryStat icon={XCircle} label="解析失败" value={s.parseErrors} accent={s.parseErrors > 0 ? 'rose' : 'slate'} />
        <SummaryStat icon={FlaskConical} label="黄金样本" value={s.totalTests} accent="slate" />
        <SummaryStat icon={CheckCircle2} label="样本通过" value={s.passedTests} accent="emerald" />
        <SummaryStat icon={AlertTriangle} label="ctx 命中" value={s.userFiredRules} accent={s.userFiredRules > 0 ? 'amber' : 'slate'} />
      </div>

      {/* 通过率进度条 */}
      {s.totalTests > 0 && (
        <SectionCard title="黄金样本通过率" description={`${s.passedTests} / ${s.totalTests}`}>
          <div className="flex items-center gap-3">
            <Progress value={passRate} className="h-3 flex-1" />
            <span className={cn('font-mono text-2xl font-bold', passRateColor)}>{passRate}%</span>
          </div>
        </SectionCard>
      )}

      {/* 规则明细 */}
      <SectionCard
        title="规则明细"
        description={`${result.results.length} 条规则`}
      >
        <ul className="flex flex-col gap-2">
          {result.results.map(r => <EvalRuleRow key={r.ruleId} r={r} />)}
        </ul>
      </SectionCard>
    </div>
  )
}

function EvalRuleRow({ r }: { r: TestResult['results'][number] }) {
  const [open, setOpen] = React.useState(false)
  const s = severityStyle(r.severity)
  const hasTests = r.tests.length > 0
  const allTestsPassed = hasTests && r.testSummary.passed === r.testSummary.total
  const userFired = r.userEval && 'fired' in r.userEval && r.userEval.fired

  return (
    <li className="overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        <div className={cn('mt-1 size-2 shrink-0 rounded-full', s.dot)} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-xs font-semibold text-foreground">{r.ruleCode}</code>
            <SeverityBadge severity={r.severity} />
            <span className="text-sm text-foreground">{r.ruleName}</span>
            {r.targetConcept && (
              <Badge variant="outline" className="border-0 bg-slate-100 px-1 text-[9px] dark:bg-slate-800">
                → {r.targetConcept}
              </Badge>
            )}
          </div>
          {/* 状态徽章 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {r.parseError ? (
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                <XCircle className="size-2.5" /> 解析失败
              </Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="size-2.5" /> 解析成功
              </Badge>
            )}
            {hasTests && (
              <Badge variant="outline" className={cn(
                'border',
                allTestsPassed
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
              )}>
                {allTestsPassed ? <CheckCircle2 className="size-2.5" /> : <XCircle className="size-2.5" />}
                样本 {r.testSummary.passed}/{r.testSummary.total}
              </Badge>
            )}
            {r.userEval && 'fired' in r.userEval && (
              <Badge variant="outline" className={cn(
                'border',
                userFired
                  ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300'
              )}>
                {userFired ? <AlertTriangle className="size-2.5" /> : <CheckCircle2 className="size-2.5" />}
                {userFired ? 'ctx 命中' : 'ctx 未命中'}
              </Badge>
            )}
            {r.userEval && 'error' in r.userEval && (
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                ctx 求值异常
              </Badge>
            )}
          </div>
        </div>
        <ChevronRight className={cn('mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t bg-muted/30 p-3">
          {/* 可读渲染 */}
          {r.humanReadable.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">可读渲染</div>
              <pre className="overflow-x-auto rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-700 dark:bg-slate-900/60 dark:text-slate-300 scrollbar-thin">
                <code>{r.humanReadable.join('\n')}</code>
              </pre>
            </div>
          )}

          {/* 解析错误 */}
          {r.parseError && (
            <div className="rounded-md bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              <span className="font-medium">解析错误：</span>{r.parseError}
            </div>
          )}

          {/* 黄金样本明细 */}
          {hasTests && (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">黄金样本</div>
              <ul className="flex flex-col gap-1">
                {r.tests.map(t => (
                  <li key={t.testId} className="flex items-center gap-2 rounded bg-card p-1.5 text-xs">
                    {t.passed ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="size-3.5 text-rose-500" />
                    )}
                    <span className="font-medium">{t.name}</span>
                    <span className="text-muted-foreground">期望 {t.expected} · 实际 {t.actual}</span>
                    {t.message && <code className="ml-auto font-mono text-[10px] text-amber-700 dark:text-amber-300">{t.message}</code>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ctx 求值结果 */}
          {r.userEval && 'fired' in r.userEval && r.userEval.fired && r.userEval.message && (
            <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle className="mr-1 inline size-3" />
              <span className="font-medium">ctx 命中提示：</span>{r.userEval.message}
            </div>
          )}
          {r.userEval && 'error' in r.userEval && (
            <div className="rounded-md bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              <span className="font-medium">ctx 求值异常：</span>{r.userEval.error}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function SummaryStat({ icon: Icon, label, value, accent = 'slate' }: {
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
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', accentMap[accent])}>
        <Icon className="size-4" />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[11px] text-muted-foreground truncate">{label}</span>
        <span className="text-lg font-semibold text-foreground truncate">{value}</span>
      </div>
    </div>
  )
}
