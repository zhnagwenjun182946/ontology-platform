'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  Wand2, Upload, Brain, CheckCircle2, ArrowRight, ArrowLeft,
  RefreshCw, Sparkles, FileText, Boxes, GitBranch, Code2, PlayCircle,
  Check, X, AlertCircle, Zap, Clock,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

import { useFetch } from './hooks'
import { api, domainColor } from './lib'
import {
  LoadingState, ErrorState, EmptyState, PageHeader, SectionCard,
} from './primitives'

// ============ 类型 ============
interface Domain {
  id: string
  code: string
  nameZh: string
  color?: string | null
  _count: { concepts: number; rulesets: number; scenarios: number }
}

interface CandidateConcept {
  localName: string
  labelZh: string
  labelEn?: string
  description?: string
  isCore?: boolean
  fields: Array<{ name: string; type: string; required?: boolean; label?: string; ref?: string; itemRef?: string; enum?: string[] }>
}

interface CandidateRelation {
  name: string
  source: string
  target: string
  relationType: string
  cardinality: string
  description?: string
}

interface CandidateRule {
  code: string
  name: string
  severity: string
  target: string
  targetPath?: string
  dsl: string
  message: string
  explanation?: string
  tags?: string[]
}

interface CandidateScenario {
  code: string
  name: string
  description?: string
}

interface AutoBuildResult {
  concepts: CandidateConcept[]
  relations: CandidateRelation[]
  rules: CandidateRule[]
  scenarios: CandidateScenario[]
}

// ============ 主组件 ============
const SAMPLE_MATERIAL = `公司合同审核流程：

1. 业务部门发起合同申请，填写合同编号、对方公司、合同金额、签订日期
2. 合同金额超过 50 万需法务部审核
3. 合同金额超过 100 万需总经理审批
4. 合同必须有对方公司统一社会信用代码
5. 合同签订日期不能晚于今天
6. 同一合同编号不能重复提交
7. 合同包含多个条款，每个条款有风险等级（低/中/高）
8. 高风险条款必须法务部复核`

