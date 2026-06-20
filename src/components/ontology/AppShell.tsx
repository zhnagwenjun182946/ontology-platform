'use client'

import * as React from 'react'
import {
  LayoutDashboard, Boxes, Share2, Code2, PlayCircle, History,
  FileText, Info, Menu, Moon, Sun, Network, Github, Sparkles,
  ScrollText, FlaskConical, Grid3x3, Wand2, Layers,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import { usePlatformInit } from './hooks'
import { Dashboard } from './Dashboard'
import { ConceptRepo } from './ConceptRepo'
import { OntologyGraph } from './OntologyGraph'
import { RuleEngine } from './RuleEngine'
import { ScenarioRun } from './ScenarioRun'
import { RunHistory } from './RunHistory'
import { DesignDoc } from './DesignDoc'
import { About } from './About'
import { AuditLog } from './AuditLog'
import { RuleEval } from './RuleEval'
import { OverlapMatrix } from './OverlapMatrix'
import { DomainManager } from './DomainManager'
import { AutoBuildWizard } from './AutoBuildWizard'

export type TabKey =
  | 'dashboard'
  | 'domains'
  | 'autobuild'
  | 'concepts'
  | 'graph'
  | 'overlap'
  | 'rules'
  | 'eval'
  | 'scenario'
  | 'runs'
  | 'audit'
  | 'design'
  | 'about'

interface NavItem {
  key: TabKey
  label: string
  desc: string
  icon: React.ComponentType<{ className?: string }>
  group: string
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: '仪表盘', desc: '平台概览与最近运行', icon: LayoutDashboard, group: '概览' },
  { key: 'domains', label: '领域管理', desc: '创建/编辑/删除领域', icon: Layers, group: '本体' },
  { key: 'autobuild', label: '智能建库', desc: '从材料自动抽取本体', icon: Wand2, group: '本体' },
  { key: 'concepts', label: '概念仓库', desc: '核心 + 领域概念与聚合视图', icon: Boxes, group: '本体' },
  { key: 'graph', label: '本体图谱', desc: '可视化节点与等价关系', icon: Share2, group: '本体' },
  { key: 'overlap', label: '重叠矩阵', desc: '跨领域共享概念可视化', icon: Grid3x3, group: '本体' },
  { key: 'rules', label: '规则引擎', desc: 'DSL 编辑与可读渲染', icon: Code2, group: '规则' },
  { key: 'eval', label: '规则评测', desc: '批量跑规则集 + 黄金样本', icon: FlaskConical, group: '规则' },
  { key: 'scenario', label: '场景试运行', desc: '上传材料跑规则集', icon: PlayCircle, group: '规则' },
  { key: 'runs', label: '运行记录', desc: '历史运行复核', icon: History, group: '规则' },
  { key: 'audit', label: '审计日志', desc: '变更操作留痕', icon: ScrollText, group: '治理' },
  { key: 'design', label: '设计文档', desc: '平台理念与规范', icon: FileText, group: '帮助' },
  { key: 'about', label: '关于平台', desc: '三大创新点', icon: Info, group: '帮助' },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!mounted) {
    return <div className="size-9" aria-hidden />
  }
  const isDark = theme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? '切换到亮色主题' : '切换到暗色主题'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
        <Network className="size-4" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-foreground">Ontology Console</span>
        <span className="text-[10px] text-muted-foreground">企业级本体平台 v2</span>
      </div>
    </div>
  )
}

