'use client'

/**
 * 单领域概念关系图（可复用）。
 *
 * 使用 react-zoom-pan-pinch 提供画布式交互：拖动空白处平移、滚轮缩放、
 * 双指捏合（触屏）。节点拖拽（改位置）通过 stopPropagation 与画布平移共存。
 *
 * 用于：
 *   - 建库审核页（AutoBuildWizard Step3）：提交前预览候选领域长什么样、有无孤立节点
 *   - 领域管理卡片「查看图谱」：看单个已建领域的概念关系图
 */
import * as React from 'react'
import { createPortal } from 'react-dom'
import { ZoomIn, ZoomOut, Maximize2, Share2, AlertTriangle, X } from 'lucide-react'
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  computeLayout, layoutLabel, curvePath, type LayoutKind, type LayoutNode, type LayoutEdge,
} from './layout'
import { SectionCard, EmptyState } from './primitives'

export interface DomainGraphNode {
  localName: string
  labelZh: string
  mapsToCore?: string
}

export interface DomainGraphEdge {
  source: string
  target: string
  relationType: string
  name: string
}

export interface DomainConceptGraphProps {
  title?: string
  nodes: DomainGraphNode[]
  edges: DomainGraphEdge[]
  isolatedWarning?: string[]
  /** 裸模式：不套 SectionCard，画布直接铺满父容器（用于全屏覆盖层） */
  bare?: boolean
}

const VIEW_W = 1100
const VIEW_H = 720
const RELATION_COLOR = '#10b981'

function buildGraph(nodes: DomainGraphNode[], edges: DomainGraphEdge[]) {
  const graphNodes: LayoutNode[] = nodes.map(n => ({ id: n.localName, label: n.labelZh }))
  const layoutEdges: LayoutEdge[] = edges
    .filter(e => nodes.some(n => n.localName === e.source) && nodes.some(n => n.localName === e.target))
    .map(e => ({ from: e.source, to: e.target }))
  const connected = new Set<string>()
  for (const e of layoutEdges) { connected.add(e.from); connected.add(e.to) }
  const isolated = nodes.map(n => n.localName).filter(id => !connected.has(id))
  return { graphNodes, layoutEdges, isolated }
}

