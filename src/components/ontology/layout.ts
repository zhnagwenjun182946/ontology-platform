/**
 * 图布局工具 —— 封装三种布局算法，统一输入输出。
 *
 * - hierarchy: dagre 分层有向图（从上到下分层，自动避让边交叉）
 * - force:     d3-force 力导向（节点自然散开，适合等价/网状关系）
 * - radial:    圆周扇区（现有算法，作为 fallback）
 *
 * 所有布局返回归一化到 VIEW_W × VIEW_H 画布的坐标。
 */

import dagre from 'dagre'
import { forceSimulation, forceManyBody, forceLink, forceX, forceY, forceCollide } from 'd3-force'

export type LayoutKind = 'hierarchy' | 'force' | 'radial'

export interface LayoutNode {
  id: string
  label: string
  // 用于 dagre 节点尺寸估算
  width?: number
  height?: number
  // 用于 radial 分组（如 conceptLabel / domainCode / scope）
  group?: string
  // 是否核心/居中节点（radial 布局时放中心）
  isCenter?: boolean
}

export interface LayoutEdge {
  from: string
  to: string
}

export interface PositionedNode {
  id: string
  x: number
  y: number
}

export const LAYOUT_VIEW_W = 1100
export const LAYOUT_VIEW_H = 720

const LAYOUT_LABELS: Record<LayoutKind, string> = {
  hierarchy: '分层布局',
  force: '力导向',
  radial: '圆周扇区',
}

export function layoutLabel(k: LayoutKind): string {
  return LAYOUT_LABELS[k]
}

/**
 * 主入口：根据布局类型计算节点坐标。
 */
export function computeLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  kind: LayoutKind,
): PositionedNode[] {
  if (nodes.length === 0) return []

  switch (kind) {
    case 'hierarchy':
      return dagreLayout(nodes, edges)
    case 'force':
      return forceLayout(nodes, edges)
    case 'radial':
    default:
      return radialLayout(nodes)
  }
}

// ============ dagre 分层布局 ============

