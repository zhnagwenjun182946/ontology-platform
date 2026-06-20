'use client'

import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PaginationProps {
  total: number
  page: number
  pageSize: number
  onChange: (page: number) => void
}

export function Pagination({ total, page, pageSize, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null

  // 生成页码：始终显示首末页，中间显示当前页±1
  const pages: (number | 'ellipsis')[] = []
  const add = (p: number | 'ellipsis') => pages.push(p)

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) add(i)
  } else {
    add(1)
    if (page > 3) add('ellipsis')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) add(i)
    if (page < totalPages - 2) add('ellipsis')
    add(totalPages)
  }

  return (
    <div className="flex items-center justify-between gap-3 py-3 text-xs text-muted-foreground">
      <span>
        共 {total} 条 · 第 {page}/{totalPages} 页
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="上一页"
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        {pages.map((p, i) => {
          if (p === 'ellipsis') {
            return (
              <span key={`e${i}`} className="flex size-7 items-center justify-center text-muted-foreground">
                <MoreHorizontal className="size-3.5" />
              </span>
            )
          }
          return (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="sm"
              className={cn('h-7 w-7 p-0 text-xs', p === page && 'font-semibold')}
              onClick={() => onChange(p)}
            >
              {p}
            </Button>
          )
        })}
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="下一页"
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
