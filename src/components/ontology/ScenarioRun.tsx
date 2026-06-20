'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  PlayCircle, FileJson, Sparkles, Play, ArrowRight, ArrowLeft,
  CheckCircle2, AlertCircle, ListChecks, Boxes, RefreshCw, ClipboardCopy,
  FileText, Brain, Zap, Clock,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

import { useFetch } from './hooks'
import { api, domainColor, fmtTime, prettyJson, severityStyle } from './lib'
import {
  LoadingState, ErrorState, EmptyState, PageHeader, SectionCard,
  SeverityBadge, StatusBadge,
} from './primitives'
import { InstanceGraph } from './InstanceGraph'
import { generateRunReport } from './runReport'

interface Scenario {
  id: string
  code: string
  name: string
  description?: string | null
  domain: { id: string; code: string; nameZh: string; color?: string | null }
  _count: { runs: number }
  rulesetIds: string
}

interface Finding {
  id?: string
  ruleId?: string | null
  ruleCode?: string | null
  severity: string
  targetPath?: string | null
  message: string
  contextJson?: string
}

interface ExtractionMeta {
  ok: boolean
  error?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  durationMs?: number
  raw?: string
}

interface RunResp {
  id: string
  status: string
  startedAt: string
  finishedAt: string | null
  summary: string | null
  findings: Finding[]
  extracted?: Array<{ id: string; conceptLabel: string; jsonPayload: any }>
  extractedCount: number
  ruleCount: number
  scenario?: { id: string; name: string; domain?: { code: string; nameZh: string } | null }
  extraction?: ExtractionMeta | null
  payload?: any
}

const REIMBURSEMENT_EXAMPLE_JSON = `{
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

const REIMBURSEMENT_EXAMPLE_TEXT = `报销单 R2024-001

提交人：张艾丽（工号 E001，职级 M1，所属先进材料研究院）
成本中心：CC001 先进材料研究院
报销总金额：5800 元

费用明细：
1. 2024-06-10 上海 住宿费 900 元，发票号 INV001，金额 900 元
2. 2024-06-11 上海 业务招待费 1200 元，发票号 INV002，金额 1200 元（未填写客户和项目）
3. 2024-06-12 苏州 住宿费 450 元，发票号 INV001，金额 450 元（与第1条发票号重复）`

const PROC_EXAMPLE_JSON = `{
  "id": "P2024-007",
  "buyer": { "id": "B001", "name": "李雷" },
  "supplier": { "id": "S001", "name": "阳光文具" },
  "items": [
    { "name": "A4 纸", "quantity": 100, "unitPrice": 30, "amount": 3000 }
  ],
  "totalAmount": 3000
}`

const PROC_EXAMPLE_TEXT = `采购申请单 P2024-007

采购员：李雷（工号 B001）
供应商：S001 阳光文具
采购明细：
- A4 复印纸，数量 100 箱，单价 30 元，金额 3000 元

