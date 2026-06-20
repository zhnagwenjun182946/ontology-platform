'use client'

import * as React from 'react'
import { ZoomIn, ZoomOut, Maximize2, AlertTriangle, Boxes, Info } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { useFetch } from './hooks'
import {
  domainColor, domainHex, parseJsonSchema, prettyJson,
  severityStyle, fieldTypeLabel, type FieldDef,
} from './lib'
import {
  computeLayout, layoutLabel, curvePath, type LayoutKind, type LayoutNode, type LayoutEdge,
} from './layout'
import {
  EmptyState, ScopeBadge, SeverityBadge,
} from './primitives'

// ============ 类型定义 ============

export interface InstanceExtracted {
  id: string
  conceptLabel?: string | null
  // jsonPayload 可能是对象（POST 返回时已 parse）或字符串（GET 详情时未 parse）
  jsonPayload: any
}

export interface InstanceFinding {
  id?: string
  ruleCode?: string | null
  severity: string
  targetPath?: string | null
  message: string
  contextJson?: string
}

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

interface DomainRelationLite {
  name: string
  relationType: string
  cardinality: string
  sourceDomainConceptId: string
  targetDomainConceptId: string
}

interface DomainDetail {
  id: string
  code: string
  concepts: Array<{ id: string; localName: string; linkedConceptId: string | null }>
  relations: DomainRelationLite[]
}

// ============ 图模型 ============

interface GraphNode {
  id: string                 // ExtractedObject.id
  conceptLabel: string
  label: string              // 可读标识
  subLabel?: string          // 次要标识（如工号、金额）
  conceptId?: string | null  // 对应 Concept.id
  scope: string
  domainCode: string | null
  domainName: string | null
  modelDescription?: string | null
  fields: FieldDef[]
  payload: any
  x: number
  y: number
  violations: InstanceFinding[]
}

interface GraphEdge {
  from: string
  to: string
  label?: string
  relationType?: string
}

// ============ 布局常量 ============

const VIEW_W = 1100
const VIEW_H = 720
const CLUSTER_RADIUS = 240   // 簇中心到画布中心的距离
const INSTANCE_GAP = 46      // 同簇内实例间距

// ============ 工具：从实例 payload 取可读标识 ============

// 每种概念的"自身业务标识"字段优先级（不含嵌套 ref 的 name，避免关联人名污染）
const LABEL_FIELDS: Record<string, string[]> = {
  Employee: ['name', 'id'],
  Loan: ['loanId'],
  TravelRequest: ['id'],
  ExpenseReport: ['id'],
  ProcurementRequest: ['id'],
  Supplier: ['name', 'id'],
  Buyer: ['name', 'id'],
  CostCenter: ['name', 'id'],
}

function pickInstanceLabel(label: string, conceptLabelZh: string | undefined, payload: any, index: number): { label: string; subLabel?: string } {
  if (!payload || typeof payload !== 'object') {
    return { label: `${conceptLabelZh || label}#${index + 1}` }
  }

  // 按概念类型的字段优先级取自身标识
  const fields = LABEL_FIELDS[label]
  if (fields) {
    for (const f of fields) {
      const v = payload[f]
      if (v != null && v !== '') {
        // 主标识：若是 name（人名），直接用；若是编号类，加概念中文名前缀更可读
        const isName = f === 'name'
        const main = isName ? String(v) : `${conceptLabelZh || label} ${v}`
        const sub = fields.find(f2 => f2 !== f && payload[f2] != null && payload[f2] !== '')
        return { label: main, subLabel: sub ? String(payload[sub]) : undefined }
      }
    }
  }

  // 通用：顶层 name（人名直接用）
  if (payload.name && typeof payload.name === 'string') {
    return { label: payload.name, subLabel: payload.id ? String(payload.id) : undefined }
  }

  // 无明确标识：用 type + amount 等业务字段组合（适合 ExpenseItem）
  if (payload.type && payload.amount != null) {
    return { label: `${payload.type}¥${payload.amount}`, subLabel: conceptLabelZh || label }
  }
  if (payload.type) {
    return { label: payload.type, subLabel: conceptLabelZh || label }
  }

  // 最终 fallback：概念中文名 + 序号
  return { label: `${conceptLabelZh || label}#${index + 1}` }
}