export function AutoBuildWizard({ onNavigateToRun, onNavigateToConcepts }: {
  onNavigateToRun: (scenarioId?: string) => void
  onNavigateToConcepts: () => void
}) {
  const [step, setStep] = React.useState<1 | 2 | 3 | 4>(1)
  const [domainMode, setDomainMode] = React.useState<'existing' | 'new'>('new')
  const [existingDomainId, setExistingDomainId] = React.useState<string>('')
  const [newDomain, setNewDomain] = React.useState({ code: '', nameZh: '', description: '', color: '#f43f5e' })
  const [materials, setMaterials] = React.useState(SAMPLE_MATERIAL)
  const [analyzing, setAnalyzing] = React.useState(false)
  const [result, setResult] = React.useState<AutoBuildResult | null>(null)
  const [extractionMeta, setExtractionMeta] = React.useState<{ durationMs?: number; usage?: any } | null>(null)
  const [selected, setSelected] = React.useState<{ concepts: Set<string>; relations: Set<string>; rules: Set<string>; scenarios: Set<string> }>(
    { concepts: new Set(), relations: new Set(), rules: new Set(), scenarios: new Set() },
  )
  const [committing, setCommitting] = React.useState(false)
  const [committedDomainId, setCommittedDomainId] = React.useState<string | null>(null)
  const { data: domains } = useFetch<Domain[]>('/domains')

  // 分析
  const handleAnalyze = async () => {
    if (!materials.trim()) {
      toast.error('请输入业务材料')
      return
    }
    setAnalyzing(true)
    setResult(null)
    try {
      const domainHint = domainMode === 'new'
        ? { code: newDomain.code, name: newDomain.nameZh, description: newDomain.description }
        : domains?.find(d => d.id === existingDomainId)
          ? { code: domains.find(d => d.id === existingDomainId)!.code, name: domains.find(d => d.id === existingDomainId)!.nameZh }
          : undefined
      const r = await api<{ ok: boolean; result?: AutoBuildResult; error?: string; durationMs?: number; usage?: any }>(
        '/autobuild',
        { method: 'POST', json: { materials, domainHint } },
      )
      if (!r.ok || !r.result) {
        toast.error('AI 分析失败', { description: r.error })
        return
      }
      setResult(r.result)
      setExtractionMeta({ durationMs: r.durationMs, usage: r.usage })
      // 默认全选
      setSelected({
        concepts: new Set(r.result.concepts.map((_, i) => String(i))),
        relations: new Set(r.result.relations.map((_, i) => String(i))),
        rules: new Set(r.result.rules.map((_, i) => String(i))),
        scenarios: new Set(r.result.scenarios.map((_, i) => String(i))),
      })
      setStep(3)
      toast.success('分析完成', {
        description: `${r.result.concepts.length} 概念 · ${r.result.rules.length} 规则 · ${r.durationMs}ms`,
      })
    } catch (e: any) {
      toast.error('分析失败', { description: e.message })
    } finally {
      setAnalyzing(false)
    }
  }

  // 入库
  const handleCommit = async () => {
    if (!result) return
    setCommitting(true)
    try {
      const payload = {
        domainId: domainMode === 'existing' ? existingDomainId : undefined,
        domain: domainMode === 'new' ? {
          code: newDomain.code,
          nameZh: newDomain.nameZh,
          nameEn: undefined,
          description: newDomain.description,
          color: newDomain.color,
          icon: 'boxes',
        } : undefined,
        selected: {
          concepts: Array.from(selected.concepts).map(i => result.concepts[Number(i)]),
          relations: Array.from(selected.relations).map(i => result.relations[Number(i)]),
          rules: Array.from(selected.rules).map(i => result.rules[Number(i)]),
          scenarios: Array.from(selected.scenarios).map(i => result.scenarios[Number(i)]),
        },
        // 回传建库来源，供 commit 留存到 Domain.rawMaterials / buildMeta
        buildSource: {
          materials,
          domainHint: domainMode === 'new'
            ? { code: newDomain.code, name: newDomain.nameZh, description: newDomain.description }
            : undefined,
          llmRaw: result.raw,
          usage: extractionMeta?.usage,
          durationMs: extractionMeta?.durationMs,
        },
      }
      const r = await api<{ ok: boolean; domain: Domain; created: any; error?: string }>(
        '/autobuild/commit',
        { method: 'POST', json: payload },
      )
      if (!r.ok) {
        toast.error('入库失败', { description: r.error })
        return
      }
      setCommittedDomainId(r.domain.id)
      setStep(4)
      toast.success('本体已入库', {
        description: `${r.created.concepts} 概念 / ${r.created.rules} 规则 / ${r.created.scenarios} 场景`,
      })
    } catch (e: any) {
      toast.error('入库失败', { description: e.message })
    } finally {
      setCommitting(false)
    }
  }

  const reset = () => {
    setStep(1)
    setResult(null)
    setExtractionMeta(null)
    setCommittedDomainId(null)
    setMaterials(SAMPLE_MATERIAL)
    setNewDomain({ code: '', nameZh: '', description: '', color: '#f43f5e' })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="智能建库"
        icon={Wand2}
        description="上传业务材料 → AI 自动识别概念和规则 → 人工确认 → 入库 → 试运行"
        actions={
          step !== 1 && (
            <Button size="sm" variant="ghost" onClick={reset}>
              <RefreshCw className="size-3.5" /> 重新开始
            </Button>
          )
        }
      />

      <StepIndicator step={step} />

      {step === 1 && (
        <Step1Domain
          domainMode={domainMode}
          setDomainMode={setDomainMode}
          existingDomainId={existingDomainId}
          setExistingDomainId={setExistingDomainId}
          newDomain={newDomain}
          setNewDomain={setNewDomain}
          domains={domains}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <Step2Materials
          materials={materials}
          setMaterials={setMaterials}
          onBack={() => setStep(1)}
          onAnalyze={handleAnalyze}
          analyzing={analyzing}
        />
      )}

      {step === 3 && result && (
        <Step3Review
          result={result}
          selected={selected}
          setSelected={setSelected}
          extractionMeta={extractionMeta}
          onBack={() => setStep(2)}
          onCommit={handleCommit}
          committing={committing}
        />
      )}

      {step === 4 && committedDomainId && (
        <Step4Done
          domainId={committedDomainId}
          onReset={reset}
          onNavigateToRun={() => onNavigateToRun()}
          onNavigateToConcepts={onNavigateToConcepts}
        />
      )}
    </div>
  )
}