合计金额：3000 元`

export function ScenarioRun({ onJumpToRuns }: { onJumpToRuns: () => void }) {
  const [step, setStep] = React.useState<1 | 2 | 3>(1)
  const [scenarioId, setScenarioId] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<'text' | 'json'>('text')
  const [text, setText] = React.useState('')
  const [payload, setPayload] = React.useState('')
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<RunResp | null>(null)
  const { data, loading, error, refetch } = useFetch<Scenario[]>('/scenarios')

  const selectedScenario = data?.find(s => s.id === scenarioId) || null
  const isProc = selectedScenario?.domain.code === 'procurement'

  const loadExample = React.useCallback(() => {
    if (isProc) {
      setText(PROC_EXAMPLE_TEXT)
      setPayload(PROC_EXAMPLE_JSON)
    } else {
      setText(REIMBURSEMENT_EXAMPLE_TEXT)
      setPayload(REIMBURSEMENT_EXAMPLE_JSON)
    }
  }, [isProc])

  const handleRun = async () => {
    if (!scenarioId) {
      toast.error('请先选择场景')
      return
    }
    if (mode === 'json') {
      let parsed: any
      try {
        parsed = JSON.parse(payload)
      } catch (e: any) {
        toast.error('JSON 格式错误', { description: e.message })
        return
      }
      setRunning(true)
      setResult(null)
      try {
        const r = await api<RunResp>('/runs', {
          method: 'POST',
          json: { scenarioId, mode: 'json', payload: parsed },
        })
        setResult(r)
        setStep(3)
        toast.success('运行完成', {
          description: `${r.findings.length} 条检查结果 · ${r.extractedCount} 个抽取对象`,
        })
      } catch (e: any) {
        toast.error('运行失败', { description: e.message })
      } finally {
        setRunning(false)
      }
    } else {
      if (!text.trim()) {
        toast.error('请输入业务材料文本')
        return
      }
      setRunning(true)
      setResult(null)
      try {
        const r = await api<RunResp>('/runs', {
          method: 'POST',
          json: { scenarioId, mode: 'text', text },
        })
        if (r.extraction && !r.extraction.ok) {
          toast.error('AI 抽取失败', { description: r.extraction.error })
        } else {
          setResult(r)
          setStep(3)
          toast.success('运行完成', {
            description: `抽取 ${r.extraction?.durationMs ?? 0}ms · ${r.findings.length} 条检查结果`,
          })
        }
      } catch (e: any) {
        toast.error('运行失败', { description: e.message })
      } finally {
        setRunning(false)
      }
    }
  }

  const handleReset = () => {
    setStep(1)
    setScenarioId(null)
    setText('')
    setPayload('')
    setResult(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="场景试运行"
        icon={PlayCircle}
        description="选择场景 → 填写材料 → 一键运行。支持 JSON 直传和文本 AI 抽取两种模式。"
        actions={
          (step !== 1 || result) && (
            <Button size="sm" variant="ghost" onClick={handleReset}>
              <RefreshCw className="size-3.5" /> 重置
            </Button>
          )
        }
      />

      <StepIndicator step={step} />

      {step === 1 && (
        <ScenarioPicker
          scenarios={data}
          loading={loading}
          error={error}
          refetch={refetch}
          onSelect={(id) => {
            setScenarioId(id)
            const sc = data?.find(s => s.id === id)
            if (sc) {
              const proc = sc.domain.code === 'procurement'
              setText(proc ? PROC_EXAMPLE_TEXT : REIMBURSEMENT_EXAMPLE_TEXT)
              setPayload(proc ? PROC_EXAMPLE_JSON : REIMBURSEMENT_EXAMPLE_JSON)
            }
            setStep(2)
          }}
        />
      )}

      {step === 2 && (
        <PayloadEditor
          scenario={selectedScenario}
          mode={mode}
          onModeChange={setMode}
          text={text}
          onTextChange={setText}
          payload={payload}
          onPayloadChange={setPayload}
          onBack={() => setStep(1)}
          onRun={handleRun}
          running={running}
          onLoadExample={loadExample}
        />
      )}

      {step === 3 && result && (
        <RunResult result={result} onJumpToRuns={onJumpToRuns} onReset={handleReset} />
      )}
    </div>
  )
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: '选择场景' },
    { n: 2, label: '填写材料' },
    { n: 3, label: '查看结果' },
  ]
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-card p-1.5">
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className={cn(
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-xs',
            step === s.n ? 'bg-primary text-primary-foreground' : step > s.n ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
          )}>
            {step > s.n ? <CheckCircle2 className="size-3.5" /> : <span className="flex size-4 items-center justify-center rounded-full border border-current text-[10px]">{s.n}</span>}
            <span className="font-medium">{s.label}</span>
          </div>
          {i < steps.length - 1 && <ArrowRight className="size-3 text-muted-foreground/40" />}
        </React.Fragment>
      ))}
    </div>
  )
}

function ScenarioPicker({
  scenarios, loading, error, refetch, onSelect,
}: {
  scenarios?: Scenario[] | null
  loading: boolean
  error: string | null
  refetch: () => void
  onSelect: (id: string) => void
}) {
  if (loading) return <LoadingState label="加载场景…" />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!scenarios || scenarios.length === 0) return <EmptyState title="无可用场景" />

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {scenarios.map(s => {
        const dc = domainColor(s.domain.code)
        return (
          <div
            key={s.id}
            className="group flex flex-col gap-2 rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn('size-2.5 rounded-full', dc.dot)} />
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', dc.bg, dc.text)}>
                  {s.domain.nameZh}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">{s.name}</span>
              <code className="font-mono text-[10px] text-muted-foreground">{s.code}</code>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {s.description || '无描述'}
            </p>
            <div className="flex items-center gap-2 border-t pt-2 text-[10px] text-muted-foreground">
              <span>历史运行 {s._count.runs}</span>
              {s.rulesetIds && (
                <span>· {JSON.parse(s.rulesetIds).length} 规则集</span>
              )}
            </div>
            <Button
              size="sm"
              className="mt-1 w-full"
              onClick={() => onSelect(s.id)}
            >
              <PlayCircle className="size-3.5" /> 试运行
            </Button>
          </div>
        )
      })}
    </div>
  )
}

function PayloadEditor({
  scenario, mode, onModeChange, text, onTextChange, payload, onPayloadChange,
  onBack, onRun, running, onLoadExample,
}: {
  scenario: Scenario | null
  mode: 'text' | 'json'
  onModeChange: (m: 'text' | 'json') => void
  text: string
  onTextChange: (v: string) => void
  payload: string
  onPayloadChange: (v: string) => void
  onBack: () => void
  onRun: () => void
  running: boolean
  onLoadExample: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            {scenario && <Badge variant="outline" className={cn('border-0', domainColor(scenario.domain.code).bg, domainColor(scenario.domain.code).text)}>
              {scenario.domain.nameZh}
            </Badge>}
            {scenario?.name}
          </span>
        }
        description={scenario?.description || undefined}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <Sparkles className="size-3" /> 示例已预填
          </span>
          <span>切换模式查看不同输入方式</span>
        </div>
      </SectionCard>

      <SectionCard
        title="输入材料"
        description="文本模式：AI 自动识别并提取数据后校验；结构化模式：直接输入数据"
        action={
          <Button size="sm" variant="ghost" onClick={onLoadExample}>
            <ClipboardCopy className="size-3.5" /> 加载示例
          </Button>
        }
      >
        <Tabs value={mode} onValueChange={(v) => onModeChange(v as 'text' | 'json')}>
          <TabsList className="mb-3 grid w-full grid-cols-2 sm:w-auto sm:grid-cols-2">
            <TabsTrigger value="text" className="gap-1.5">
              <FileText className="size-3.5" />
              <span>文本模式</span>
              <Badge variant="outline" className="ml-1 border-0 bg-muted px-1 py-0 text-[9px] text-muted-foreground">
                <Brain className="size-2.5" /> AI
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="json" className="gap-1.5">
              <FileJson className="size-3.5" />
              <span>JSON 模式</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Brain className="size-3.5 text-emerald-500" />
                业务材料原文（AI 会自动提取关键信息）
              </div>
              <Textarea
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                placeholder="粘贴业务材料原文，如报销说明、采购申请表、合同条款等…"
                className="min-h-[420px] resize-y bg-slate-50 font-mono text-xs leading-relaxed dark:bg-slate-900/50 scrollbar-thin"
                spellCheck={false}
                aria-label="业务材料文本"
              />
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                <Zap className="size-3" />
                平台会自动从文本中提取数据并执行规则校验，处理耗时见结果页
              </div>
            </div>
          </TabsContent>

          <TabsContent value="json">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileJson className="size-3.5" />
                结构化数据（直接用于规则校验）
              </div>
              <Textarea
                value={payload}
                onChange={(e) => onPayloadChange(e.target.value)}
                className="min-h-[420px] resize-y bg-slate-50 font-mono text-xs leading-relaxed dark:bg-slate-900/50 scrollbar-thin"
                spellCheck={false}
                aria-label="输入结构化数据"
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-3 flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={onBack}>
            <ArrowLeft className="size-3.5" /> 返回选择场景
          </Button>
          <Button onClick={onRun} disabled={running || (mode === 'json' ? !payload.trim() : !text.trim())}>
            {running ? <RefreshCw className="size-3.5 animate-spin" /> : mode === 'text' ? <Brain className="size-3.5" /> : <Play className="size-3.5" />}
            {running ? '运行中…' : mode === 'text' ? '抽取并运行' : '执行运行'}
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}

function RunResult({ result, onJumpToRuns, onReset }: {
  result: RunResp
  onJumpToRuns: () => void
  onReset: () => void
}) {
  const errorCount = result.findings.filter(f => f.severity === 'ERROR').length
  const warnCount = result.findings.filter(f => f.severity === 'WARNING').length
  const infoCount = result.findings.filter(f => f.severity === 'INFO').length
  const sorted = [...result.findings].sort((a, b) => {
    const order: Record<string, number> = { ERROR: 0, WARNING: 1, INFO: 2 }
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
  })

  return (
    <div className="flex flex-col gap-4">
      {/* 摘要 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard icon={ListChecks} label="执行规则" value={result.ruleCount} accent="slate" />
        <SummaryCard icon={AlertCircle} label="检查结果" value={result.findings.length} accent={errorCount > 0 ? 'rose' : 'emerald'} />
        <SummaryCard icon={Boxes} label="抽取对象" value={result.extractedCount} accent="emerald" />
        <SummaryCard icon={CheckCircle2} label="状态" value={result.status} accent={result.status === 'SUCCESS' ? 'emerald' : 'rose'} />
      </div>

      {/* 抽取实例关系图 */}
      {result.extracted && result.extracted.length > 0 && (
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Boxes className="size-4 text-emerald-500" />
              抽取实例关系图
            </span>
          }
          description="本次运行抽取的事实实体及其关联关系。红色节点表示命中违规规则，点击查看详情。"
        >
          <InstanceGraph
            extracted={result.extracted}
            findings={result.findings}
            domainCode={result.scenario?.domain?.code}
            height="full"
          />
        </SectionCard>
      )}

      {/* AI 抽取元信息（仅文本模式） */}
      {result.extraction && (
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Brain className="size-4 text-emerald-500" />
              AI AI 抽取
            </span>
          }
          description="从业务文本提取数据的过程信息"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetaItem icon={CheckCircle2} label="状态" value={result.extraction.ok ? '成功' : '失败'} accent={result.extraction.ok ? 'emerald' : 'rose'} />
            <MetaItem icon={Clock} label="耗时" value={`${result.extraction.durationMs ?? 0} ms`} accent="slate" />
            <MetaItem icon={Zap} label="输入字数" value={result.extraction.usage?.prompt_tokens ?? '-'} accent="slate" />
            <MetaItem icon={Zap} label="输出字数" value={result.extraction.usage?.completion_tokens ?? '-'} accent="slate" />
          </div>
        </SectionCard>
      )}

      {result.summary && (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">运行摘要</div>
          <div className="font-medium text-foreground">{result.summary}</div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            开始于 {fmtTime(result.startedAt)} · 用时 {result.finishedAt ? `${new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime()} ms` : '-'}
          </div>
        </div>
      )}

      {/* 抽取出的对象（仅文本模式才有） */}
      {result.extracted && result.extracted.length > 0 && (
        <SectionCard
          title="AI 提取的数据"
          description={`${result.extracted.length} 个数据对象，用于规则校验`}
        >
          <ul className="flex flex-col gap-2">
            {result.extracted.map((o, i) => (
              <li key={o.id || i} className="overflow-hidden rounded-lg border bg-card">
                <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <Boxes className="size-3" /> {o.conceptLabel}
                    </Badge>
                  </div>
                  <code className="font-mono text-[10px] text-muted-foreground">#{i + 1}</code>
                </div>
                <pre className="overflow-x-auto bg-slate-50 p-2 font-mono text-[11px] text-slate-700 dark:bg-slate-900/60 dark:text-slate-300 scrollbar-thin">
                  <code>{JSON.stringify(o.jsonPayload, null, 2)}</code>
                </pre>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* 运行报告 */}
      {(() => {
        const report = generateRunReport({
          id: result.id,
          status: result.status,
          summary: result.summary,
          startedAt: result.startedAt,
          finishedAt: result.finishedAt,
          error: null,
          extractionMeta: result.extraction ? JSON.stringify({
            ok: result.extraction.ok,
            usage: result.extraction.usage,
            durationMs: result.extraction.durationMs,
          }) : null,
          scenario: result.scenario,
          findings: result.findings,
          extracted: result.extracted ?? [],
        })
        return (
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                运行报告
              </span>
            }
            description="基于运行结果自动生成的报告，可复制分享"
          >
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                className="absolute right-2 top-2 h-7 gap-1 text-[11px]"
                onClick={() => {
                  navigator.clipboard.writeText(report)
                  toast.success('报告已复制到剪贴板')
                }}
              >
                <ClipboardCopy className="size-3" /> 复制
              </Button>
              <pre className="max-h-[500px] overflow-auto rounded bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground scrollbar-thin">
                <code>{report}</code>
              </pre>
            </div>
          </SectionCard>
        )
      })()}

      {/* 检查结果 */}
      <SectionCard
        title="检查结果"
        description={`错误 ${errorCount} · 警告 ${warnCount} · 提示 ${infoCount}`}
        action={
          <div className="flex items-center gap-1.5">
            {errorCount > 0 && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">ERROR {errorCount}</Badge>}
            {warnCount > 0 && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">WARN {warnCount}</Badge>}
            {infoCount > 0 && <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">INFO {infoCount}</Badge>}
          </div>
        }
      >
        {sorted.length === 0 ? (
          <EmptyState title="无检查结果" hint="所有规则均通过" icon={CheckCircle2} />
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((f, i) => {
              const s = severityStyle(f.severity)
              return (
                <FindingRow key={i} finding={f} s={s} />
              )
            })}
          </ul>
        )}
      </SectionCard>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onReset}>
          <RefreshCw className="size-3.5" /> 再跑一次
        </Button>
        <Button onClick={onJumpToRuns}>
          查看运行记录 <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

function FindingRow({ finding, s }: {
  finding: Finding
  s: ReturnType<typeof severityStyle>
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <li className={cn('overflow-hidden rounded-lg border-l-4 bg-card shadow-sm', s.row)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-start gap-2.5 p-3 text-left">
          <span className={cn('mt-1 size-2 shrink-0 rounded-full', s.dot)} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              {finding.ruleCode && (
                <code className="font-mono text-[11px] font-semibold text-foreground">{finding.ruleCode}</code>
              )}
              <SeverityBadge severity={finding.severity} />
              {finding.targetPath && (
                <code className="font-mono text-[10px] text-muted-foreground">@ {finding.targetPath}</code>
              )}
            </div>
            <div className="text-sm text-foreground">{finding.message}</div>
          </div>
        </CollapsibleTrigger>
        {finding.contextJson && finding.contextJson !== '{}' && (
          <CollapsibleContent>
            <div className="border-t bg-muted/30 px-3 py-2">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Context</div>
              <pre className="overflow-x-auto rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-700 dark:bg-slate-900/60 dark:text-slate-300 scrollbar-thin">
                <code>{prettyJson(finding.contextJson)}</code>
              </pre>
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </li>
  )
}

function SummaryCard({ icon: Icon, label, value, accent = 'slate' }: {
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

function MetaItem({ icon: Icon, label, value, accent = 'slate' }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  accent?: 'emerald' | 'amber' | 'rose' | 'slate'
}) {
  const accentMap: Record<string, string> = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
    slate: 'text-slate-600 dark:text-slate-300',
  }
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-card p-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className={cn('size-3', accentMap[accent])} />
        {label}
      </div>
      <div className={cn('text-sm font-semibold', accentMap[accent])}>{value}</div>
    </div>
  )
}