export function DomainConceptGraph({ title = '领域关系图', nodes, edges, isolatedWarning, bare = false }: DomainConceptGraphProps) {
  const [layoutKind, setLayoutKind] = React.useState<LayoutKind>('hierarchy')
  const [dragOverride, setDragOverride] = React.useState<Map<string, { x: number; y: number }>>(new Map())
  const dragRef = React.useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const svgRef = React.useRef<SVGSVGElement | null>(null)
  const transformRef = React.useRef<ReactZoomPanPinchRef | null>(null)
  const [fullscreen, setFullscreen] = React.useState(false)

  React.useEffect(() => { setDragOverride(new Map()) }, [layoutKind])

  const { graphNodes, layoutEdges, isolated } = React.useMemo(
    () => buildGraph(nodes, edges),
    [nodes, edges],
  )
  const positions = React.useMemo(
    () => computeLayout(graphNodes, layoutEdges, layoutKind),
    [graphNodes, layoutEdges, layoutKind],
  )
  const posMap = React.useMemo(() => new Map(positions.map(p => [p.id, p])), [positions])

  const toSvgCoords = React.useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX; pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }, [])

  const handleDown = React.useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation(); e.preventDefault()
    const p = posMap.get(id)
    if (!p) return
    const pos = toSvgCoords(e.clientX, e.clientY)
    dragRef.current = { id, offsetX: pos.x - p.x, offsetY: pos.y - p.y }
  }, [posMap, toSvgCoords])

  const handleMove = React.useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return
    const pos = toSvgCoords(e.clientX, e.clientY)
    const { id, offsetX, offsetY } = dragRef.current
    setDragOverride(prev => { const next = new Map(prev); next.set(id, { x: pos.x - offsetX, y: pos.y - offsetY }); return next })
  }, [toSvgCoords])

  const handleUp = React.useCallback(() => { dragRef.current = null }, [])

  if (nodes.length === 0) {
    if (bare) {
      return <EmptyState title="无概念" hint="该领域暂无概念" icon={Share2} />
    }
    return (
      <SectionCard title={<span className="flex items-center gap-2"><Share2 className="size-4 text-primary" />{title}</span>}>
        <EmptyState title="无概念" hint="该领域暂无概念" icon={Share2} />
      </SectionCard>
    )
  }

  const edgePairIndex = (from: string, to: string) =>
    layoutEdges.filter(e => (e.from === from && e.to === to) || (e.from === to && e.to === from))
      .indexOf(layoutEdges.find(e => (e.from === from && e.to === to) || (e.from === to && e.to === from))!)

  const isolatedSet = new Set([...isolated, ...(isolatedWarning ?? [])])

  // SVG 图谱元素（含节点拖拽；拖拽时 stopPropagation 避免触发画布平移）
  const graphSvg = (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="select-none"
      style={{ minWidth: VIEW_W, minHeight: VIEW_H }}
      onMouseMove={handleMove}
      onMouseUp={handleUp}
      onMouseLeave={handleUp}
      role="img"
      aria-label="领域概念关系图"
    >
      <defs>
        <marker id="dmg-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill={RELATION_COLOR} />
        </marker>
      </defs>
      {layoutEdges.map((e, i) => {
        const from = posMap.get(e.from)
        const to = posMap.get(e.to)
        if (!from || !to) return null
        const fromOv = dragOverride.get(e.from)
        const toOv = dragOverride.get(e.to)
        const fx = fromOv?.x ?? from.x
        const fy = fromOv?.y ?? from.y
        const tx = toOv?.x ?? to.x
        const ty = toOv?.y ?? to.y
        const r = 20
        const samePairIdx = edgePairIndex(e.from, e.to)
        const { path, midX, midY } = curvePath(fx, fy, tx, ty, r, samePairIdx)
        const rel = edges.find(re => re.source === e.from && re.target === e.to) || edges.find(re => re.source === e.from && re.target === e.to)
        return (
          <g key={i}>
            <path d={path} fill="none" stroke={RELATION_COLOR} strokeWidth={2} markerEnd="url(#dmg-arrow)" opacity={0.85} />
            {rel?.name && (
              <text x={midX} y={midY} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="500" fill={RELATION_COLOR}
                className="pointer-events-none select-none"
                style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 3, strokeLinejoin: 'round' }}>
                {rel.name}
              </text>
            )}
          </g>
        )
      })}
      {graphNodes.map(n => {
        const p = posMap.get(n.id)
        if (!p) return null
        const ov = dragOverride.get(n.id)
        const nx = ov?.x ?? p.x
        const ny = ov?.y ?? p.y
        const isIsolated = isolatedSet.has(n.id)
        const r = 18
        return (
          <g key={n.id} transform={`translate(${nx},${ny})`} className="cursor-grab active:cursor-grabbing" onMouseDown={(ev) => handleDown(ev, n.id)}>
            {isIsolated && <circle r={r + 5} fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.5" strokeDasharray="3,3" />}
            <circle r={r} fill={isIsolated ? '#fef3c7' : RELATION_COLOR} stroke={isIsolated ? '#f59e0b' : RELATION_COLOR} strokeWidth={1.5} />
            <text y={r + 12} textAnchor="middle" fontSize="11" fontWeight="500" className="pointer-events-none select-none" style={{ fill: 'var(--foreground)' }}>{n.label}</text>
            <text y={r + 24} textAnchor="middle" fontSize="8" fill="#94a3b8" className="pointer-events-none select-none">{n.id}</text>
          </g>
        )
      })}
    </svg>
  )

  // 缩放控件栏（普通视图与全屏共用）；zoom 按钮用内联 onClick 读 ref（规则允许）
  const renderControls = (isFullscreen: boolean) => (
    <div className="flex items-center gap-2">
      <select value={layoutKind} onChange={(e) => setLayoutKind(e.target.value as LayoutKind)}
        className="h-8 rounded-md border bg-background px-2 text-xs text-foreground" aria-label="切换布局">
        <option value="hierarchy">{layoutLabel('hierarchy')}</option>
        <option value="force">{layoutLabel('force')}</option>
        <option value="radial">{layoutLabel('radial')}</option>
      </select>
      <Button size="sm" variant="outline" onClick={() => transformRef.current?.zoomOut()} aria-label="缩小"><ZoomOut className="size-3.5" /></Button>
      <Button size="sm" variant="outline" onClick={() => transformRef.current?.zoomIn()} aria-label="放大"><ZoomIn className="size-3.5" /></Button>
      <Button size="sm" variant="outline" onClick={() => transformRef.current?.resetTransform()} aria-label="重置"><span className="text-[10px]">100%</span></Button>
      {isFullscreen ? (
        <Button size="sm" variant="outline" onClick={() => { setFullscreen(false); transformRef.current?.resetTransform() }} aria-label="退出全屏"><X className="size-3.5" /> 退出全屏</Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setFullscreen(true)} aria-label="全屏"><Maximize2 className="size-3.5" /></Button>
      )}
    </div>
  )

  // TransformWrapper 包裹 SVG，提供画布式 pan/zoom
  const renderCanvas = (heightClass: string) => (
    <TransformWrapper
      ref={transformRef}
      minScale={0.2}
      maxScale={4}
      centerOnInit
      limitToBounds={false}
      panning={{ excluded: ['input', 'select', 'text'] }}
    >
      <TransformComponent
        wrapperClass={cn('!w-full !h-full', heightClass)}
        contentClass="!w-full !h-full"
      >
        {graphSvg}
      </TransformComponent>
    </TransformWrapper>
  )

  const statsBadge = (
    <div className="pointer-events-none absolute bottom-2 right-3 rounded-md bg-white/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur dark:bg-slate-900/80">
      {graphNodes.length} 节点 · {layoutEdges.length} 边
    </div>
  )

  // ---- 裸模式：不套 SectionCard，画布直接铺满父容器 ----
  if (bare) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-end gap-2">
          {renderControls(false)}
        </div>
        {isolatedSet.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>孤立节点（无关系连接）：{Array.from(isolatedSet).join('、')}</span>
          </div>
        )}
        {/* 全屏覆盖层 —— portal 到 body，避免被 transform containing block 困住 */}
        {fullscreen && createPortal(
          <div className="fixed inset-0 z-[100] flex flex-col gap-2 bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{title}</span>
              {renderControls(true)}
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-900/30">
              {renderCanvas('!h-full')}
              {statsBadge}
            </div>
          </div>,
          document.body,
        )}
        {/* 普通视图（全屏时不渲染，避免两个 TransformWrapper 共用同一 ref 冲突） */}
        {!fullscreen && (
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-900/30">
            {renderCanvas('!h-full')}
            {statsBadge}
          </div>
        )}
      </div>
    )
  }

  // ---- 标准模式：套 SectionCard ----
  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><Share2 className="size-4 text-primary" />{title}</span>}
      description={`${nodes.length} 概念 · ${layoutEdges.length} 关系${isolatedSet.size > 0 ? ` · ${isolatedSet.size} 孤立` : ''} · 拖动空白处平移，滚轮缩放`}
      action={renderControls(false)}
    >
      {isolatedSet.size > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>孤立节点（无关系连接）：{Array.from(isolatedSet).join('、')}</span>
        </div>
      )}
      {/* 全屏覆盖层 —— portal 到 body，避免被 Dialog 的 transform containing block 困住 */}
      {fullscreen && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col gap-2 bg-background p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{title}</span>
            {renderControls(true)}
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-900/30">
            {renderCanvas('!h-full')}
            {statsBadge}
          </div>
        </div>,
        document.body,
      )}
      {/* 普通视图（全屏时不渲染，避免两个 TransformWrapper 共用同一 ref 冲突） */}
      {!fullscreen && (
        <div className="relative h-[480px] min-w-0 overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-900/30">
          {renderCanvas('!h-[480px]')}
          {statsBadge}
        </div>
      )}
    </SectionCard>
  )
}
