'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  Boxes, Plus, Pencil, Trash2, RefreshCw, AlertCircle, Check, X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

import { useFetch } from './hooks'
import { api, domainColor } from './lib'
import {
  LoadingState, ErrorState, EmptyState, PageHeader, SectionCard,
} from './primitives'

interface Domain {
  id: string
  code: string
  nameZh: string
  nameEn?: string | null
  description?: string | null
  status: string
  owner?: string | null
  icon?: string | null
  color?: string | null
  activeVersion?: string | null
  createdAt: string
  updatedAt: string
  _count: { concepts: number; rulesets: number; scenarios: number }
}

const COLOR_PRESETS = [
  { name: 'emerald', hex: '#10b981' },
  { name: 'amber', hex: '#f59e0b' },
  { name: 'rose', hex: '#f43f5e' },
  { name: 'teal', hex: '#14b8a6' },
  { name: 'violet', hex: '#8b5cf6' },
  { name: 'orange', hex: '#f97316' },
]

const ICON_PRESETS = ['boxes', 'receipt', 'shopping-cart', 'file-signature', 'shield-check', 'clipboard-check', 'wrench', 'truck']

export function DomainManager({ onNavigate }: { onNavigate: (k: 'concepts' | 'rules' | 'scenario' | 'autobuild') => void }) {
  const { data, loading, error, refetch } = useFetch<Domain[]>('/domains')
  const [editing, setEditing] = React.useState<Domain | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [deleting, setDeleting] = React.useState<Domain | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="领域管理"
        icon={Boxes}
        description="创建、编辑、删除领域。每个领域是一组概念 + 关系 + 规则 + 场景的集合"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={refetch}>
              <RefreshCw className="size-3.5" /> 刷新
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" /> 新建领域
            </Button>
          </div>
        }
      />

      {loading ? (
        <LoadingState label="加载领域…" />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="还没有领域"
          hint="点击右上角新建领域，或前往智能建库自动生成"
          icon={Boxes}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map(d => {
            const dc = domainColor(d.code)
            return (
              <DomainCard
                key={d.id}
                domain={d}
                dc={dc}
                onEdit={() => setEditing(d)}
                onDelete={() => setDeleting(d)}
                onViewConcepts={() => onNavigate('concepts')}
                onViewRules={() => onNavigate('rules')}
                onViewScenario={() => onNavigate('scenario')}
              />
            )
          })}
        </div>
      )}

      {/* 新建/编辑对话框 */}
      {(creating || editing) && (
        <DomainEditDialog
          domain={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); refetch() }}
        />
      )}

      {/* 删除确认 */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除领域「{deleting?.nameZh}」？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将级联删除该领域的所有概念、关系、规则集和场景，且不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={async () => {
                if (!deleting) return
                try {
                  await api(`/domains/${deleting.id}`, { method: 'DELETE' })
                  toast.success('领域已删除', { description: deleting.nameZh })
                  setDeleting(null)
                  refetch()
                } catch (e: any) {
                  toast.error('删除失败', { description: e.message })
                }
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function DomainCard({ domain, dc, onEdit, onDelete, onViewConcepts, onViewRules, onViewScenario }: {
  domain: Domain
  dc: ReturnType<typeof domainColor>
  onEdit: () => void
  onDelete: () => void
  onViewConcepts: () => void
  onViewRules: () => void
  onViewScenario: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={cn('flex size-9 items-center justify-center rounded-lg', dc.bg, dc.text)}>
            <Boxes className="size-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">{domain.nameZh}</span>
            <code className="font-mono text-[10px] text-muted-foreground">{domain.code}</code>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="size-7" onClick={onEdit} aria-label="编辑">
            <Pencil className="size-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7 text-rose-500 hover:text-rose-700" onClick={onDelete} aria-label="删除">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
        {domain.description || '无描述'}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <Badge variant="outline" className={cn('gap-1 border-0', dc.bg, dc.text)}>
          <Boxes className="size-2.5" /> {domain._count.concepts} 概念
        </Badge>
        <Badge variant="outline" className="border-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {domain._count.rulesets} 规则集
        </Badge>
        <Badge variant="outline" className="border-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {domain._count.scenarios} 场景
        </Badge>
        {domain.activeVersion && (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            v{domain.activeVersion}
          </Badge>
        )}
      </div>

      {domain.owner && (
        <div className="text-[10px] text-muted-foreground">负责人：{domain.owner}</div>
      )}

      <div className="mt-auto flex items-center gap-1 border-t pt-2">
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onViewConcepts}>
          概念
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onViewRules}>
          规则
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onViewScenario}>
          试运行
        </Button>
      </div>
    </div>
  )
}

function DomainEditDialog({ domain, onClose, onSaved }: {
  domain: Domain | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!domain
  const [code, setCode] = React.useState(domain?.code ?? '')
  const [nameZh, setNameZh] = React.useState(domain?.nameZh ?? '')
  const [nameEn, setNameEn] = React.useState(domain?.nameEn ?? '')
  const [description, setDescription] = React.useState(domain?.description ?? '')
  const [owner, setOwner] = React.useState(domain?.owner ?? '')
  const [color, setColor] = React.useState(domain?.color ?? '#10b981')
  const [icon, setIcon] = React.useState(domain?.icon ?? 'boxes')
  const [saving, setSaving] = React.useState(false)

  const handleSubmit = async () => {
    if (!code || !nameZh) {
      toast.error('code 和中文名必填')
      return
    }
    setSaving(true)
    try {
      const payload: any = {
        nameZh, nameEn: nameEn || null, description: description || null,
        owner: owner || null, color, icon,
      }
      if (!isEdit) payload.code = code
      if (isEdit && domain) {
        await api(`/domains/${domain.id}`, { method: 'PUT', json: payload })
        toast.success('领域已更新', { description: nameZh })
      } else {
        await api('/domains', { method: 'POST', json: payload })
        toast.success('领域已创建', { description: nameZh })
      }
      onSaved()
    } catch (e: any) {
      toast.error('保存失败', { description: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑领域' : '新建领域'}</DialogTitle>
          <DialogDescription>
            {isEdit ? `修改 ${domain?.nameZh} 的信息` : '创建一个新领域，后续可添加概念、规则和场景'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">领域 code *</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="如 reimbursement"
                disabled={isEdit}
                className="font-mono text-xs"
              />
              {!isEdit && <span className="text-[10px] text-muted-foreground">唯一标识，创建后不可改</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">中文名 *</label>
              <Input value={nameZh} onChange={(e) => setNameZh(e.target.value)} placeholder="如 办公报销" className="text-xs" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">英文名</label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="如 Reimbursement" className="text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">负责人</label>
              <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="如 财务部" className="text-xs" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">描述</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="领域说明，比如涵盖哪些业务、目标是什么"
              className="min-h-[60px] text-xs"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">主题色</label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map(c => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setColor(c.hex)}
                  className={cn(
                    'flex size-7 items-center justify-center rounded-md border-2 transition-all',
                    color === c.hex ? 'border-foreground' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c.hex }}
                  aria-label={c.name}
                >
                  {color === c.hex && <Check className="size-3 text-white" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            <X className="size-3.5" /> 取消
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !code || !nameZh}>
            {saving ? <RefreshCw className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
