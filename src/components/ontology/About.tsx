'use client'

import * as React from 'react'
import {
  PackageOpen, Layers, Code2, ArrowRight, CheckCircle2,
  GitBranch, FileText, Sparkles, Network,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { PageHeader, SectionCard } from './primitives'
import type { TabKey } from './AppShell'

export function About({ onNavigate }: { onNavigate?: (k: TabKey) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="关于平台"
        description="三大设计创新 · 让本体成为「在线治理的语义资产」"
        icon={Sparkles}
      />

      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-6 dark:from-emerald-950/40 dark:via-card dark:to-teal-950/30">
        <div className="absolute right-6 top-6 hidden md:block">
          <div className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
            <Network className="size-9" />
          </div>
        </div>
        <h2 className="text-lg font-semibold text-foreground">本体不是包，是「在线治理的语义资产」</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          传统「打包发布」让本体变成了研发独占的产物 —— 业务改不动、跨团队复用难、版本爆炸。
          本平台把本体变成在线可编辑、可评审、可冻结快照的资产，
          让业务能看懂、能改、能复用，而不是只让研发打包发版。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onNavigate?.('design')}>
            <FileText className="size-3.5" /> 阅读完整设计文档
          </Button>
          <Button size="sm" variant="outline" onClick={() => onNavigate?.('concepts')}>
            <Layers className="size-3.5" /> 浏览概念仓库
          </Button>
        </div>
      </div>

      {/* 三大创新点 */}
      <div className="grid gap-4 md:grid-cols-3">
        <InnovationCard
          icon={PackageOpen}
          index="01"
          title="不打包发布"
          subtitle="在线编辑 + 版本快照冻结"
          accent="emerald"
          points={[
            '业务用户在 Web Console 直接改本体，无需研发发版',
            '评审通过后冻结不可变快照到 Artifact Store',
            'DB 只存目录 + 版本号 + artifact_uri',
            '类似 Wiki 的「修订历史」，可随时回滚',
          ]}
        />
        <InnovationCard
          icon={Layers}
          index="02"
          title="跨领域去重聚合"
          subtitle="核心本体 + 领域本体 + 等价关系"
          accent="amber"
          points={[
            'Core Ontology 跨领域共享 Person / Organization / Money',
            '报销.Employee、采购.Buyer 聚合到 core:Person',
            '三层去重：URI / 别名 / 字段指纹',
            '聚合视图对外暴露「全平台概念地图」',
          ]}
        />
        <InnovationCard
          icon={Code2}
          index="03"
          title="人能看懂的规则 DSL"
          subtitle="YAML 风格 · 可读中文渲染 · 可编译 SHACL"
          accent="rose"
          points={[
            'YAML 兼容，工具链友好',
            '平台渲染成中文句子 + 表格，业务能看懂',
            '一键编译成 SHACL TTL，研发可直接执行',
            '受治理的 Function Registry，禁止任意代码',
          ]}
        />
      </div>

      {/* 流程示意图 */}
      <SectionCard
        title="对比 v1：从打包发布到在线治理"
        description="v1 的核心痛点与 v2 的解法"
      >
        <ComparisonDiagram />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 聚合示意图 */}
        <SectionCard
          title="去重聚合示意"
          description="跨领域概念通过等价关系合并到核心层"
        >
          <AggregationDiagram />
        </SectionCard>

        {/* DSL 三视图示意图 */}
        <SectionCard
          title="规则三视图"
          description="一份 DSL，三种视角呈现"
        >
          <DslDiagram />
        </SectionCard>
      </div>

      {/* 技术栈 */}
      <SectionCard
        title="技术栈"
        description="本平台基于现代 Web 技术构建"
      >
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-4">
          {[
            ['Next.js 16', 'App Router'],
            ['TypeScript 5', '端到端类型'],
            ['Prisma ORM', 'SQLite'],
            ['Tailwind CSS 4', '原子化样式'],
            ['shadcn/ui', 'New York style'],
            ['recharts', '数据可视化'],
            ['react-markdown', '文档渲染'],
            ['sonner', 'Toast 通知'],
            ['next-themes', '主题切换'],
            ['framer-motion', '动画'],
            ['lucide-react', '图标库'],
            ['自实现 DSL Parser', 'YAML 子集'],
          ].map(([name, desc]) => (
            <div key={name} className="flex flex-col gap-0.5 rounded-md border bg-card p-2.5">
              <span className="font-medium text-foreground">{name}</span>
              <span className="text-[10px] text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function InnovationCard({
  icon: Icon, index, title, subtitle, points, accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  index: string
  title: string
  subtitle: string
  points: string[]
  accent: 'emerald' | 'amber' | 'rose'
}) {
  const accentMap: Record<string, { bg: string; text: string; ring: string; bar: string }> = {
    emerald: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-600 dark:text-emerald-400',
      ring: 'ring-emerald-500/20',
      bar: 'bg-emerald-500',
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-600 dark:text-amber-400',
      ring: 'ring-amber-500/20',
      bar: 'bg-amber-500',
    },
    rose: {
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-600 dark:text-rose-400',
      ring: 'ring-rose-500/20',
      bar: 'bg-rose-500',
    },
  }
  const a = accentMap[accent]
  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-card p-5 shadow-sm">
      <div className={cn('absolute left-0 top-0 h-1 w-full', a.bar)} />
      <div className="flex items-center justify-between">
        <div className={cn('flex size-10 items-center justify-center rounded-lg', a.bg, a.text)}>
          <Icon className="size-5" />
        </div>
        <span className="text-2xl font-bold text-muted-foreground/15">{index}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className={cn('text-xs font-medium', a.text)}>{subtitle}</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {points.map((p, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className={cn('mt-0.5 size-3 shrink-0', a.text)} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ComparisonDiagram() {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center">
      <div className="flex-1 rounded-lg border border-rose-200 bg-rose-50/40 p-3 dark:border-rose-900 dark:bg-rose-950/20">
        <div className="mb-2 flex items-center gap-1.5">
          <Badge variant="outline" className="border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">v1</Badge>
          <span className="text-xs font-medium text-foreground">打包发布</span>
        </div>
        <div className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">
          <FlowStep label="研发写 LinkML + SHACL" />
          <Arrow />
          <FlowStep label="CLI publish-domain 打包" />
          <Arrow />
          <FlowStep label="发版到 Registry" />
          <Arrow />
          <FlowStep label="Worker 拉包执行" muted />
        </div>
      </div>

      <div className="flex items-center justify-center">
        <ArrowRight className="size-5 text-muted-foreground" />
      </div>

      <div className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
        <div className="mb-2 flex items-center gap-1.5">
          <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">v2</Badge>
          <span className="text-xs font-medium text-foreground">在线治理</span>
        </div>
        <div className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">
          <FlowStep label="业务/管理员在线编辑" highlight />
          <Arrow />
          <FlowStep label="实时语法/语义/冲突校验" />
          <Arrow />
          <FlowStep label="评审通过 → 冻结快照" highlight />
          <Arrow />
          <FlowStep label="Worker 按 artifact_uri 执行" muted />
        </div>
      </div>
    </div>
  )
}

function FlowStep({ label, muted, highlight }: { label: string; muted?: boolean; highlight?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-md border px-2 py-1.5 text-center',
        muted && 'border-dashed border-muted-foreground/30 text-muted-foreground/70',
        highlight && 'border-primary/40 bg-primary/5 font-medium text-foreground',
        !muted && !highlight && 'bg-card text-foreground'
      )}
    >
      {label}
    </div>
  )
}

function Arrow() {
  return <div className="text-center text-muted-foreground/40">↓</div>
}

function AggregationDiagram() {
  return (
    <div className="rounded-lg bg-gradient-to-br from-slate-50 to-white p-3 dark:from-slate-900/50 dark:to-slate-900/30">
      <svg viewBox="0 0 480 240" className="w-full">
        {/* Core */}
        <g transform="translate(200, 110)">
          <circle r="38" fill="#10b981" opacity="0.1" />
          <circle r="28" fill="white" stroke="#10b981" strokeWidth="2" />
          <text textAnchor="middle" y="-2" fontSize="11" fontWeight="600" fill="#0f172a">core:</text>
          <text textAnchor="middle" y="12" fontSize="11" fontWeight="600" fill="#0f172a">Person</text>
        </g>

        {/* 报销.Employee */}
        <g transform="translate(60, 50)">
          <rect x="-50" y="-15" width="100" height="36" rx="6" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
          <text textAnchor="middle" y="-1" fontSize="10" fontWeight="600" fill="#065f46">报销.Employee</text>
          <text textAnchor="middle" y="13" fontSize="9" fill="#065f46">CONFIRMED · EXACT</text>
        </g>
        <line x1="110" y1="65" x2="180" y2="100" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4,3" />

        {/* 采购.Buyer */}
        <g transform="translate(60, 195)">
          <rect x="-50" y="-15" width="100" height="36" rx="6" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="1.5" />
          <text textAnchor="middle" y="-1" fontSize="10" fontWeight="600" fill="#92400e">采购.Buyer</text>
          <text textAnchor="middle" y="13" fontSize="9" fill="#92400e">PROPOSED · EXACT</text>
        </g>
        <line x1="110" y1="180" x2="180" y2="135" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="4,3" />

        {/* 合同.Signer（未来） */}
        <g transform="translate(420, 50)">
          <rect x="-50" y="-15" width="100" height="36" rx="6" fill="#f43f5e" opacity="0.1" stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="3,2" />
          <text textAnchor="middle" y="-1" fontSize="10" fontWeight="600" fill="#9f1239">合同.Signer</text>
          <text textAnchor="middle" y="13" fontSize="9" fill="#9f1239">未接入</text>
        </g>
        <line x1="370" y1="65" x2="240" y2="100" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2,3" opacity="0.5" />

        {/* Legend */}
        <g transform="translate(20, 220)">
          <line x1="0" y1="0" x2="20" y2="0" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4,3" />
          <text x="26" y="3" fontSize="9" fill="#64748b">已确认等价</text>
          <line x1="100" y1="0" x2="120" y2="0" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="4,3" />
          <text x="126" y="3" fontSize="9" fill="#64748b">待评审等价</text>
        </g>
      </svg>
      <div className="mt-2 text-center text-xs text-muted-foreground">
        3 个领域概念 → 聚合到 1 个 <span className="font-medium text-foreground">core:Person</span>
      </div>
    </div>
  )
}

function DslDiagram() {
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border bg-card p-2.5">
        <div className="mb-1 flex items-center gap-1.5">
          <Code2 className="size-3 text-emerald-600" />
          <span className="text-xs font-medium text-foreground">DSL (YAML)</span>
        </div>
        <pre className="overflow-x-auto font-mono text-[10px] text-foreground/80 scrollbar-thin">
{`- id: R-EXP-002
  name: 住宿费超标
  severity: warning
  when:
    all:
      - type == "住宿"
      - amount > std_hotel_max(...)`}
        </pre>
      </div>

      <div className="flex justify-center">
        <ArrowRight className="size-4 rotate-90 text-muted-foreground" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2.5 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="mb-1 flex items-center gap-1.5">
            <FileText className="size-3 text-amber-600" />
            <span className="text-xs font-medium text-foreground">可读渲染</span>
          </div>
          <div className="text-[11px] text-foreground/80">
            规则 R-EXP-002 · 住宿费超标
            <br />等级：警告
            <br />条件：当 费用类型 = 住宿 且 金额 超标 时
          </div>
        </div>
        <div className="rounded-md border border-rose-200 bg-rose-50/40 p-2.5 dark:border-rose-900 dark:bg-rose-950/20">
          <div className="mb-1 flex items-center gap-1.5">
            <GitBranch className="size-3 text-rose-600" />
            <span className="text-xs font-medium text-foreground">SHACL TTL</span>
          </div>
          <pre className="overflow-x-auto font-mono text-[9px] text-foreground/80 scrollbar-thin">
{`ex:Shape a sh:NodeShape ;
  sh:targetClass ex:Line ;
  sh:rule [ ... ] .`}
          </pre>
        </div>
      </div>
      <div className="text-center text-[10px] text-muted-foreground">
        业务看可读渲染 · 研发看 SHACL · 治理委员会看 DSL
      </div>
    </div>
  )
}
