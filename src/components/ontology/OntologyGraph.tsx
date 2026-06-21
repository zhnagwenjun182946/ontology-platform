'use client'

import * as React from 'react'
import { Share2, ZoomIn, ZoomOut, Maximize2, Info, X } from 'lucide-react'
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { useFetch } from './hooks'
import {
  domainColor, domainHex, EQUIV_LABEL, statusBadgeClass,
  parseJsonSchema, fieldTypeLabel,
} from './lib'
import {
  computeLayout, layoutLabel, curvePath, type LayoutKind, type LayoutNode, type LayoutEdge,
} from './layout'
import {
  LoadingState, ErrorState, EmptyState, PageHeader, SectionCard,
  ScopeBadge, StatusBadge,
} from './primitives'

interface ConceptLite {
  id: string
  uri: string
  labelZh: string
  labelEn?: string | null
  description?: string | null
  scope: string
  ownerDomain?: { id: string; code: string; nameZh: string; color?: string | null } | null
  jsonSchema?: string
}

interface AggCluster {
  clusterId: string
  representativeLabel: string
  representativeUri: string
  hasCore: boolean
  memberCount: number
  members: Array<{ id: string; uri: string; label: string; scope: string; domain: string | null; domainCode: string | null }>
}

interface AggMap {
  clusters: AggCluster[]
}

interface DomainDetail {
  id: string
  code: string
  nameZh: string
  color?: string | null
  concepts: Array<{ id: string; localName: string; linkedConceptId: string | null; concept?: ConceptLite | null }>
  relations: Array<{
    id: string
    name: string
    relationType: string
    cardinality: string
    sourceDomainConceptId: string
    targetDomainConceptId: string
  }>
}

interface GraphNode {
  id: string
  uri: string
  label: string
  labelEn?: string | null
  description?: string | null
  scope: string
  domainCode: string | null
  domainName: string | null
  jsonSchema?: string
  x: number
  y: number
  clusterId?: string
}

interface GraphEdge {
  from: string
  to: string
  type: 'equivalence' | 'relation'
  equivalenceType?: string
  status?: string
  relationName?: string
  relationType?: string
  cardinality?: string
}

const VIEW_W = 1100
const VIEW_H = 720
const CORE_RADIUS = 70
const DOMAIN_RADIUS = 280

function buildGraph(
  concepts: ConceptLite[],
  agg: AggMap | null,
  domains: DomainDetail[],
): { nodes: GraphNode[]; edges: GraphEdge[]; layoutNodes: LayoutNode[]; layoutEdges: LayoutEdge[] } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeIndex = new Map<string, GraphNode>()
  const layoutNodes: LayoutNode[] = []

  // 1) 核心概念
  const coreConcepts = concepts.filter(c => c.scope === 'CORE')
  coreConcepts.forEach((c) => {
    const node: GraphNode = {
      id: c.id, uri: c.uri, label: c.labelZh, labelEn: c.labelEn,
      description: c.description, scope: c.scope, jsonSchema: c.jsonSchema,
      domainCode: null, domainName: null, x: 0, y: 0,
    }
    nodes.push(node)
    nodeIndex.set(c.id, node)
    layoutNodes.push({ id: c.id, label: c.labelZh, group: 'CORE', isCenter: true })
  })

  // 2) 领域概念
  const domainConcepts = concepts.filter(c => c.scope === 'DOMAIN')
  domainConcepts.forEach((c) => {
    const code = c.ownerDomain?.code ?? 'unknown'
    const node: GraphNode = {
      id: c.id, uri: c.uri, label: c.labelZh, labelEn: c.labelEn,
      description: c.description, scope: c.scope, jsonSchema: c.jsonSchema,
      domainCode: code,
      domainName: c.ownerDomain?.nameZh ?? null,
      x: 0, y: 0,
    }
    nodes.push(node)
    nodeIndex.set(c.id, node)
    layoutNodes.push({ id: c.id, label: c.labelZh, group: code })
  })

  // 3) 等价关系 - 虚线
  if (agg) {
    for (const cluster of agg.clusters) {
      const memberIds = cluster.members.map(m => m.id)
      const core = cluster.members.find(m => m.scope === 'CORE')
      if (core) {
        for (const m of cluster.members) {
          if (m.id === core.id) continue
          if (!nodeIndex.has(m.id) || !nodeIndex.has(core.id)) continue
          edges.push({
            from: core.id, to: m.id, type: 'equivalence',
            equivalenceType: 'EXACT', status: 'CONFIRMED',
          })
        }
      } else if (memberIds.length > 1) {
        for (let i = 1; i < memberIds.length; i++) {
          if (!nodeIndex.has(memberIds[i]) || !nodeIndex.has(memberIds[i - 1])) continue
          edges.push({
            from: memberIds[i - 1], to: memberIds[i], type: 'equivalence',
            equivalenceType: 'RELATED', status: 'PROPOSED',
          })
        }
      }
    }
  }

  // 4) 领域内关系 - 实线箭头
  // 注意：commit 入库时 DomainRelation.sourceDomainConceptId / targetDomainConceptId
  // 存的是 Concept.id（即 DomainConcept.linkedConceptId），而图谱节点 id 也是 Concept.id，
  // 因此直接用关系的端点 id 查 nodeIndex 即可，无需通过 DomainConcept.id 中转。
  for (const dom of domains) {
    for (const rel of dom.relations) {
      const from = rel.sourceDomainConceptId
      const to = rel.targetDomainConceptId
      if (!nodeIndex.has(from) || !nodeIndex.has(to)) continue
      edges.push({
        from, to, type: 'relation',
        relationName: rel.name, relationType: rel.relationType, cardinality: rel.cardinality,
      })
    }
  }

  // 布局用的边（所有边都参与布局）
  const layoutEdges: LayoutEdge[] = edges.map(e => ({ from: e.from, to: e.to }))

  return { nodes, edges, layoutNodes, layoutEdges }
}