// 取实例的"业务主键值集合"，用于 ref 字段值匹配
function instanceKeyValues(payload: any): string[] {
  if (!payload || typeof payload !== 'object') return []
  const vals: string[] = []
  for (const k of ['id', 'loanId', 'number', 'code', 'name']) {
    const v = payload[k]
    if (v != null) vals.push(String(v))
  }
  return vals
}

// 深度收集 payload 里所有"看起来像引用"的标量值（字符串/数字），
// 用于和其它实例的主键做匹配
function collectRefValues(payload: any, prefix = ''): Array<{ field: string; value: string }> {
  const out: Array<{ field: string; value: string }> = []
  if (!payload || typeof payload !== 'object') return out
  for (const [k, v] of Object.entries(payload)) {
    if (v == null) continue
    if (typeof v === 'object' && !Array.isArray(v)) {
      // 嵌套对象：递归，但只取其 id/name 等主键作为引用值
      const nested = v as any
      for (const nk of ['id', 'loanId', 'number', 'code']) {
        if (nested[nk] != null) {
          out.push({ field: `${prefix}${k}.${nk}`, value: String(nested[nk]) })
        }
      }
    } else if (typeof v === 'string' || typeof v === 'number') {
      // 顶层标量：可能本身就是引用（如 applicant、borrower 等若 LLM 抽成纯 id）
      out.push({ field: `${prefix}${k}`, value: String(v) })
    }
  }
  return out
}

// ============ 概念元信息匹配 ============

function buildConceptIndex(concepts: ConceptLite[]) {
  // labelZh / labelEn → Concept
  const byLabel = new Map<string, ConceptLite>()
  // Concept.id → Concept
  const byId = new Map<string, ConceptLite>()
  for (const c of concepts) {
    byId.set(c.id, c)
    if (c.labelZh) byLabel.set(c.labelZh, c)
    if (c.labelEn) byLabel.set(c.labelEn, c)
  }
  return { byLabel, byId }
}

function lookupConcept(
  conceptLabel: string,
  idx: { byLabel: Map<string, ConceptLite>; byId: Map<string, ConceptLite> },
): ConceptLite | undefined {
  // 精确匹配 labelZh/labelEn
  return idx.byLabel.get(conceptLabel)
}

// ============ 违规映射：findings → 节点 ============