// ============ 步骤指示器 ============
function StepIndicator({ step }: { step: 1 | 2 | 3 | 4 }) {
  const steps = [
    { n: 1, label: '选择领域' },
    { n: 2, label: '粘贴材料' },
    { n: 3, label: '审核候选' },
    { n: 4, label: '完成入库' },
  ]
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-card p-1.5">
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className={cn(
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-xs',
            step === s.n ? 'bg-primary text-primary-foreground' : step > s.n ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
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

// ============ 步骤 1: 选择领域 ============
function Step1Domain({ domainMode, setDomainMode, existingDomainId, setExistingDomainId, newDomain, setNewDomain, domains, onNext }: {
  domainMode: 'existing' | 'new'
  setDomainMode: (m: 'existing' | 'new') => void
  existingDomainId: string
  setExistingDomainId: (s: string) => void
  newDomain: { code: string; nameZh: string; description: string; color: string }
  setNewDomain: React.Dispatch<React.SetStateAction<{ code: string; nameZh: string; description: string; color: string }>>
  domains?: Domain[]
  onNext: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="选择目标领域" description="可以创建新领域，也可以往已有领域补充概念">
        <div className="flex flex-col gap-3">
          {/* 模式切换 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDomainMode('new')}
              className={cn(
                'flex items-center gap-2 rounded-lg border p-3 text-left transition-all',
                domainMode === 'new' ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-border hover:border-slate-300',
              )}
            >
              <div className="flex size-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Sparkles className="size-4" />
              </div>
              <div>
                <div className="text-sm font-medium">创建新领域</div>
                <div className="text-[11px] text-muted-foreground">从零开始建本体</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setDomainMode('existing')}
              className={cn(
                'flex items-center gap-2 rounded-lg border p-3 text-left transition-all',
                domainMode === 'existing' ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-border hover:border-slate-300',
              )}
            >
              <div className="flex size-8 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                <Boxes className="size-4" />
              </div>
              <div>
                <div className="text-sm font-medium">补充已有领域</div>
                <div className="text-[11px] text-muted-foreground">向已有领域追加概念/规则</div>
              </div>
            </button>
          </div>

          {domainMode === 'new' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">领域 code *</label>
                <Input
                  value={newDomain.code}
                  onChange={(e) => setNewDomain(p => ({ ...p, code: e.target.value }))}
                  placeholder="如 contract"
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">中文名 *</label>
                <Input
                  value={newDomain.nameZh}
                  onChange={(e) => setNewDomain(p => ({ ...p, nameZh: e.target.value }))}
                  placeholder="如 合同审核"
                  className="text-xs"
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">描述</label>
                <Textarea
                  value={newDomain.description}
                  onChange={(e) => setNewDomain(p => ({ ...p, description: e.target.value }))}
                  placeholder="领域说明"
                  className="min-h-[60px] text-xs"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {domains?.map(d => {
                const dc = domainColor(d.code)
                const active = existingDomainId === d.id
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setExistingDomainId(d.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border p-3 text-left transition-all',
                      active ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-slate-300',
                    )}
                  >
                    <span className={cn('size-3 rounded-full', dc.dot)} />
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm font-medium">{d.nameZh}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{d.code}</span>
                    </div>
                    <div className="flex gap-1.5 text-[10px] text-muted-foreground">
                      <span>{d._count.concepts} 概念</span>
                      <span>·</span>
                      <span>{d._count.rulesets} 规则集</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={domainMode === 'new' ? !newDomain.code || !newDomain.nameZh : !existingDomainId}
        >
          下一步：粘贴材料 <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ============ 步骤 2: 粘贴材料 ============
function Step2Materials({ materials, setMaterials, onBack, onAnalyze, analyzing }: {
  materials: string
  setMaterials: (s: string) => void
  onBack: () => void
  onAnalyze: () => void
  analyzing: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <FileText className="size-4 text-emerald-500" />
            业务材料
          </span>
        }
        description="粘贴公司制度文档、流程说明、业务规则等原文。AI 会从中抽取概念、关系和规则"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            <Brain className="size-3.5" />
            请尽量提供清晰的文本（编号、字段、规则条件等）
          </div>
          <Textarea
            value={materials}
            onChange={(e) => setMaterials(e.target.value)}
            placeholder="例如：&#10;1. 员工报销需填写报销单&#10;2. 住宿费按城市和职级有上限&#10;3. 发票号不可重复&#10;..."
            className="min-h-[360px] resize-y bg-slate-50 font-mono text-xs leading-relaxed dark:bg-slate-900/50 scrollbar-thin"
            spellCheck={false}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{materials.length} 字符</span>
            <span>建议 200-2000 字，太长会拆批</span>
          </div>
        </div>
      </SectionCard>

      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-3.5" /> 返回选择领域
        </Button>
        <Button onClick={onAnalyze} disabled={analyzing || !materials.trim()}>
          {analyzing ? <RefreshCw className="size-3.5 animate-spin" /> : <Brain className="size-3.5" />}
          {analyzing ? 'AI 分析中…' : '开始分析'}
        </Button>
      </div>
    </div>
  )
}

// ============ 步骤 3: 审核候选 ============
function Step3Review({ result, selected, setSelected, extractionMeta, onBack, onCommit, committing }: {
  result: AutoBuildResult
  selected: { concepts: Set<string>; relations: Set<string>; rules: Set<string>; scenarios: Set<string> }
  setSelected: React.Dispatch<React.SetStateAction<{ concepts: Set<string>; relations: Set<string>; rules: Set<string>; scenarios: Set<string> }>>
  extractionMeta: { durationMs?: number; usage?: any } | null
  onBack: () => void
  onCommit: () => void
  committing: boolean
}) {
  const toggle = (group: 'concepts' | 'relations' | 'rules' | 'scenarios', idx: string) => {
    setSelected(prev => {
      const next = new Set(prev[group])
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return { ...prev, [group]: next }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* LLM 元信息 */}
      {extractionMeta && (
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Brain className="size-4 text-emerald-500" />
              AI 抽取结果
            </span>
          }
          description="AI 从材料中识别出的候选概念和规则，请勾选要入库的内容"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetaBox icon={Boxes} label="概念" value={result.concepts.length} selected={selected.concepts.size} accent="emerald" />
            <MetaBox icon={GitBranch} label="关系" value={result.relations.length} selected={selected.relations.size} accent="teal" />
            <MetaBox icon={Code2} label="规则" value={result.rules.length} selected={selected.rules.size} accent="amber" />
            <MetaBox icon={PlayCircle} label="场景" value={result.scenarios.length} selected={selected.scenarios.size} accent="violet" />
          </div>
          <div className="mt-3 flex items-center gap-3 border-t pt-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="size-3" /> 耗时 {extractionMeta.durationMs}ms
            </span>
            {extractionMeta.usage && (
              <span className="flex items-center gap-1">
                <Zap className="size-3" /> 字数: {extractionMeta.usage.total_tokens ?? '-'}
              </span>
            )}
          </div>
        </SectionCard>
      )}

      {/* 候选概念 */}
      <SectionCard
        title={<span className="flex items-center gap-2"><Boxes className="size-4 text-emerald-500" />候选概念</span>}
        description={`${selected.concepts.size} / ${result.concepts.length} 选中`}
      >
        <ul className="flex flex-col gap-2">
          {result.concepts.map((c, i) => {
            const idx = String(i)
            const checked = selected.concepts.has(idx)
            return (
              <li key={idx} className={cn('rounded-lg border bg-card transition-all', checked ? 'border-emerald-300 dark:border-emerald-800' : 'opacity-60')}>
                <div className="flex items-start gap-3 p-3">
                  <Checkbox checked={checked} onCheckedChange={() => toggle('concepts', idx)} className="mt-1" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{c.labelZh}</span>
                      <code className="font-mono text-[10px] text-muted-foreground">{c.localName}</code>
                      {c.isCore && (
                        <Badge variant="outline" className="border-0 bg-emerald-100 px-1 text-[9px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          建议核心
                        </Badge>
                      )}
                      <Badge variant="outline" className="border-0 bg-slate-100 px-1 text-[9px] dark:bg-slate-800">
                        {c.fields.length} 字段
                      </Badge>
                    </div>
                    {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                    {c.fields.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.fields.map(f => (
                          <code key={f.name} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {f.name}:{f.type}{f.required ? '*' : ''}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </SectionCard>

      {/* 候选关系 */}
      {result.relations.length > 0 && (
        <SectionCard
          title={<span className="flex items-center gap-2"><GitBranch className="size-4 text-teal-500" />候选关系</span>}
          description={`${selected.relations.size} / ${result.relations.length} 选中`}
        >
          <ul className="flex flex-col gap-1.5">
            {result.relations.map((r, i) => {
              const idx = String(i)
              const checked = selected.relations.has(idx)
              return (
                <li key={idx} className={cn('flex items-center gap-3 rounded-lg border bg-card p-2.5', checked ? '' : 'opacity-60')}>
                  <Checkbox checked={checked} onCheckedChange={() => toggle('relations', idx)} />
                  <div className="flex flex-1 flex-wrap items-center gap-2 text-xs">
                    <code className="font-mono font-medium">{r.source}</code>
                    <Badge variant="outline" className="border-0 bg-teal-100 px-1 text-[9px] text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                      {r.relationType} ({r.cardinality})
                    </Badge>
                    <ArrowRight className="size-3 text-muted-foreground" />
                    <code className="font-mono font-medium">{r.target}</code>
                    <span className="text-muted-foreground">· {r.name}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      )}

      {/* 候选规则 */}
      {result.rules.length > 0 && (
        <SectionCard
          title={<span className="flex items-center gap-2"><Code2 className="size-4 text-amber-500" />候选规则</span>}
          description={`${selected.rules.size} / ${result.rules.length} 选中`}
        >
          <ul className="flex flex-col gap-2">
            {result.rules.map((r, i) => {
              const idx = String(i)
              const checked = selected.rules.has(idx)
              return (
                <li key={idx} className={cn('rounded-lg border bg-card', checked ? 'border-amber-300 dark:border-amber-800' : 'opacity-60')}>
                  <div className="flex items-start gap-3 p-3">
                    <Checkbox checked={checked} onCheckedChange={() => toggle('rules', idx)} className="mt-1" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="font-mono text-xs font-semibold">{r.code}</code>
                        <Badge variant="outline" className={cn(
                          'border-0 px-1 text-[9px]',
                          r.severity === 'ERROR' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                          : r.severity === 'WARNING' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800',
                        )}>
                          {r.severity}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">{r.name}</span>
                      </div>
                      {r.message && <p className="text-xs text-amber-700 dark:text-amber-300">提示：{r.message}</p>}
                      {r.explanation && <p className="text-[11px] text-muted-foreground">{r.explanation}</p>}
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">查看规则配置</summary>
                        <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 font-mono text-[10px] text-slate-700 dark:bg-slate-900/60 dark:text-slate-300 scrollbar-thin">
                          <code>{r.dsl}</code>
                        </pre>
                      </details>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      )}

      {/* 候选场景 */}
      {result.scenarios.length > 0 && (
        <SectionCard
          title={<span className="flex items-center gap-2"><PlayCircle className="size-4 text-violet-500" />候选场景</span>}
          description={`${selected.scenarios.size} / ${result.scenarios.length} 选中`}
        >
          <ul className="flex flex-col gap-1.5">
            {result.scenarios.map((s, i) => {
              const idx = String(i)
              const checked = selected.scenarios.has(idx)
              return (
                <li key={idx} className={cn('flex items-center gap-3 rounded-lg border bg-card p-2.5', checked ? '' : 'opacity-60')}>
                  <Checkbox checked={checked} onCheckedChange={() => toggle('scenarios', idx)} />
                  <div className="flex flex-1 items-center gap-2 text-xs">
                    <code className="font-mono font-medium">{s.code}</code>
                    <span className="text-foreground">{s.name}</span>
                    {s.description && <span className="text-muted-foreground">· {s.description}</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      )}

      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={onBack} disabled={committing}>
          <ArrowLeft className="size-3.5" /> 返回修改材料
        </Button>
        <Button onClick={onCommit} disabled={committing}>
          {committing ? <RefreshCw className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {committing ? '入库中…' : `入库（${selected.concepts.size + selected.rules.size + selected.scenarios.size} 项）`}
        </Button>
      </div>
    </div>
  )
}

// ============ 步骤 4: 完成 ============
function Step4Done({ domainId, onReset, onNavigateToRun, onNavigateToConcepts }: {
  domainId: string
  onReset: () => void
  onNavigateToRun: () => void
  onNavigateToConcepts: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-500" />
            本体已成功入库！
          </span>
        }
        description="可以前往概念仓库查看新本体，或直接试运行场景"
      >
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="flex size-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40">
            <CheckCircle2 className="size-8 text-emerald-500" />
          </div>
          <div className="text-center">
            <div className="text-base font-semibold text-foreground">智能建库完成</div>
            <p className="mt-1 text-xs text-muted-foreground">
              已创建领域、概念、关系、规则集和场景。你现在可以：
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={onNavigateToConcepts} variant="outline">
              <Boxes className="size-3.5" /> 查看概念仓库
            </Button>
            <Button onClick={onNavigateToRun}>
              <PlayCircle className="size-3.5" /> 立即试运行
            </Button>
            <Button variant="ghost" onClick={onReset}>
              <RefreshCw className="size-3.5" /> 再建一个
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

function MetaBox({ icon: Icon, label, value, selected, accent }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  selected: number
  accent: 'emerald' | 'amber' | 'teal' | 'violet'
}) {
  const accentMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
    teal: 'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', accentMap[accent])}>
        <Icon className="size-4" />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-lg font-semibold text-foreground">
          {selected}<span className="text-xs text-muted-foreground"> / {value}</span>
        </span>
      </div>
    </div>
  )
}
