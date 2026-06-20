'use client'

import * as React from 'react'
import {
  LayoutDashboard, Boxes, Share2, Code2, PlayCircle, History,
  FileText, Info, Menu, Moon, Sun, ShieldCheck,
  ScrollText, FlaskConical, Grid3x3, Wand2, Layers, LogOut,
  PanelLeft, User, Settings,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import { usePlatformInit } from './hooks'
import { Dashboard } from './Dashboard'
import { ConceptRepo } from './ConceptRepo'
import { OntologyGraph } from './OntologyGraph'
import { RuleEngine } from './RuleEngine'
import { ScenarioRun } from './ScenarioRun'
import { RunHistory } from './RunHistory'
import { AuditLog } from './AuditLog'
import { RuleEval } from './RuleEval'
import { OverlapMatrix } from './OverlapMatrix'
import { DomainManager } from './DomainManager'
import { AutoBuildWizard } from './AutoBuildWizard'
import { LoginPage, isLoggedIn, logout } from './LoginPage'

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
  { key: 'concepts', label: '概念仓库', desc: '管理业务概念和合并视图', icon: Boxes, group: '本体' },
  { key: 'graph', label: '本体图谱', desc: '可视化节点与等价关系', icon: Share2, group: '本体' },
  { key: 'overlap', label: '重叠矩阵', desc: '跨领域共享概念可视化', icon: Grid3x3, group: '本体' },
  { key: 'rules', label: '规则引擎', desc: '规则编辑和中文说明', icon: Code2, group: '规则' },
  { key: 'eval', label: '规则评测', desc: '批量跑规则集 + 黄金样本', icon: FlaskConical, group: '规则' },
  { key: 'scenario', label: '场景试运行', desc: '上传材料跑规则集', icon: PlayCircle, group: '规则' },
  { key: 'runs', label: '运行记录', desc: '历史运行复核', icon: History, group: '规则' },
  { key: 'audit', label: '审计日志', desc: '查看所有操作记录', icon: ScrollText, group: '治理' },
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
      <div className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
        <ShieldCheck className="size-4" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-foreground">智规平台</span>
        <span className="text-[10px] text-muted-foreground">业务规则智能校验</span>
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
    <nav className="flex flex-col gap-4 px-3 py-4" aria-label="主导航">
      {groups.map(([group, items]) => (
        <div key={group} className="flex flex-col gap-0.5">
          <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
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
                  'group flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )}
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0',
                    isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground'
                  )}
                />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function Header({
  active, onOpenMobile, onToggleSidebar, sidebarCollapsed,
}: { active: TabKey; onOpenMobile: () => void; onToggleSidebar: () => void; sidebarCollapsed: boolean }) {
  const current = NAV.find((n) => n.key === active)
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b bg-background px-4 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenMobile}
        aria-label="打开导航"
      >
        <Menu className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        onClick={onToggleSidebar}
        aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
      >
        <PanelLeft className="size-4" />
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
      <ThemeToggle />
      {/* 用户信息下拉 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
              <User className="size-3.5" />
            </span>
            <span className="hidden text-sm sm:inline">管理员</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            管理员 · default 租户
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 text-xs" disabled>
            <Settings className="size-3.5" /> 用户设置
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 text-xs text-destructive" onClick={logout}>
            <LogOut className="size-3.5" /> 退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

function Footer() {
  return (
    <footer className="mt-auto border-t bg-background/80 backdrop-blur">
      <div className="flex flex-col items-start justify-between gap-2 px-6 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <span>© {new Date().getFullYear()} 智规平台</span>
      </div>
    </footer>
  )
}

export function AppShell() {
  const [active, setActive] = React.useState<TabKey>('dashboard')
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [loggedIn, setLoggedIn] = React.useState(false)
  const { status } = usePlatformInit()

  React.useEffect(() => {
    setLoggedIn(isLoggedIn())
  }, [])

  React.useEffect(() => {
    if (status === 'error') {
      toast.error('数据加载失败，请刷新页面重试')
    }
  }, [status])

  if (!loggedIn) return <LoginPage />

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
      default: return null
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header
        active={active}
        onOpenMobile={() => setMobileOpen(true)}
        onToggleSidebar={() => setSidebarCollapsed(v => !v)}
        sidebarCollapsed={sidebarCollapsed}
      />
      <div className="flex flex-1 overflow-hidden">
        {/* 桌面侧边栏（可折叠，深色背景） */}
        {!sidebarCollapsed && (
          <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar scrollbar-thin md:block">
            <NavList active={active} onSelect={handleSelect} />
          </aside>
        )}

        {/* 移动端侧边栏 (Sheet) */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
            <SheetHeader className="px-4 pt-4">
              <SheetTitle><Logo /></SheetTitle>
            </SheetHeader>
            <NavList active={active} onSelect={handleSelect} />
          </SheetContent>
        </Sheet>

        {/* 主内容（独立滚动，含 Footer） */}
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
          <Footer />
        </main>
      </div>
    </div>
  )
}