function mapFindingsToNodes(
  nodes: GraphNode[],
  findings: InstanceFinding[],
): { globalFindings: InstanceFinding[] } {
  const globalFindings: InstanceFinding[] = []

  // 按 conceptLabel 分组，组内保持顺序（对应 lines[N] / items[N]）
  const byLabel = new Map<string, GraphNode[]>()
  for (const n of nodes) {
    if (!byLabel.has(n.conceptLabel)) byLabel.set(n.conceptLabel, [])
    byLabel.get(n.conceptLabel)!.push(n)
  }

  // 主单据节点候选（Loan/ExpenseReport/ProcurementRequest）
  const mainLabels = ['Loan', 'ExpenseReport', 'ProcurementRequest']
  const mainNodes = nodes.filter(n => mainLabels.includes(n.conceptLabel))

  for (const f of findings) {
    const tp = f.targetPath
    let matched = false

    if (tp) {
      // lines[N] / items[N] 形式
      const m = tp.match(/^(lines|items)\[(\d+)\]$/)
      if (m) {
        const groupLabel = m[1] === 'lines' ? 'ExpenseItem' : 'ProcurementItem'
        const idx = parseInt(m[2], 10)
        const group = byLabel.get(groupLabel) || []
        if (idx < group.length) {
          // contextJson 内容比对兜底：若 contextJson 与某节点 payload 序列化一致，优先用它
          let target = group[idx]
          if (f.contextJson && f.contextJson !== '{}') {
            const alt = group.find(n => {
              try { return JSON.stringify(n.payload) === f.contextJson } catch { return false }
            })
            if (alt) target = alt
          }
          target.violations.push(f)
          matched = true
        }
      } else {
        // DSL 原始 targetPath（如 loan / expenseReport / .field）：尝试匹配主单据节点
        const alt = mainNodes.find(n => tp.toLowerCase().includes(n.conceptLabel.toLowerCase()))
        if (alt) {
          alt.violations.push(f)
          matched = true
        }
      }
    }

    // contextJson 兜底：若 finding 带 context 且能匹配到某节点 payload
    if (!matched && f.contextJson && f.contextJson !== '{}') {
      for (const n of nodes) {
        try {
          if (JSON.stringify(n.payload) === f.contextJson) {
            n.violations.push(f)
            matched = true
            break
          }
        } catch { /* ignore */ }
      }
    }

    if (!matched) {
      // 主单据兜底：顶层规则 finding 挂到第一个主单据节点
      if (mainNodes.length > 0) {
        mainNodes[0].violations.push(f)
      } else {
        globalFindings.push(f)
      }
    }
  }

  return { globalFindings }
}

// ============ 关系推导：DomainRelation + payload ref ============