/** 应用布局算法，把坐标写回 nodes */
function applyLayout(nodes: GraphNode[], layoutNodes: LayoutNode[], layoutEdges: LayoutEdge[], kind: LayoutKind) {
  const positions = computeLayout(layoutNodes, layoutEdges, kind)
  const posMap = new Map(positions.map(p => [p.id, p]))
  for (const n of nodes) {
    const p = posMap.get(n.id)
    if (p) { n.x = p.x; n.y = p.y }
  }
}

export function OntologyGraph() {
  const conceptsResp = useFetch<ConceptLite[]>('/concepts?scope=all')
  const aggResp = useFetch<AggMap>('/aggregation/map')
  const domainsResp = useFetch<DomainDetail[]>('/domains')

  // 拉每个领域详情
  const domainList = domainsResp.data ?? []
  const [domainDetails, setDomainDetails] = React.useState<DomainDetail[]>([])
  React.useEffect(() => {
    let alive = true
    if (!domainList.length) return
    Promise.all(domainList.map(d => fetch(`/api/domains/${d.id}`).then(r => r.json())))
      .then((details: DomainDetail[]) => {
        if (alive) setDomainDetails(details)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [domainList])

  const loading = conceptsResp.loading || aggResp.loading || domainsResp.loading
  const error = conceptsResp.error || aggResp.error || domainsResp.error

  const [selected, setSelected] = React.useState<string | null>(null)
  const [layoutKind, setLayoutKind] = React.useState<LayoutKind>('hierarchy')
  const [fullscreen, setFullscreen] = React.useState(false)
  // 节点拖动
  const [dragOverride, setDragOverride] = React.useState<Map<string, { x: number; y: number }>>(new Map())
  const dragRef = React.useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const svgRef = React.useRef<SVGSVGElement | null>(null)
  const transformRef = React.useRef<ReactZoomPanPinchRef | null>(null)

  React.useEffect(() => {
    setDragOverride(new Map())
  }, [layoutKind])

  const graph = React.useMemo(() => {
    if (!conceptsResp.data) return { nodes: [], edges: [], layoutNodes: [], layoutEdges: [] }
    const g = buildGraph(conceptsResp.data, aggResp.data, domainDetails)
    applyLayout(g.nodes, g.layoutNodes, g.layoutEdges, layoutKind)
    return g
  }, [conceptsResp.data, aggResp.data, domainDetails, layoutKind])

  const toSvgCoords = React.useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }, [])

  const handleNodeMouseDown = React.useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    e.preventDefault()
    const node = graph.nodes.find(n => n.id === nodeId)
    if (!node) return
    const pos = toSvgCoords(e.clientX, e.clientY)
    dragRef.current = { id: nodeId, offsetX: pos.x - node.x, offsetY: pos.y - node.y }
  }, [graph.nodes, toSvgCoords])

  const handleMouseMove = React.useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return
    const pos = toSvgCoords(e.clientX, e.clientY)
    const { id, offsetX, offsetY } = dragRef.current
    setDragOverride(prev => {
      const next = new Map(prev)
      next.set(id, { x: pos.x - offsetX, y: pos.y - offsetY })
      return next
    })
  }, [toSvgCoords])

  const handleMouseUp = React.useCallback(() => {
    dragRef.current = null
  }, [])

  if (loading) return <LoadingState label="加载本体图谱…" />
  if (error || !conceptsResp.data) return <ErrorState message={error || '加载失败'} onRetry={conceptsResp.refetch} />

  const selectedNode = selected ? graph.nodes.find(n => n.id === selected) : null
  const selectedEdges = selected
    ? graph.edges.filter(e => e.from === selected || e.to === selected)
    : []

  // SVG 图谱元素（提取为变量，普通视图与全屏覆盖层共用，避免重复）
  const graphSvg = (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="select-none"
      style={{ minWidth: VIEW_W, minHeight: VIEW_H }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      role="img"
      aria-label="本体关系图谱"
    >
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="#10b981" />
        </marker>
        <marker id="arrow-muted" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* 边 */}
      {graph.edges.map((e, i) => {
        const from = graph.nodes.find(n => n.id === e.from)
        const to = graph.nodes.find(n => n.id === e.to)
        if (!from || !to) return null
        const fromOv = dragOverride.get(e.from)
        const toOv = dragOverride.get(e.to)
        const fx = fromOv?.x ?? from.x
        const fy = fromOv?.y ?? from.y
        const tx = toOv?.x ?? to.x
        const ty = toOv?.y ?? to.y
        const isEq = e.type === 'equivalence'
        const isPending = e.status === 'PROPOSED'
        const stroke = isEq ? (isPending ? '#a855f7' : '#64748b') : domainHex(from.domainCode)
        const samePairIdx = graph.edges.filter(e2 =>
          (e2.from === e.from && e2.to === e.to) || (e2.from === e.to && e2.to === e.from)
        ).indexOf(e)
        const r = 20
        const { path, midX, midY } = curvePath(fx, fy, tx, ty, r, samePairIdx)
        return (
          <g key={i}>
            <path
              d={path}
              fill="none"
              stroke={stroke}
              strokeWidth={isEq ? 1.5 : 2}
              strokeDasharray={isEq ? '5,4' : undefined}
              markerEnd={isEq ? undefined : 'url(#arrow)'}
              opacity={isEq ? 0.6 : 0.85}
            />
            {!isEq && e.relationName && (
              <text
                x={midX} y={midY} textAnchor="middle" dominantBaseline="middle"
                fontSize="10" fontWeight="500" fill={stroke}
                className="pointer-events-none select-none"
                style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 3, strokeLinejoin: 'round' }}
              >
                {e.relationName}
              </text>
            )}
            {isEq && (
              <text
                x={midX} y={midY} textAnchor="middle" dominantBaseline="middle"
                fontSize="9" fill={stroke}
                className="pointer-events-none select-none"
                style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 3, strokeLinejoin: 'round' }}
              >
                等价
              </text>
            )}
          </g>
        )
      })}

      {/* 节点 */}
      {graph.nodes.map(n => {
        const isCore = n.scope === 'CORE'
        const hex = isCore ? '#0f172a' : domainHex(n.domainCode)
        const isSelected = n.id === selected
        const r = isCore ? 22 : 18
        const ov = dragOverride.get(n.id)
        const nx = ov?.x ?? n.x
        const ny = ov?.y ?? n.y
        return (
          <g
            key={n.id}
            transform={`translate(${nx},${ny})`}
            className="cursor-grab active:cursor-grabbing transition-all"
            onMouseDown={(ev) => handleNodeMouseDown(ev, n.id)}
            onClick={() => setSelected(n.id)}
          >
            {isSelected && (
              <circle r={r + 6} fill="none" stroke={hex} strokeWidth="1.5" opacity="0.4" strokeDasharray="2,2" />
            )}
            <circle r={r} fill={isCore ? 'white' : hex} stroke={hex} strokeWidth={isCore ? 2.5 : 1.5} className="transition-all" />
            <text
              y={r + 12} textAnchor="middle" fontSize="11" fontWeight="500"
              className="pointer-events-none select-none"
              style={{ fill: 'var(--foreground)' }}
            >
              {n.label}
            </text>
            {!isCore && n.domainCode && (
              <text y={r + 24} textAnchor="middle" fontSize="8" fill="#94a3b8" className="pointer-events-none select-none">
                {n.domainCode}
              </text>
            )}
            {isCore && (
              <text textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill={hex}>CORE</text>
            )}
          </g>
        )
      })}
    </svg>
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="本体图谱"
        icon={Share2}
        description="核心概念居中，领域概念按域分组。虚线表示相同概念，实线箭头表示包含或引用关系。"
        actions={
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
            <Button size="sm" variant="outline" onClick={() => transformRef.current?.zoomOut()} aria-label="缩小">
              <ZoomOut className="size-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => transformRef.current?.zoomIn()} aria-label="放大">
              <ZoomIn className="size-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => transformRef.current?.resetTransform()} aria-label="重置">
              <span className="text-[10px]">100%</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFullscreen(true)} aria-label="全屏">
              <Maximize2 className="size-3.5" />
            </Button>
          </div>
        }
      />

      {/* 图例 */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-xs">
        <span className="font-medium text-foreground">图例：</span>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full border-2 border-slate-900 bg-white dark:border-white dark:bg-slate-800" />
          <span className="text-muted-foreground">核心概念</span>
        </div>
        {domainList.map(d => {
          const c = domainColor(d.code)
          return (
            <div key={d.id} className="flex items-center gap-1.5">
              <span className={cn('size-3 rounded-full', c.dot)} />
              <span className="text-muted-foreground">{d.nameZh}</span>
            </div>
          )
        })}
        <span className="mx-2 h-3 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#64748b" strokeWidth="2" strokeDasharray="3,3" /></svg>
          <span className="text-muted-foreground">等价关系（虚线）</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrow)" /></svg>
          <span className="text-muted-foreground">包含/引用（实线箭头）</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* SVG 图谱 */}
        <SectionCard bodyClassName="p-2 sm:p-3">
          {/* 全屏覆盖层 */}
          {fullscreen && (
            <div className="fixed inset-0 z-50 flex flex-col gap-2 bg-background p-4">
              <div className="flex items-center justify-between gap-2">
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
                </div>
                <Button size="sm" variant="outline" onClick={() => { setFullscreen(false); transformRef.current?.resetTransform() }} aria-label="退出全屏">
                  <X className="size-3.5" /> 退出全屏
                </Button>
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-900/30">
                <TransformWrapper ref={transformRef} minScale={0.2} maxScale={4} centerOnInit limitToBounds={false}>
                  <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full">
                    {graphSvg}
                  </TransformComponent>
                </TransformWrapper>
                <div className="pointer-events-none absolute bottom-2 right-3 rounded-md bg-white/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur dark:bg-slate-900/80">
                  {graph.nodes.length} 节点 · {graph.edges.length} 边
                </div>
              </div>
            </div>
          )}
          <div className="relative h-[640px] min-w-0 overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-900/30">
            <TransformWrapper ref={transformRef} minScale={0.2} maxScale={4} centerOnInit limitToBounds={false}>
              <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full">
                {graphSvg}
              </TransformComponent>
            </TransformWrapper>
            {/* 节点数统计 */}
            <div className="pointer-events-none absolute bottom-2 right-3 rounded-md bg-white/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur dark:bg-slate-900/80">
              {graph.nodes.length} 节点 · {graph.edges.length} 边
            </div>
          </div>
        </SectionCard>

        {/* 节点详情 */}
        <SectionCard
          title="节点详情"
          description={selectedNode ? selectedNode.uri : '点击节点查看'}
          action={<Info className="size-4 text-muted-foreground" />}
        >
          {!selectedNode ? (
            <EmptyState
              title="未选择节点"
              hint="点击图谱节点查看其等价关系与引用关系"
              icon={Info}
            />
          ) : (
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex items-center gap-2">
                <ScopeBadge scope={selectedNode.scope} />
                {selectedNode.domainName && (
                  <Badge variant="outline" className={cn('border-0', domainColor(selectedNode.domainCode).bg, domainColor(selectedNode.domainCode).text)}>
                    {selectedNode.domainName}
                  </Badge>
                )}
              </div>

              {/* 概念名称 */}
              <div className="rounded-md bg-muted/40 p-2.5">
                <div className="text-[10px] text-muted-foreground">概念名称</div>
                <div className="font-medium text-foreground">{selectedNode.label}</div>
                {selectedNode.labelEn && (
                  <code className="font-mono text-[10px] text-muted-foreground">{selectedNode.labelEn}</code>
                )}
              </div>

              {/* 描述 */}
              {selectedNode.description && (
                <div className="rounded-md bg-muted/40 p-2.5">
                  <div className="text-[10px] text-muted-foreground">描述</div>
                  <div className="text-foreground">{selectedNode.description}</div>
                </div>
              )}

              <div className="rounded-md bg-muted/40 p-2.5">
                <div className="text-[10px] text-muted-foreground">URI</div>
                <code className="font-mono text-foreground">{selectedNode.uri}</code>
              </div>

              {/* 字段属性 */}
              {(() => {
                const fields = parseJsonSchema(selectedNode.jsonSchema)
                if (fields.length === 0) return null
                return (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[11px] font-medium text-muted-foreground">字段属性 ({fields.length})</div>
                    <div className="overflow-hidden rounded-md border">
                      <table className="w-full text-[10px]">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-2 py-1 text-left font-medium text-muted-foreground">字段</th>
                            <th className="px-2 py-1 text-left font-medium text-muted-foreground">类型</th>
                            <th className="px-2 py-1 text-left font-medium text-muted-foreground">必填</th>
                            <th className="px-2 py-1 text-left font-medium text-muted-foreground">说明</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fields.map((f, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-2 py-1 font-mono text-foreground">{f.name}</td>
                              <td className="px-2 py-1 font-mono text-muted-foreground">{fieldTypeLabel(f)}</td>
                              <td className="px-2 py-1">{f.required ? <span className="text-rose-500">是</span> : <span className="text-muted-foreground">否</span>}</td>
                              <td className="px-2 py-1 text-muted-foreground">{f.label || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}

              <div className="flex flex-col gap-1.5">
                <div className="text-[11px] font-medium text-muted-foreground">关联边 ({selectedEdges.length})</div>
                {selectedEdges.length === 0 ? (
                  <div className="rounded-md border border-dashed p-2 text-center text-muted-foreground">无关联</div>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {selectedEdges.map((e, i) => {
                      const otherId = e.from === selectedNode.id ? e.to : e.from
                      const other = graph.nodes.find(n => n.id === otherId)
                      return (
                        <li key={i} className="flex items-center gap-1.5 rounded-md border p-2">
                          <span className={cn('size-1.5 rounded-full', e.type === 'equivalence' ? 'bg-violet-500' : 'bg-emerald-500')} />
                          {e.type === 'equivalence' ? (
                            <>
                              <Badge variant="outline" className="text-[10px]">等价</Badge>
                              {e.status && <Badge variant="outline" className={cn('text-[10px] border-0', statusBadgeClass(e.status))}>{e.status}</Badge>}
                            </>
                          ) : (
                            <>
                              <Badge variant="outline" className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                                {e.relationName}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">{e.cardinality}</span>
                            </>
                          )}
                          <button
                            type="button"
                            className="ml-auto truncate font-mono text-[10px] text-primary hover:underline"
                            onClick={() => setSelected(otherId)}
                          >
                            → {other?.label}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
