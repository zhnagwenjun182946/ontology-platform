'use client'

import * as React from 'react'
import { AlertCircle, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { severityStyle, statusBadgeClass } from './lib'

// ============ 状态展示 ============
export function LoadingState({ label = '加载中…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-3 py-12 text-muted-foreground', className)}>
      <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-rose-200 bg-rose-50 py-10 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
      <AlertCircle className="size-5" />
      <div className="text-sm font-medium">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-md bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700"
        >
          重试
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, hint, icon: Icon = Inbox }: {
  title: string
  hint?: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <Icon className="size-6 text-muted-foreground/60" />
      <div className="text-sm font-medium text-foreground">{title}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

// ============ 卡片 ============
export function SectionCard({
  title, description, action, children, className, bodyClassName,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children?: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <Card className={cn('gap-3 py-4', className)}>
      {(title || action) && (
        <CardHeader className="px-4 pb-0 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              {title && <CardTitle className="text-sm">{title}</CardTitle>}
              {description && <CardDescription className="text-xs">{description}</CardDescription>}
            </div>
            {action}
          </div>
        </CardHeader>
      )}
      <CardContent className={cn('px-4 sm:px-5', bodyClassName)}>
        {children}
      </CardContent>
    </Card>
  )
}

// ============ 页面标题 ============
export function PageHeader({
  title, description, actions, icon: Icon,
}: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {Icon && (
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" />
            </div>
          )}
          <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {title}
          </h1>
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ============ 徽章 ============
export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  const s = severityStyle(severity)
  return (
    <Badge variant="outline" className={cn('gap-1 border', s.badge, className)}>
      <span className={cn('size-1.5 rounded-full', s.dot)} />
      {s.label}
    </Badge>
  )
}

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return null
  return (
    <Badge variant="outline" className={cn('border', statusBadgeClass(status), className)}>
      {status}
    </Badge>
  )
}

export function ScopeBadge({ scope }: { scope: string }) {
  if (scope === 'CORE') {
    return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">CORE</Badge>
  }
  return <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">DOMAIN</Badge>
}

// ============ KPI 卡 ============
export function KpiCard({
  label, value, hint, icon: Icon, accent = 'emerald',
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  accent?: 'emerald' | 'amber' | 'rose' | 'slate'
}) {
  const accentMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
  }
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className="text-2xl font-semibold tracking-tight text-foreground">{value}</span>
          {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
        </div>
        {Icon && (
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', accentMap[accent])}>
            <Icon className="size-5" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