// 概念名归一化：去空格、统一大小写，解决 "Expense Item" vs "ExpenseItem" 不匹配
function normLabel(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

function buildEdges(
  nodes: GraphNode[],
  domainRelations: DomainRelationLite[],
  conceptById: Map<string, ConceptLite>,
  domainConcepts: Array<{ localName: string; linkedConceptId: string | null }>,
): { edges: GraphEdge[]; seen: Set<string> } {
  const edges: GraphEdge[] = []
  const seen = new Set<string>()

  // 1. 概念关系骨架：哪些 conceptLabel 对之间"允许"有关系
  // DomainRelation 端点是 Concept.id；用 labelEn/labelZh/localName 多路匹配并归一化
  const localNameToConceptId = new Map<string, string>()
  for (const dc of domainConcepts) {
    if (dc.linkedConceptId) localNameToConceptId.set(dc.localName, dc.linkedConceptId)
  }
  // conceptId → 归一化标签集合（labelEn / labelZh / localName 都算）
  const conceptIdToNormLabels = new Map<string, Set<string>>()
  for (const c of conceptById.values()) {
    const set = new Set<string>()
    if (c.labelEn) set.add(normLabel(c.labelEn))
    if (c.labelZh) set.add(normLabel(c.labelZh))
    conceptIdToNormLabels.set(c.id, set)
  }
  // localName 也并入（DomainConcept.localName 可能与 labelEn 不同）
  for (const [localName, cid] of localNameToConceptId) {
    conceptIdToNormLabels.get(cid)?.add(normLabel(localName))
  }

  // 允许的概念对（归一化后）：a=>b 与 b=>a 都加入（关系可双向匹配）
  const allowedPairs = new Set<string>()
  for (const rel of domainRelations) {
    const sSet = conceptIdToNormLabels.get(rel.sourceDomainConceptId)
    const tSet = conceptIdToNormLabels.get(rel.targetDomainConceptId)
    if (!sSet || !tSet) continue
    for (const s of sSet) for (const t of tSet) {
      allowedPairs.add(`${s}=>${t}`)
      allowedPairs.add(`${t}=>${s}`)
    }
  }

  // 2. 实例间连线：遍历每个实例的 ref 值，匹配其它实例的主键
  // 建主键索引：value → 节点列表
  const keyIndex = new Map<string, GraphNode[]>()
  for (const n of nodes) {
    for (const v of instanceKeyValues(n.payload)) {
      if (!keyIndex.has(v)) keyIndex.set(v, [])
      keyIndex.get(v)!.push(n)
    }
  }

  for (const src of nodes) {
    const refs = collectRefValues(src.payload)
    for (const r of refs) {
      const targets = keyIndex.get(r.value)
      if (!targets) continue
      for (const tgt of targets) {
        if (tgt.id === src.id) continue
        // 概念关系约束：归一化后匹配 allowedPairs；若无 allowedPairs 则放行
        const pairKey = `${normLabel(src.conceptLabel)}=>${normLabel(tgt.conceptLabel)}`
        const allowed = allowedPairs.size === 0 || allowedPairs.has(pairKey)
        if (!allowed) continue
        const edgeKey = `${src.id}->${tgt.id}:${r.field}`
        if (seen.has(edgeKey)) continue
        seen.add(edgeKey)
        edges.push({ from: src.id, to: tgt.id, label: r.field })
      }
    }
  }

  return { edges, seen }
}

// 明细行（ExpenseItem/ProcurementItem）自动挂到父单据：
// 因为 LLM 抽取时明细行通常不带 expenseReportId 等外键，
// 这里按"明细行 → 父单据"的归属关系补连线。
function attachDetailToParent(nodes: GraphNode[], edges: GraphEdge[], seen: Set<string>) {
  const detailLabels = ['ExpenseItem', 'ProcurementItem']
  const mainLabels = ['ExpenseReport', 'ProcurementRequest', 'Loan']
  const details = nodes.filter(n => detailLabels.includes(n.conceptLabel))
  const mains = nodes.filter(n => mainLabels.includes(n.conceptLabel))
  if (details.length === 0 || mains.length === 0) return
  // 默认挂到第一个主单据（一次运行通常只有一个主单据）
  const parent = mains[0]
  for (const d of details) {
    const key = `${d.id}->${parent.id}:归属`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push({ from: parent.id, to: d.id, label: '包含' })
  }
}

// ============ 主构建函数 ============

function buildInstanceGraph(
  extracted: InstanceExtracted[],
  findings: InstanceFinding[],
  concepts: ConceptLite[],
  domainDetail: DomainDetail | null,
): { nodes: GraphNode[]; edges: GraphEdge[]; globalFindings: InstanceFinding[]; layoutNodes: LayoutNode[]; layoutEdges: LayoutEdge[] } {
  const cidx = buildConceptIndex(concepts)
  const nodes: GraphNode[] = []
  const layoutNodes: LayoutNode[] = []

  // 按 conceptLabel 分组（保持 extracted 顺序）
  const groups = new Map<string, InstanceExtracted[]>()
  for (const e of extracted) {
    const label = e.conceptLabel || '未分类'
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(e)
  }

  const groupList = Array.from(groups.entries())

  groupList.forEach(([label, list]) => {
    list.forEach((e, i) => {
      const concept = lookupConcept(label, cidx)
      const { label: dispLabel, subLabel } = pickInstanceLabel(label, concept?.labelZh, e.jsonPayload, i)
      nodes.push({
        id: e.id,
        conceptLabel: label,
        label: dispLabel,
        subLabel,
        conceptId: concept?.id,
        scope: concept?.scope || 'DOMAIN',
        domainCode: concept?.ownerDomain?.code ?? null,
        domainName: concept?.ownerDomain?.nameZh ?? null,
        modelDescription: concept?.description ?? null,
        fields: parseJsonSchema(concept?.jsonSchema),
        payload: e.jsonPayload,
        x: 0,
        y: 0,
        violations: [],
      })
      // 主单据概念作为中心节点（radial 布局用）
      const mainLabels = ['Loan', 'ExpenseReport', 'ProcurementRequest']
      layoutNodes.push({
        id: e.id,
        label: dispLabel,
        group: label,
        isCenter: mainLabels.includes(label),
      })
    })
  })

  // 关系连线
  const { edges, seen } = buildEdges(
    nodes,
    domainDetail?.relations ?? [],
    cidx.byId,
    domainDetail?.concepts ?? [],
  )
  // 明细行自动挂到父单据（补 LLM 抽取丢失的归属外键）
  attachDetailToParent(nodes, edges, seen)

  // 违规映射
  const { globalFindings } = mapFindingsToNodes(nodes, findings)

  const layoutEdges: LayoutEdge[] = edges.map(e => ({ from: e.from, to: e.to }))
  return { nodes, edges, globalFindings, layoutNodes, layoutEdges }
}

/** 应用布局算法，把坐标写回 nodes */
function applyInstanceLayout(nodes: GraphNode[], layoutNodes: LayoutNode[], layoutEdges: LayoutEdge[], kind: LayoutKind) {
  const positions = computeLayout(layoutNodes, layoutEdges, kind)
  const posMap = new Map(positions.map(p => [p.id, p]))
  for (const n of nodes) {
    const p = posMap.get(n.id)
    if (p) { n.x = p.x; n.y = p.y }
  }
}

// ============ 组件 ============

export interface InstanceGraphProps {
  extracted: InstanceExtracted[]
  findings: InstanceFinding[]
  domainCode?: string | null
  height?: 'full' | 'thumb'
  onExpand?: () => void
}

export function InstanceGraph({ extracted, findings, domainCode, height = 'full', onExpand }: InstanceGraphProps) {
  const conceptsResp = useFetch<ConceptLite[]>('/concepts?scope=all')
  const domainsResp = useFetch<DomainDetail[]>('/domains')

  const domainList = domainsResp.data ?? []
  const [domainDetail, setDomainDetail] = React.useState<DomainDetail | null>(null)
  React.useEffect(() => {
    let alive = true
    const target = domainList.find(d => d.code === domainCode)
    if (!target) return
    fetch(`/api/domains/${target.id}`).then(r => r.json()).then((d: DomainDetail) => {
      if (alive) setDomainDetail(d)
    }).catch(() => {})
    return () => { alive = false }
  }, [domainList, domainCode])

  const loading = conceptsResp.loading || domainsResp.loading

  const [selected, setSelected] = React.useState<string | null>(null)
  const [zoom, setZoom] = React.useState(1)
  const [hovered, setHovered] = React.useState<string | null>(null)
  const [layoutKind, setLayoutKind] = React.useState<LayoutKind>('hierarchy')
  // 节点拖动：id → {x, y} 覆盖坐标
  const [dragOverride, setDragOverride] = React.useState<Map<string, { x: number; y: number }>>(new Map())
  const dragRef = React.useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const svgRef = React.useRef<SVGSVGElement | null>(null)

  // 切换布局时清空拖动覆盖
  React.useEffect(() => {
    setDragOverride(new Map())
  }, [layoutKind, extracted])

  const graph = React.useMemo(() => {
    if (!conceptsResp.data || extracted.length === 0) {
      return { nodes: [], edges: [], globalFindings: [], layoutNodes: [], layoutEdges: [] }
    }
    const g = buildInstanceGraph(extracted, findings, conceptsResp.data, domainDetail)
    applyInstanceLayout(g.nodes, g.layoutNodes, g.layoutEdges, layoutKind)
    return g
  }, [conceptsResp.data, extracted, findings, domainDetail, layoutKind])

  const isThumb = height === 'thumb'
  const svgHeight = isThumb ? 280 : 640

  // 拖动：把鼠标坐标转成 SVG 坐标
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
    if (isThumb) return
    e.stopPropagation()
    e.preventDefault()
    const node = graph.nodes.find(n => n.id === nodeId)
    if (!node) return
    const pos = toSvgCoords(e.clientX, e.clientY)
    dragRef.current = { id: nodeId, offsetX: pos.x - node.x, offsetY: pos.y - node.y }
  }, [graph.nodes, isThumb, toSvgCoords])

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

  if (loading) {
    return <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">加载图谱数据…</div>
  }
  if (extracted.length === 0) {
    return <EmptyState title="无抽取对象" hint="本次运行未提取到可展示的数据" icon={Boxes} />
  }

  const selectedNode = selected ? graph.nodes.find(n => n.id === selected) : null
  const hoveredNode = hovered ? graph.nodes.find(n => n.id === hovered) : null
  const violatedCount = graph.nodes.filter(n => n.violations.length > 0).length

  return (
    <div className={cn('flex flex-col gap-3', isThumb && 'gap-2')}>
      {/* 全局违规提示条 */}
      {graph.globalFindings.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{graph.globalFindings.length} 条整单级检查结果 无法定位到具体实体</span>
            {graph.globalFindings.slice(0, 3).map((f, i) => (
              <span key={i} className="text-[11px]">{f.ruleCode}: {f.message}</span>
            ))}
          </div>
        </div>
      )}

      <div className={cn('grid gap-3', isThumb ? 'grid-cols-1' : 'lg:grid-cols-[minmax(0,1fr)_300px]')}>
        {/* SVG 图谱 */}
        <div
          className={cn(
            'relative min-w-0 overflow-auto rounded-lg bg-gradient-to-br from-slate-50 to-white p-2 dark:from-slate-900/50 dark:to-slate-900/30 scrollbar-thin',
            isThumb ? `h-[${svgHeight}px]` : 'h-[640px]',
            isThumb && 'cursor-zoom-in',
          )}
          onClick={isThumb && onExpand ? onExpand : undefined}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            onMouseMove={!isThumb ? handleMouseMove : undefined}
            onMouseUp={!isThumb ? handleMouseUp : undefined}
            onMouseLeave={!isThumb ? handleMouseUp : undefined}
            style={isThumb
              ? { height: svgHeight, width: '100%' }
              : zoom === 1
                ? { height: svgHeight, width: '100%' }
                : { width: VIEW_W * zoom, height: VIEW_H * zoom }
            }
            role="img"
            aria-label="抽取实例关系图谱"
          >
            <defs>
              <marker id="ig-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L9,3 z" fill="#94a3b8" />
              </marker>
              <marker id="ig-arrow-violation" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L9,3 z" fill="#f43f5e" />
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
              const hasViolation = from.violations.length > 0 || to.violations.length > 0
              const stroke = hasViolation ? '#f43f5e' : '#94a3b8'
              // 同节点对边索引错开弯曲
              const samePairIdx = graph.edges.filter(e2 =>
                (e2.from === e.from && e2.to === e.to) || (e2.from === e.to && e2.to === e.from)
              ).indexOf(e)
              const r = 16
              const { path, midX, midY } = curvePath(fx, fy, tx, ty, r, samePairIdx)
              return (
                <g key={i}>
                  <path
                    d={path}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={hasViolation ? 2 : 1.5}
                    markerEnd={hasViolation ? 'url(#ig-arrow-violation)' : 'url(#ig-arrow)'}
                    opacity={0.75}
                  />
                  {e.label && !isThumb && (
                    <text
                      x={midX}
                      y={midY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="9"
                      fill={hasViolation ? '#f43f5e' : '#64748b'}
                      className="pointer-events-none select-none"
                      style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 3, strokeLinejoin: 'round' }}
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              )
            })}

            {/* 节点 */}
            {graph.nodes.map(n => {
              const hasViolation = n.violations.length > 0
              const hex = n.scope === 'CORE' ? '#0f172a' : domainHex(n.domainCode)
              const isSelected = n.id === selected
              const isHovered = n.id === hovered
              const r = 16
              const ov = dragOverride.get(n.id)
              const nx = ov?.x ?? n.x
              const ny = ov?.y ?? n.y
              return (
                <g
                  key={n.id}
                  transform={`translate(${nx},${ny})`}
                  className={cn(!isThumb && 'cursor-grab active:cursor-grabbing transition-all')}
                  onMouseDown={!isThumb ? (ev) => handleNodeMouseDown(ev, n.id) : undefined}
                  onClick={(ev) => {
                    if (isThumb) return
                    ev.stopPropagation()
                    setSelected(n.id)
                  }}
                  onMouseEnter={() => !isThumb && setHovered(n.id)}
                  onMouseLeave={() => !isThumb && setHovered(null)}
                >
                  {(isSelected || isHovered) && (
                    <circle r={r + 5} fill="none" stroke={hasViolation ? '#f43f5e' : hex} strokeWidth="1.5" opacity="0.4" strokeDasharray="2,2" />
                  )}
                  <circle
                    r={r}
                    fill={hasViolation ? '#fee2e2' : (n.scope === 'CORE' ? 'white' : hex)}
                    stroke={hasViolation ? '#f43f5e' : hex}
                    strokeWidth={hasViolation ? 2.5 : 1.5}
                  />
                  <text
                    y={r + 13}
                    textAnchor="middle"
                    className="pointer-events-none select-none"
                    fontSize={isThumb ? 9 : 11}
                    fontWeight="500"
                    style={{ fill: 'var(--foreground)' }}
                  >
                    {n.label.length > 8 ? n.label.slice(0, 7) + '…' : n.label}
                  </text>
                  {n.subLabel && !isThumb && (
                    <text
                      y={r + 25}
                      textAnchor="middle"
                      className="pointer-events-none select-none"
                      fontSize="9"
                      fill="#94a3b8"
                    >
                      {n.subLabel}
                    </text>
                  )}
                  {/* 违规角标 */}
                  {hasViolation && (
                    <g transform={`translate(${r - 2},${-r + 2})`}>
                      <circle r="7" fill="#f43f5e" />
                      <text
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="9"
                        fontWeight="700"
                        fill="white"
                        className="pointer-events-none select-none"
                      >!</text>
                    </g>
                  )}
                </g>
              )
            })}
          </svg>

          {/* 悬浮 tooltip */}
          {hoveredNode && !isThumb && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px]">{hoveredNode.conceptLabel}</Badge>
                {hoveredNode.violations.length > 0 && (
                  <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[10px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                    <AlertTriangle className="mr-1 size-2.5" />{hoveredNode.violations.length} 违规
                  </Badge>
                )}
              </div>
              <div className="mt-1 font-medium text-foreground">{hoveredNode.label}</div>
              {hoveredNode.violations.length > 0 && (
                <div className="mt-1 max-w-xs space-y-0.5">
                  {hoveredNode.violations.slice(0, 2).map((v, i) => (
                    <div key={i} className="text-[10px] text-muted-foreground">
                      <span className="font-mono">{v.ruleCode}</span>: {v.message.slice(0, 40)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 统计浮层 */}
          <div className="pointer-events-none absolute bottom-2 right-3 rounded-md bg-white/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur dark:bg-slate-900/80">
            {graph.nodes.length} 实体 · {graph.edges.length} 关系{violatedCount > 0 ? ` · ${violatedCount} 违规` : ''}
          </div>

          {/* 缩放控件（仅 full） */}
          {!isThumb && (
            <div className="absolute right-3 top-2 flex items-center gap-1">
              <select
                value={layoutKind}
                onChange={(e) => setLayoutKind(e.target.value as LayoutKind)}
                className="h-7 rounded-md border bg-background px-1.5 text-[11px] text-foreground"
                aria-label="切换布局"
              >
                <option value="hierarchy">{layoutLabel('hierarchy')}</option>
                <option value="force">{layoutLabel('force')}</option>
                <option value="radial">{layoutLabel('radial')}</option>
              </select>
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} aria-label="缩小">
                <ZoomOut className="size-3" />
              </Button>
              <span className="w-10 text-center text-[10px] font-mono text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setZoom(z => Math.min(4, z + 0.2))} aria-label="放大">
                <ZoomIn className="size-3" />
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setZoom(1)} aria-label="重置">
                <Maximize2 className="size-3" />
              </Button>
            </div>
          )}
        </div>

        {/* 节点详情侧栏（仅 full） */}
        {!isThumb && (
          <div className="rounded-lg border bg-card p-3">
            {!selectedNode ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
                <Info className="size-5 text-muted-foreground/50" />
                <span>点击节点查看实体详情</span>
                <span className="text-[10px]">违规节点会红色高亮</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{selectedNode.conceptLabel}</Badge>
                  <ScopeBadge scope={selectedNode.scope} />
                  {selectedNode.domainName && (
                    <Badge variant="outline" className={cn('border-0 text-[10px]', domainColor(selectedNode.domainCode).bg, domainColor(selectedNode.domainCode).text)}>
                      {selectedNode.domainName}
                    </Badge>
                  )}
                </div>

                {/* 所属模型 + 描述 */}
                <div className="rounded-md bg-muted/40 p-2">
                  <div className="text-[10px] text-muted-foreground">所属模型</div>
                  <div className="font-medium text-foreground">{selectedNode.conceptLabel}</div>
                  {selectedNode.modelDescription && (
                    <div className="mt-1 text-[10px] text-muted-foreground">{selectedNode.modelDescription}</div>
                  )}
                </div>

                {/* 实体标识 */}
                <div className="rounded-md bg-muted/40 p-2">
                  <div className="text-[10px] text-muted-foreground">实体标识</div>
                  <div className="font-medium text-foreground">{selectedNode.label}</div>
                  {selectedNode.subLabel && (
                    <code className="font-mono text-[10px] text-muted-foreground">{selectedNode.subLabel}</code>
                  )}
                </div>

                {/* 命中的违规 */}
                {selectedNode.violations.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      命中规则 ({selectedNode.violations.length})
                    </div>
                    <ul className="flex flex-col gap-1">
                      {selectedNode.violations.map((v, i) => (
                        <li key={i} className="rounded-md border-l-4 border-rose-400 bg-rose-50/50 p-1.5 dark:bg-rose-950/20">
                          <div className="flex items-center gap-1">
                            {v.ruleCode && <code className="font-mono text-[10px] font-semibold">{v.ruleCode}</code>}
                            <SeverityBadge severity={v.severity} />
                          </div>
                          <div className="mt-0.5 text-[11px] text-foreground">{v.message}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 字段属性 + 实例值对照 */}
                {selectedNode.fields.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <div className="text-[11px] font-medium text-muted-foreground">字段属性 ({selectedNode.fields.length})</div>
                    <div className="overflow-hidden rounded-md border">
                      <table className="w-full text-[10px]">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-1.5 py-1 text-left font-medium text-muted-foreground">字段</th>
                            <th className="px-1.5 py-1 text-left font-medium text-muted-foreground">类型</th>
                            <th className="px-1.5 py-1 text-left font-medium text-muted-foreground">实例值</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedNode.fields.map((f, i) => {
                            const val = (selectedNode.payload as any)?.[f.name]
                            const valStr = val == null ? '-' : (typeof val === 'object' ? JSON.stringify(val) : String(val))
                            return (
                              <tr key={i} className="border-t">
                                <td className="px-1.5 py-1 font-mono text-foreground">
                                  {f.name}{f.required && <span className="ml-0.5 text-rose-500">*</span>}
                                </td>
                                <td className="px-1.5 py-1 font-mono text-muted-foreground">{fieldTypeLabel(f)}</td>
                                <td className="px-1.5 py-1 font-mono text-muted-foreground" title={valStr}>
                                  <span className="block max-w-[120px] truncate">{valStr}</span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* 无字段定义时回退到原始 JSON */
                  <div className="flex flex-col gap-1">
                    <div className="text-[11px] font-medium text-muted-foreground">字段值</div>
                    <pre className="max-h-48 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px] text-foreground scrollbar-thin">
                      <code>{prettyJson(typeof selectedNode.payload === 'string' ? selectedNode.payload : JSON.stringify(selectedNode.payload))}</code>
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