function NavList({
  active, onSelect,
}: { active: TabKey; onSelect: (k: TabKey) => void }) {
  const groups = React.useMemo(() => {
    const map = new Map<string, NavItem[]>()
    for (const n of NAV) {
      if (!map.has(n.group)) map.set(n.group, [])
      map.get(n.group)!.push(n)
    }
    return Array.from(map.entries())
  }, [])

  return (
    <nav className="flex flex-col gap-5 px-3 py-4" aria-label="主导航">
      {groups.map(([group, items]) => (
        <div key={group} className="flex flex-col gap-1">
          <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {group}
          </div>
          {items.map((item) => {
            const Icon = item.icon
            const isActive = active === item.key
            return (
              <button
                key={item.key}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelect(item.key)}
                className={cn(
                  'group flex items-start gap-3 rounded-lg px-3 py-2 text-left transition-all',
                  isActive
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60'
                )}
              >
                <Icon
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    isActive ? 'text-primary' : 'text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200'
                  )}
                />
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-[11px] text-muted-foreground">{item.desc}</span>
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function Header({
  active, onOpenMobile,
}: { active: TabKey; onOpenMobile: () => void }) {
  const current = NAV.find((n) => n.key === active)
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenMobile}
        aria-label="打开导航"
      >
        <Menu className="size-4" />
      </Button>
      <div className="hidden md:block">
        <Logo />
      </div>
      <div className="hidden h-6 w-px bg-border md:block" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-medium text-muted-foreground">
          {current?.group} / <span className="text-foreground">{current?.label}</span>
        </span>
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Sparkles className="size-3" /> 在线治理
        </Badge>
      </div>
      <ThemeToggle />
      <Button
        variant="ghost"
        size="icon"
        aria-label="项目仓库"
        className="hidden text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white sm:inline-flex"
        onClick={() => toast.info('设计文档位于 ONTOLOGY_PLATFORM_DESIGN.md')}
      >
        <Github className="size-4" />
      </Button>
    </header>
  )
}

function Footer() {
  return (
    <footer className="mt-auto border-t bg-background/80 backdrop-blur">
      <div className="flex flex-col items-start justify-between gap-2 px-6 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <span>© {new Date().getFullYear()} 企业级本体平台 v2</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">去打包 · 去重聚合 · 人能读 DSL</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Next.js 16 + Prisma + SHACL</span>
        </div>
      </div>
    </footer>
  )
}

export function AppShell() {
  const [active, setActive] = React.useState<TabKey>('dashboard')
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const { status } = usePlatformInit()

  React.useEffect(() => {
    if (status === 'error') {
      toast.error('后端初始化失败，请检查 /api/init')
    } else if (status === 'ready') {
      toast.success('平台已就绪', { description: '种子数据已加载' })
    }
  }, [status])

  const handleSelect = (k: TabKey) => {
    setActive(k)
    setMobileOpen(false)
  }

  const render = () => {
    switch (active) {
      case 'dashboard': return <Dashboard onNavigate={handleSelect} />
      case 'domains': return <DomainManager onNavigate={handleSelect} />
      case 'autobuild': return <AutoBuildWizard onNavigateToRun={() => setActive('scenario')} onNavigateToConcepts={() => setActive('concepts')} />
      case 'concepts': return <ConceptRepo />
      case 'graph': return <OntologyGraph />
      case 'overlap': return <OverlapMatrix />
      case 'rules': return <RuleEngine />
      case 'eval': return <RuleEval />
      case 'scenario': return <ScenarioRun onJumpToRuns={() => setActive('runs')} />
      case 'runs': return <RunHistory />
      case 'audit': return <AuditLog />
      case 'design': return <DesignDoc />
      case 'about': return <About />
      default: return null
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        active={active}
        onOpenMobile={() => setMobileOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        {/* 桌面侧边栏 */}
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r bg-sidebar/40 scrollbar-thin md:block">
          <NavList active={active} onSelect={handleSelect} />
        </aside>

        {/* 移动端侧边栏 (Sheet) */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="px-4 pt-4">
              <SheetTitle><Logo /></SheetTitle>
            </SheetHeader>
            <NavList active={active} onSelect={handleSelect} />
          </SheetContent>
        </Sheet>

        {/* 主内容 */}
        <main
          className="relative flex-1 overflow-y-auto scrollbar-thin"
          aria-label={NAV.find(n => n.key === active)?.label}
        >
          <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6 lg:p-8">
            <React.Suspense
              fallback={
                <div className="flex h-64 items-center justify-center text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    加载中...
                  </div>
                </div>
              }
            >
              {render()}
            </React.Suspense>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  )
}