function dagreLayout(nodes: LayoutNode[], edges: LayoutEdge[]): PositionedNode[] {
  const g = new dagre.graphlib.Graph<Record<string, unknown>>()
  g.setGraph({
    rankdir: 'TB',
    nodesep: 80,
    ranksep: 100,
    marginx: 50,
    marginy: 50,
    // 减少边交叉
    ranker: 'network-simplex',
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const n of nodes) {
    // 根据标签长度估算节点宽高（加大尺寸留足间距）
    const labelLen = Math.max(n.label?.length ?? 4, 4)
    const w = n.width ?? Math.max(100, labelLen * 14 + 30)
    const h = n.height ?? 50
    g.setNode(n.id, { width: w, height: h, label: n.label })
  }
  for (const e of edges) {
    if (g.hasNode(e.from) && g.hasNode(e.to)) {
      g.setEdge(e.from, e.to)
    }
  }

  dagre.layout(g)

  // 归一化到画布：计算 dagre 输出的 bounding box，缩放居中
  const coords = nodes.map(n => {
    const node = g.node(n.id)
    return { id: n.id, x: node.x, y: node.y }
  })

  return normalizeToCanvas(coords)
}

// ============ d3-force 力导向布局 ============

function forceLayout(nodes: LayoutNode[], edges: LayoutEdge[]): PositionedNode[] {
  // d3-force 用的节点/边结构，初始坐标随机散布（避免全在原点导致斥力无法展开）
  const cx = LAYOUT_VIEW_W / 2
  const cy = LAYOUT_VIEW_H / 2
  const simNodes = nodes.map(n => ({
    id: n.id,
    x: cx + (Math.random() - 0.5) * 400,
    y: cy + (Math.random() - 0.5) * 300,
  }))
  const idIndex = new Map(simNodes.map((n, i) => [n.id, i]))
  const simLinks = edges
    .filter(e => idIndex.has(e.from) && idIndex.has(e.to))
    .map(e => ({
      source: idIndex.get(e.from)!,
      target: idIndex.get(e.to)!,
    }))

  // 力参数根据节点数自适应
  const n = simNodes.length
  const chargeStrength = -Math.max(300, 800 - n * 15) // 斥力，节点越多越小但不低于 300
  const linkDistance = Math.max(80, 160 - n * 3)

  const simulation = forceSimulation(simNodes as any)
    .force('charge', forceManyBody().strength(chargeStrength))
    .force('link', forceLink(simLinks).distance(linkDistance).strength(0.4))
    // forceX/forceY 比 forceCenter 温和，不会把节点全拉到一个点
    .force('x', forceX(cx).strength(0.05))
    .force('y', forceY(cy).strength(0.05))
    .force('collide', forceCollide(45))
    .alpha(1)
    .alphaDecay(0.005) // 慢衰减，让节点充分散开
    .stop()

  // 跑足够次数迭代（同步，不动画）
  const iterations = 500
  for (let i = 0; i < iterations; i++) simulation.tick()

  const coords = simNodes.map(n => ({ id: n.id, x: n.x!, y: n.y! }))
  return normalizeToCanvas(coords)
}

// ============ 圆周扇区布局（fallback） ============

function radialLayout(nodes: LayoutNode[]): PositionedNode[] {
  const centerNodes = nodes.filter(n => n.isCenter)
  const otherNodes = nodes.filter(n => !n.isCenter)

  const result: PositionedNode[] = []
  const cx = LAYOUT_VIEW_W / 2
  const cy = LAYOUT_VIEW_H / 2

  // 中心节点：小圆环
  const centerR = 70
  centerNodes.forEach((n, i) => {
    const angle = (i / Math.max(centerNodes.length, 1)) * Math.PI * 2 - Math.PI / 2
    result.push({ id: n.id, x: cx + Math.cos(angle) * centerR, y: cy + Math.sin(angle) * centerR })
  })

  // 其它节点：按 group 分扇区
  const groups = new Map<string, LayoutNode[]>()
  for (const n of otherNodes) {
    const g = n.group ?? 'default'
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(n)
  }
  const groupList = Array.from(groups.entries())
  const radius = 280
  groupList.forEach(([group, list], gi) => {
    const total = Math.max(groupList.length, 1)
    const baseAngle = (gi / total) * Math.PI * 2 - Math.PI / 2
    const sectorSpan = (Math.PI * 2 / total) * 0.7
    list.forEach((n, i) => {
      const cnt = Math.max(list.length, 1)
      const subAngle = baseAngle + (i - (cnt - 1) / 2) * (sectorSpan / cnt)
      const r = radius + ((i % 3) - 1) * 30
      result.push({ id: n.id, x: cx + Math.cos(subAngle) * r, y: cy + Math.sin(subAngle) * r })
    })
  })

  return result
}

// ============ 归一化到画布 ============

function normalizeToCanvas(coords: PositionedNode[]): PositionedNode[] {
  if (coords.length === 0) return []
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const c of coords) {
    minX = Math.min(minX, c.x)
    maxX = Math.max(maxX, c.x)
    minY = Math.min(minY, c.y)
    maxY = Math.max(maxY, c.y)
  }
  const w = maxX - minX || 1
  const h = maxY - minY || 1
  const padding = 60
  const scaleX = (LAYOUT_VIEW_W - padding * 2) / w
  const scaleY = (LAYOUT_VIEW_H - padding * 2) / h
  const scale = Math.min(scaleX, scaleY, 1.5) // 不放太大

  return coords.map(c => ({
    id: c.id,
    x: (c.x - minX) * scale + padding,
    y: (c.y - minY) * scale + padding,
  }))
}

// ============ 边路径工具 ============

/**
 * 计算两点间曲线路径（quadratic bezier）。
 * 同一对节点间多条边时，用 edgeIndex 错开弯曲方向避免重叠。
 * 返回 { path: SVG path d, midX, midY: 标签位置, dx, dy: 方向 }。
 */
export function curvePath(
  x1: number, y1: number,
  x2: number, y2: number,
  nodeRadius: number,
  edgeIndex = 0,
): { path: string; midX: number; midY: number } {
  // 起止点向内收缩 nodeRadius，避免箭头插进节点圆里
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  const sx = x1 + ux * nodeRadius
  const sy = y1 + uy * nodeRadius
  const ex = x2 - ux * nodeRadius
  const ey = y2 - uy * nodeRadius

  // 控制点：中点法线方向偏移，edgeIndex 控制偏移大小和方向
  const mx = (sx + ex) / 2
  const my = (sy + ey) / 2
  // 法线方向（垂直于边方向）
  const nx = -uy
  const ny = ux
  // 偏移量：偶数边正向、奇数边反向，逐条增大
  const offset = (Math.floor(edgeIndex / 2) + 1) * 30 * (edgeIndex % 2 === 0 ? 1 : -1)
  const cx = mx + nx * offset
  const cy = my + ny * offset

  const d = `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`
  // 标签放在曲线中点（略偏法线方向，与控制点同侧但距离减半）
  return { path: d, midX: mx + nx * offset * 0.5, midY: my + ny * offset * 0.5 }
}

