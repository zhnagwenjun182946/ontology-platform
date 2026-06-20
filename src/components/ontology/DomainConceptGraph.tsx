'use client'

/**
 * 单领域概念关系图（可复用）。
 *
 * 与 OntologyGraph（全局所有概念）不同：这里只画「一个领域」的 concepts + relations，
 * 用于：
 *   - 建库审核页（AutoBuildWizard Step3）：提交前预览候选领域长什么样、有无孤立节点
 *   - 领域管理卡片「查看图谱」：看单个已建领域的概念关系图
 *
 * 输入是领域概念的轻量描述（localName/labelZh）+ 关系列表（source/target/type/name），
 * 不依赖 DB，调用方传入数据即可，因此候选态（未入库）也能用。
 */
import * as React from 'react'
import { ZoomIn, ZoomOut, Maximize2, Share2, AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  computeLayout, layoutLabel, curvePath, type LayoutKind, type LayoutNode, type LayoutEdge,
} from './layout'
import { SectionCard, EmptyState } from './primitives'

export interface DomainGraphNode {
  localName: string
  labelZh: string
  /** 映射到的核心概念（如有），用于标注 */
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
  /** 候选态可传入，用于高亮/校验提示 */
  isolatedWarning?: string[]
}

const VIEW_W = 1100
const VIEW_H = 720

const RELATION_COLOR = '#10b981'

function buildGraph(nodes: DomainGraphNode[], edges: DomainGraphEdge[]) {
  const graphNodes: LayoutNode[] = nodes.map(n => ({
    id: n.localName,
    label: n.labelZh,
  }))
  const layoutEdges: LayoutEdge[] = edges
    .filter(e => nodes.some(n => n.localName === e.source) && nodes.some(n => n.localName === e.target))
    .map(e => ({ from: e.source, to: e.target }))

  // 孤立节点（无任何边连接）—— 用于高亮
  const connected = new Set<string>()
  for (const e of layoutEdges) { connected.add(e.from); connected.add(e.to) }
  const isolated = nodes.map(n => n.localName).filter(id => !connected.has(id))

  return { graphNodes, layoutEdges, isolated }
}

export function DomainConceptGraph({ title = '领域关系图', nodes, edges, isolatedWarning }: DomainConceptGraphProps) {
  const [zoom, setZoom] = React.useState(1)
  const [layoutKind, setLayoutKind] = React.useState<LayoutKind>('hierarchy')
  const [dragOverride, setDragOverride] = React.useState<Map<string, { x: number; y: number }>>(new Map())
  const dragRef = React.useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const svgRef = React.useRef<SVGSVGElement | null>(null)

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
    return (
      <SectionCard title={<span className="flex items-center gap-2"><Share2 className="size-4 text-primary" />{title}</span>}>
        <EmptyState title="无概念" hint="该领域暂无概念" icon={Share2} />
      </SectionCard>
    )
  }

  // 按节点 id 索引同对边的序号（错开弯曲）
  const edgePairIndex = (from: string, to: string) =>
    layoutEdges.filter(e => (e.from === from && e.to === to) || (e.from === to && e.to === from))
      .indexOf(layoutEdges.find(e => (e.from === from && e.to === to) || (e.from === to && e.to === from))!)

  const isolatedSet = new Set([...isolated, ...(isolatedWarning ?? [])])

  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><Share2 className="size-4 text-primary" />{title}</span>}
      description={`${nodes.length} 概念 · ${layoutEdges.length} 关系${isolatedSet.size > 0 ? ` · ${isolatedSet.size} 孤立` : ''}`}
      action={
        <div className="flex items-center gap-2">
          <select
            value={layoutKind}
            onChange={(e) => setLayoutKind(e.target.value as LayoutKind)}
            className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
            aria-label="切换布局"
          >
            <option value="hierarchy">{layoutLabel('hierarchy')}</option>
            <option value="force">{layoutLabel('force')}</option>
            <option value="radial">{layoutLabel('radial')}</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} aria-label="缩小"><ZoomOut className="size-3.5" /></Button>
          <span className="w-10 text-center text-xs font-mono text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="outline" onClick={() => setZoom(z => Math.min(4, z + 0.2))} aria-label="放大"><ZoomIn className="size-3.5" /></Button>
          <Button size="sm" variant="outline" onClick={() => setZoom(1)} aria-label="重置"><Maximize2 className="size-3.5" /></Button>
        </div>
      }
    >
      {isolatedSet.size > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>孤立节点（无关系连接）：{Array.from(isolatedSet).join('、')}</span>
        </div>
      )}
      <div className="relative h-[480px] min-w-0 overflow-auto rounded-lg bg-gradient-to-br from-slate-50 to-white p-2 dark:from-slate-900/50 dark:to-slate-900/30 scrollbar-thin">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className={cn('h-[480px]', zoom === 1 && 'w-full')}
          style={zoom === 1 ? undefined : { width: VIEW_W * zoom, height: VIEW_H * zoom }}
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

          {/* 边 */}
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
                  <text
                    x={midX} y={midY} textAnchor="middle" dominantBaseline="middle"
                    fontSize="10" fontWeight="500" fill={RELATION_COLOR}
                    className="pointer-events-none select-none"
                    style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 3, strokeLinejoin: 'round' }}
                  >
                    {rel.name}
                  </text>
                )}
              </g>
            )
          })}

          {/* 节点 */}
          {graphNodes.map(n => {
            const p = posMap.get(n.id)
            if (!p) return null
            const ov = dragOverride.get(n.id)
            const nx = ov?.x ?? p.x
            const ny = ov?.y ?? p.y
            const isIsolated = isolatedSet.has(n.id)
            const r = 18
            return (
              <g
                key={n.id}
                transform={`translate(${nx},${ny})`}
                className="cursor-grab active:cursor-grabbing"
                onMouseDown={(ev) => handleDown(ev, n.id)}
              >
                {isIsolated && (
                  <circle r={r + 5} fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.5" strokeDasharray="3,3" />
                )}
                <circle r={r} fill={isIsolated ? '#fef3c7' : RELATION_COLOR} stroke={isIsolated ? '#f59e0b' : RELATION_COLOR} strokeWidth={1.5} />
                <text
                  y={r + 12} textAnchor="middle" fontSize="11" fontWeight="500"
                  className="pointer-events-none select-none" style={{ fill: 'var(--foreground)' }}
                >
                  {n.label}
                </text>
                <text
                  y={r + 24} textAnchor="middle" fontSize="8" fill="#94a3b8"
                  className="pointer-events-none select-none"
                >
                  {n.id}
                </text>
              </g>
            )
          })}
        </svg>

        <div className="pointer-events-none absolute bottom-2 right-3 rounded-md bg-white/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur dark:bg-slate-900/80">
          {graphNodes.length} 节点 · {layoutEdges.length} 边
        </div>
      </div>
    </SectionCard>
  )
}
