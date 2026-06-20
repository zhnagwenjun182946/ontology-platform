'use client'

import * as React from 'react'
import { Share2, ZoomIn, ZoomOut, Maximize2, Info } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { useFetch } from './hooks'
import {
  domainColor, domainHex, EQUIV_LABEL, statusBadgeClass,
} from './lib'
import {
  LoadingState, ErrorState, EmptyState, PageHeader, SectionCard,
  ScopeBadge, StatusBadge,
} from './primitives'

interface ConceptLite {
  id: string
  uri: string
  labelZh: string
  scope: string
  ownerDomain?: { id: string; code: string; nameZh: string; color?: string | null } | null
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
  scope: string
  domainCode: string | null
  domainName: string | null
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
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeIndex = new Map<string, GraphNode>()

  // 1) 核心概念 - 居中圆环
  const coreConcepts = concepts.filter(c => c.scope === 'CORE')
  const coreCenter = { x: VIEW_W / 2, y: VIEW_H / 2 }
  coreConcepts.forEach((c, i) => {
    const angle = (i / Math.max(coreConcepts.length, 1)) * Math.PI * 2 - Math.PI / 2
    const x = coreCenter.x + Math.cos(angle) * CORE_RADIUS
    const y = coreCenter.y + Math.sin(angle) * CORE_RADIUS
    const node: GraphNode = {
      id: c.id, uri: c.uri, label: c.labelZh, scope: c.scope,
      domainCode: null, domainName: null, x, y,
    }
    nodes.push(node)
    nodeIndex.set(c.id, node)
  })

  // 2) 领域概念 - 按领域扇区排布
  const domainConcepts = concepts.filter(c => c.scope === 'DOMAIN')
  const domainsWithConcepts = new Map<string, ConceptLite[]>()
  for (const c of domainConcepts) {
    const code = c.ownerDomain?.code ?? 'unknown'
    if (!domainsWithConcepts.has(code)) domainsWithConcepts.set(code, [])
    domainsWithConcepts.get(code)!.push(c)
  }

  const domainList = Array.from(domainsWithConcepts.entries())
  domainList.forEach(([code, list], domainIdx) => {
    const totalDomains = Math.max(domainList.length, 1)
    // 领域基线角度：均分整圆，留出顶部
    const baseAngle = (domainIdx / totalDomains) * Math.PI * 2 - Math.PI / 2
    const sectorSpan = (Math.PI * 2) / totalDomains * 0.7 // 占该扇区 70%

    list.forEach((c, i) => {
      const n = Math.max(list.length, 1)
      // 在扇区内做小角度展开 + 小半径抖动
      const subAngle = baseAngle + (i - (n - 1) / 2) * (sectorSpan / Math.max(n, 1))
      const r = DOMAIN_RADIUS + ((i % 3) - 1) * 30
      const x = coreCenter.x + Math.cos(subAngle) * r
      const y = coreCenter.y + Math.sin(subAngle) * r
      const node: GraphNode = {
        id: c.id, uri: c.uri, label: c.labelZh, scope: c.scope,
        domainCode: code,
        domainName: c.ownerDomain?.nameZh ?? null,
        x, y,
      }
      nodes.push(node)
      nodeIndex.set(c.id, node)
    })
  })

  // 3) 等价关系 - 虚线
  if (agg) {
    for (const cluster of agg.clusters) {
      const memberIds = cluster.members.map(m => m.id)
      // 簇内成员两两相连（但只画 1 跳到核心，避免太密）
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
        // 无核心的簇：连成链
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

  return { nodes, edges }
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
  const [zoom, setZoom] = React.useState(1)

  const graph = React.useMemo(() => {
    if (!conceptsResp.data) return { nodes: [], edges: [] }
    return buildGraph(conceptsResp.data, aggResp.data, domainDetails)
  }, [conceptsResp.data, aggResp.data, domainDetails])

  if (loading) return <LoadingState label="加载本体图谱…" />
  if (error || !conceptsResp.data) return <ErrorState message={error || '加载失败'} onRetry={conceptsResp.refetch} />

  const selectedNode = selected ? graph.nodes.find(n => n.id === selected) : null
  const selectedEdges = selected
    ? graph.edges.filter(e => e.from === selected || e.to === selected)
    : []

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="本体图谱"
        icon={Share2}
        description="核心概念居中，领域概念按域分组排布。虚线 = 等价关系，实线箭头 = 包含/引用关系。"
        actions={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} aria-label="缩小">
              <ZoomOut className="size-3.5" />
            </Button>
            <span className="w-12 text-center text-xs font-mono text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <Button size="sm" variant="outline" onClick={() => setZoom(z => Math.min(2, z + 0.1))} aria-label="放大">
              <ZoomIn className="size-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setZoom(1)} aria-label="重置">
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

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* SVG 图谱 */}
        <SectionCard bodyClassName="p-2 sm:p-3">
          <div className="relative overflow-auto rounded-lg bg-gradient-to-br from-slate-50 to-white p-2 dark:from-slate-900/50 dark:to-slate-900/30 scrollbar-thin">
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="h-[640px] w-full"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
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
                const isEq = e.type === 'equivalence'
                const isPending = e.status === 'PROPOSED'
                const stroke = isEq ? (isPending ? '#a855f7' : '#64748b') : domainHex(from.domainCode)
                return (
                  <line
                    key={i}
                    x1={from.x} y1={from.y}
                    x2={to.x} y2={to.y}
                    stroke={stroke}
                    strokeWidth={isEq ? 1.5 : 2}
                    strokeDasharray={isEq ? '5,4' : undefined}
                    markerEnd={isEq ? undefined : 'url(#arrow)'}
                    opacity={isEq ? 0.6 : 0.85}
                  />
                )
              })}

              {/* 节点 */}
              {graph.nodes.map(n => {
                const isCore = n.scope === 'CORE'
                const hex = isCore ? '#0f172a' : domainHex(n.domainCode)
                const isSelected = n.id === selected
                const r = isCore ? 22 : 18
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x},${n.y})`}
                    className="cursor-pointer transition-all"
                    onClick={() => setSelected(n.id)}
                  >
                    {isSelected && (
                      <circle r={r + 6} fill="none" stroke={hex} strokeWidth="1.5" opacity="0.4" strokeDasharray="2,2" />
                    )}
                    <circle
                      r={r}
                      fill={isCore ? 'white' : hex}
                      stroke={hex}
                      strokeWidth={isCore ? 2.5 : 1.5}
                      className="transition-all"
                    />
                    <text
                      y={r + 12}
                      textAnchor="middle"
                      className="pointer-events-none select-none"
                      fontSize="11"
                      fontWeight="500"
                      fill="currentColor"
                      style={{ fill: 'var(--foreground)' }}
                    >
                      {n.label}
                    </text>
                    {isCore && (
                      <text
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="9"
                        fontWeight="700"
                        fill={hex}
                      >CORE</text>
                    )}
                  </g>
                )
              })}
            </svg>

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
              <div className="rounded-md bg-muted/40 p-2.5">
                <div className="text-[10px] text-muted-foreground">URI</div>
                <code className="font-mono text-foreground">{selectedNode.uri}</code>
              </div>

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
