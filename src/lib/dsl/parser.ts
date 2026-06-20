/**
 * 企业级本体平台 v2 - Rule DSL 解析器
 *
 * DSL 设计原则：
 * - YAML 兼容
 * - 声明式 when/then
 * - 可读渲染成中文
 * - 可编译成 SHACL（简化版）
 * - 可执行（用于试运行）
 */

export type Severity = "ERROR" | "WARNING" | "INFO"

export interface RuleDsl {
  id?: string
  name: string
  severity?: Severity
  target: string
  targetPath?: string
  when: WhenExpr
  then?: ThenAction[]
  message?: string
  explanation?: string
  references?: string[]
  tags?: string[]
  tests?: RuleTestDsl[]
}

export type WhenExpr =
  | { all: WhenExpr[] }
  | { any: WhenExpr[] }
  | { not: WhenExpr }
  | { eq: [Expr, Expr] }
  | { ne: [Expr, Expr] }
  | { gt: [Expr, Expr] }
  | { ge: [Expr, Expr] }
  | { lt: [Expr, Expr] }
  | { le: [Expr, Expr] }
  | { in: [Expr, Expr[]] }
  | { notIn: [Expr, Expr[]] }
  | { contains: [Expr, Expr] }
  | { regex: [Expr, string] }
  | { isEmpty: Expr }
  | { isNotEmpty: Expr }
  | { exists: Expr }
  | { call: [string, ...Expr[]] }

export type Expr =
  | string
  | number
  | boolean
  | null
  | { path: string }
  | { literal: string }
  | { call: [string, ...Expr[]] }

export interface ThenAction {
  [key: string]: any
}

export interface RuleTestDsl {
  name: string
  input: Record<string, any>
  expect: "pass" | "fail"
}

/**
 * 把 DSL YAML 文本解析成结构化对象。
 */
export function parseDsl(yamlText: string): RuleDsl {
  const obj = simpleYamlParse(yamlText)
  // DSL 通常是单条规则，可能是 `- ...` 列表形式或纯对象
  const target = Array.isArray(obj) ? (obj[0] ?? {}) : (obj ?? {})
  return normalizeDsl(target)
}

/**
 * 极简 YAML 解析器：支持缩进块、列表、标量、键值对。
 */
function simpleYamlParse(text: string): any {
  const lines = text.split("\n")
  const res = parseBlock(lines, 0, 0)
  return res.value
}

function parseBlock(lines: string[], startIdx: number, indent: number): { value: any; nextIdx: number } {
  let i = startIdx
  while (i < lines.length && (lines[i].trim() === "" || lines[i].trim().startsWith("#"))) {
    i++
  }
  if (i >= lines.length) return { value: null, nextIdx: i }

  const firstLine = lines[i]
  const firstIndent = getIndent(firstLine)
  if (firstIndent < indent) return { value: null, nextIdx: i }

  const trimmed = firstLine.trim()
  if (trimmed.startsWith("- ")) {
    const list: any[] = []
    while (i < lines.length) {
      const line = lines[i]
      if (line.trim() === "" || line.trim().startsWith("#")) { i++; continue }
      const ind = getIndent(line)
      if (ind < firstIndent) break
      if (ind > firstIndent) { i++; continue }
      const item = line.trim().slice(2)
      if (item === "") {
        const sub = parseBlock(lines, i + 1, firstIndent + 2)
        list.push(sub.value)
        i = sub.nextIdx
      } else if (item.includes(":") && !item.startsWith('"')) {
        const obj: any = {}
        const [k, ...rest] = item.split(":")
        const v = rest.join(":").trim()
        if (isBlockScalarMarker(v)) {
          const r = collectBlockScalar(lines, i + 1, firstIndent, v)
          obj[k.trim()] = r.value
          i = r.nextIdx
        } else if (v === "") {
          const sub = parseBlock(lines, i + 1, firstIndent + 2)
          obj[k.trim()] = sub.value
          i = sub.nextIdx
        } else {
          obj[k.trim()] = parseScalar(v)
          i++
          while (i < lines.length) {
            const l2 = lines[i]
            if (l2.trim() === "" || l2.trim().startsWith("#")) { i++; continue }
            const ind2 = getIndent(l2)
            if (ind2 <= firstIndent) break
            const t2 = l2.trim()
            if (t2.startsWith("- ")) break
            const [k2, ...r2] = t2.split(":")
            const v2 = r2.join(":").trim()
            if (isBlockScalarMarker(v2)) {
              const r2b = collectBlockScalar(lines, i + 1, ind2, v2)
              obj[k2.trim()] = r2b.value
              i = r2b.nextIdx
            } else if (v2 === "") {
              const s2 = parseBlock(lines, i + 1, ind2 + 2)
              obj[k2.trim()] = s2.value
              i = s2.nextIdx
            } else {
              obj[k2.trim()] = parseScalar(v2)
              i++
            }
          }
        }
        list.push(obj)
      } else {
        list.push(parseScalar(item))
        i++
      }
    }
    return { value: list, nextIdx: i }
  } else {
    // 检测：单行标量场景（如 `when:\n  isEmpty(submitter)`）
    // 如果首行不含 `:`，则把整块当标量字符串返回
    if (!trimmed.includes(":")) {
      // 收集所有同缩进的连续行作为多行字符串
      let scalar = trimmed
      i++
      while (i < lines.length) {
        const line = lines[i]
        if (line.trim() === "" || line.trim().startsWith("#")) { i++; continue }
        const ind = getIndent(line)
        if (ind < firstIndent) break
        if (ind > firstIndent) { i++; continue }
        const t = line.trim()
        if (t.startsWith("- ")) break
        if (t.includes(":")) break
        scalar += "\n" + t
        i++
      }
      return { value: scalar, nextIdx: i }
    }
    const obj: any = {}
    while (i < lines.length) {
      const line = lines[i]
      if (line.trim() === "" || line.trim().startsWith("#")) { i++; continue }
      const ind = getIndent(line)
      if (ind < firstIndent) break
      if (ind > firstIndent) { i++; continue }
      const t = line.trim()
      if (t.startsWith("- ")) break
      // 同样：不含 `:` 的行视为标量，跳过（不应出现在 map 中）
      if (!t.includes(":")) {
        // 把它当作 previous key 的多行延续，简单跳过
        i++
        continue
      }
      const [k, ...rest] = t.split(":")
      const v = rest.join(":").trim()
      if (isBlockScalarMarker(v)) {
        const r = collectBlockScalar(lines, i + 1, firstIndent, v)
        obj[k.trim()] = r.value
        i = r.nextIdx
      } else if (v === "") {
        const sub = parseBlock(lines, i + 1, firstIndent + 2)
        obj[k.trim()] = sub.value
        i = sub.nextIdx
      } else {
        obj[k.trim()] = parseScalar(v)
        i++
      }
    }
    return { value: obj, nextIdx: i }
  }
}

function getIndent(line: string): number {
  const m = line.match(/^(\s*)/)
  return m ? m[1].length : 0
}

// 块标量标记：| / > / |- / >- / |+ / >+
function isBlockScalarMarker(v: string): boolean {
  return v === "|" || v === ">" || v === "|-" || v === ">-" || v === "|+" || v === ">+"
}

// 收集块标量内容。startIdx 指向块内容第一行，parentIndent 是 key 所在行的缩进。
function collectBlockScalar(
  lines: string[],
  startIdx: number,
  parentIndent: number,
  marker: string,
): { value: string; nextIdx: number } {
  const blockLines: string[] = []
  let j = startIdx
  // 找到块内容的实际缩进（第一个非空行）
  let blockIndent = -1
  while (j < lines.length) {
    const bl = lines[j]
    if (bl.trim() === "") { blockLines.push(""); j++; continue }
    const bind = getIndent(bl)
    if (bind <= parentIndent) break
    if (blockIndent === -1) blockIndent = bind
    if (bind < blockIndent) break
    blockLines.push(bl.slice(blockIndent))
    j++
  }
  // 去掉末尾空行
  while (blockLines.length > 0 && blockLines[blockLines.length - 1] === "") blockLines.pop()

  let value = blockLines.join("\n")
  if (marker === "|-" || marker === ">-") {
    // strip：已经去尾空行
  } else {
    // clip：保留一个末尾换行（这里简化为无换行）
  }
  // > 折叠模式
  if (marker.startsWith(">")) {
    value = value.split("\n").map(l => l.trim()).filter(l => l !== "").join(" ")
  }
  return { value, nextIdx: j }
}

function parseScalar(s: string): any {
  if (s === "") return null
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    // 用标记对象记录"这是带引号的字符串字面量"，不是路径
    return { __literal: true, value: s.slice(1, -1) }
  }
  if (s === "true") return true
  if (s === "false") return false
  if (s === "null" || s === "~") return null
  if (/^-?\d+$/.test(s)) return parseInt(s, 10)
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s)
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim()
    if (inner === "") return []
    return inner.split(",").map(x => parseScalar(x.trim()))
  }
  return s
}

function unwrapLiteral(v: any): any {
  if (v && typeof v === "object" && v.__literal === true) return v.value
  return v
}

function normalizeDsl(obj: any): RuleDsl {
  return {
    id: unwrapLiteral(obj.id),
    name: unwrapLiteral(obj.name) ?? "(未命名规则)",
    severity: (unwrapLiteral(obj.severity) ?? "WARNING").toUpperCase() as Severity,
    target: unwrapLiteral(obj.target) ?? "",
    targetPath: unwrapLiteral(obj.targetPath),
    when: normalizeWhen(obj.when) ?? { all: [] },
    then: Array.isArray(obj.then) ? obj.then : obj.then ? [obj.then] : undefined,
    message: unwrapLiteral(obj.message),
    explanation: unwrapLiteral(obj.explanation),
    references: Array.isArray(obj.references) ? obj.references.map(unwrapLiteral) : undefined,
    tags: Array.isArray(obj.tags) ? obj.tags.map(unwrapLiteral) : undefined,
    tests: Array.isArray(obj.tests) ? obj.tests : undefined,
  }
}

function normalizeWhen(w: any): WhenExpr | null {
  if (!w) return null
  // 字符串：当作内联表达式解析
  if (typeof w === "string") return parseInlineWhen(w.trim())
  if (typeof w !== "object") return null
  // 数组：当作 all
  if (Array.isArray(w)) {
    const subs = w.map(normalizeWhen).filter(Boolean) as WhenExpr[]
    if (subs.length === 0) return null
    if (subs.length === 1) return subs[0]
    return { all: subs }
  }
  if ("all" in w) return { all: (Array.isArray(w.all) ? w.all : [w.all]).map(normalizeWhen).filter(Boolean) as WhenExpr[] }
  if ("any" in w) return { any: (Array.isArray(w.any) ? w.any : [w.any]).map(normalizeWhen).filter(Boolean) as WhenExpr[] }
  if ("not" in w) { const s = normalizeWhen(w.not); return s ? { not: s } : null }

  const opMap: Record<string, string> = {
    "==": "eq", "!=": "ne", ">": "gt", ">=": "ge", "<": "lt", "<=": "le",
    in: "in", not_in: "notIn", contains: "contains", regex: "regex",
    isEmpty: "isEmpty", isNotEmpty: "isNotEmpty", exists: "exists", call: "call",
  }
  for (const k of Object.keys(w)) {
    const mapped = opMap[k]
    if (mapped) {
      const v = w[k]
      if (mapped === "isEmpty" || mapped === "isNotEmpty" || mapped === "exists") {
        return { [mapped]: normalizeExpr(v) } as WhenExpr
      }
      if (Array.isArray(v)) {
        return { [mapped]: v.map(normalizeExpr) } as WhenExpr
      }
    }
  }

  const subs: WhenExpr[] = []
  for (const k of Object.keys(w)) {
    const mapped = opMap[k]
    if (mapped && Array.isArray(w[k])) {
      subs.push({ [mapped]: w[k].map(normalizeExpr) } as WhenExpr)
    }
  }
  if (subs.length === 1) return subs[0]
  if (subs.length > 1) return { all: subs }
  return null
}

/**
 * 解析内联表达式字符串为人能写的 DSL。
 * 支持：
 *   isEmpty(path) / isNotEmpty(path) / exists(path)
 *   func(arg1, arg2)         -> { call: [func, arg1, arg2] }
 *   path == value            -> { eq: [path, value] }
 *   path > value / >= / < / <= / != / in / not_in / contains
 *   not (expr)               -> { not: expr }
 *   bare path                -> { exists: path }（truthy 判定）
 *
 * value 支持：数字、布尔、双引号/单引号字符串、路径
 */
function parseInlineWhen(s: string): WhenExpr | null {
  if (!s) return null

  // not (...)
  const notMatch = s.match(/^not\s*\((.+)\)$/i)
  if (notMatch) {
    const inner = parseInlineWhen(notMatch[1].trim())
    return inner ? { not: inner } : null
  }

  // 函数调用 isEmpty(x) / func(a, b)
  const fnMatch = s.match(/^([a-zA-Z_][\w]*)\s*\(([^)]*)\)$/)
  if (fnMatch) {
    const [, fn, argsStr] = fnMatch
    const args = argsStr.trim() === "" ? [] : argsStr.split(",").map(a => parseInlineExpr(a.trim()))
    if (fn === "isEmpty") return { isEmpty: args[0] }
    if (fn === "isNotEmpty") return { isNotEmpty: args[0] }
    if (fn === "exists") return { exists: args[0] }
    return { call: [fn, ...args] as any }
  }

  // 比较操作：a op b
  // 注意 >= <= == != 要在 > < = ! 之前匹配
  const opPatterns: Array<[RegExp, string]> = [
    [/^(.+?)\s*>=\s*(.+)$/, "ge"],
    [/^(.+?)\s*<=\s*(.+)$/, "le"],
    [/^(.+?)\s*==\s*(.+)$/, "eq"],
    [/^(.+?)\s*!=\s*(.+)$/, "ne"],
    [/^(.+?)\s*>\s*(.+)$/, "gt"],
    [/^(.+?)\s*<\s*(.+)$/, "lt"],
    [/^(.+?)\s+in\s+(.+)$/i, "in"],
    [/^(.+?)\s+not_in\s+(.+)$/i, "notIn"],
    [/^(.+?)\s+contains\s+(.+)$/i, "contains"],
  ]
  for (const [re, op] of opPatterns) {
    const m = s.match(re)
    if (m) {
      const left = parseInlineExpr(m[1].trim())
      let rightRaw = m[2].trim()
      // in / not_in 的右侧可能是 [a, b, c] 数组
      if (op === "in" || op === "notIn") {
        if (rightRaw.startsWith("[") && rightRaw.endsWith("]")) {
          const inner = rightRaw.slice(1, -1).trim()
          const arr = inner === "" ? [] : inner.split(",").map(x => parseInlineExpr(x.trim()))
          return { [op]: [left, arr] } as WhenExpr
        }
        // 否则当作单值
        return { [op]: [left, [parseInlineExpr(rightRaw)]] } as WhenExpr
      }
      const right = parseInlineExpr(rightRaw)
      return { [op]: [left, right] } as WhenExpr
    }
  }

  // 裸路径 → exists
  if (/^[a-zA-Z_][\w.*\[\]]*$/.test(s)) {
    return { exists: s }
  }

  return null
}

/**
 * 解析内联值表达式：数字、布尔、字符串、路径、函数调用
 */
function parseInlineExpr(s: string): Expr {
  if (s === "" || s === "null" || s === "~") return null
  if (s === "true") return true
  if (s === "false") return false
  if (/^-?\d+$/.test(s)) return parseInt(s, 10)
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s)
  // 字符串字面量（带引号）
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return { literal: s.slice(1, -1) }
  }
  // 数组
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim()
    if (inner === "") return [] as any
    return inner.split(",").map(x => parseInlineExpr(x.trim())) as any
  }
  // 函数调用
  const fnMatch = s.match(/^([a-zA-Z_][\w]*)\s*\(([^)]*)\)$/)
  if (fnMatch) {
    const [, fn, argsStr] = fnMatch
    const args = argsStr.trim() === "" ? [] : argsStr.split(",").map(a => parseInlineExpr(a.trim()))
    return { call: [fn, ...args] as any }
  }
  // 路径
  if (/^[a-zA-Z_][\w.*\[\]]*$/.test(s)) return s
  // 兜底：当作字符串字面量
  return { literal: s }
}

function normalizeExpr(e: any): Expr {
  if (e === null || e === undefined) return null
  if (typeof e === "string" || typeof e === "number" || typeof e === "boolean") return e
  if (typeof e === "object") {
    // 带引号的字符串字面量
    if (e.__literal === true) return { literal: e.value }
    if ("call" in e) return { call: (e.call as any[]).map(normalizeExpr) as [string, ...Expr[]] }
    if ("path" in e) return { path: e.path }
  }
  return String(e)
}

// ========== 可读渲染（中文） ==========

export function renderRuleHumanReadable(rule: RuleDsl): string[] {
  const lines: string[] = []
  lines.push(`规则 ${rule.id ?? "(无编号)"} · ${rule.name}`)
  lines.push(`  等级：${severityLabel(rule.severity ?? "WARNING")}`)
  if (rule.target) {
    lines.push(`  适用于：${rule.target}${rule.targetPath ? " · " + rule.targetPath : ""}`)
  }
  lines.push(`  条件：${renderWhen(rule.when)}`)
  if (rule.then && rule.then.length > 0) {
    lines.push(`  动作：${rule.then.map(renderAction).join("；")}`)
  }
  if (rule.message) {
    lines.push(`  提示：${rule.message}`)
  }
  if (rule.explanation) {
    lines.push(`  依据：${rule.explanation.replace(/\s+/g, " ").trim()}`)
  }
  if (rule.tags && rule.tags.length > 0) {
    lines.push(`  标签：${rule.tags.join("、")}`)
  }
  return lines
}

function severityLabel(s: Severity): string {
  return s === "ERROR" ? "错误（必须通过）" : s === "WARNING" ? "警告（建议处理）" : "提示"
}

function renderWhen(w: WhenExpr): string {
  if ("all" in w) return w.all.map(renderWhen).join(" 且 ")
  if ("any" in w) return w.any.length > 1
    ? w.any.map(x => `(${renderWhen(x)})`).join(" 或 ")
    : renderWhen(w.any[0])
  if ("not" in w) return `非 (${renderWhen(w.not)})`
  if ("eq" in w) return `${renderExpr(w.eq[0])} = ${renderExpr(w.eq[1])}`
  if ("ne" in w) return `${renderExpr(w.ne[0])} ≠ ${renderExpr(w.ne[1])}`
  if ("gt" in w) return `${renderExpr(w.gt[0])} > ${renderExpr(w.gt[1])}`
  if ("ge" in w) return `${renderExpr(w.ge[0])} ≥ ${renderExpr(w.ge[1])}`
  if ("lt" in w) return `${renderExpr(w.lt[0])} < ${renderExpr(w.lt[1])}`
  if ("le" in w) return `${renderExpr(w.le[0])} ≤ ${renderExpr(w.le[1])}`
  if ("in" in w) return `${renderExpr(w.in[0])} 属于 [${w.in[1].map(renderExpr).join(", ")}]`
  if ("notIn" in w) return `${renderExpr(w.notIn[0])} 不属于 [${w.notIn[1].map(renderExpr).join(", ")}]`
  if ("contains" in w) return `${renderExpr(w.contains[0])} 包含 ${renderExpr(w.contains[1])}`
  if ("regex" in w) return `${renderExpr(w.regex[0])} 匹配正则 /${w.regex[1]}/`
  if ("isEmpty" in w) return `${renderExpr(w.isEmpty)} 为空`
  if ("isNotEmpty" in w) return `${renderExpr(w.isNotEmpty)} 非空`
  if ("exists" in w) return `${renderExpr(w.exists)} 存在`
  if ("call" in w) return `${w.call[0]}(${w.call.slice(1).map(renderExpr).join(", ")}) 为真`
  return "(未知条件)"
}

function renderExpr(e: Expr): string {
  if (e === null) return "空"
  if (typeof e === "string") {
    if (/^[a-zA-Z_][\w.*\[\]]*$/.test(e) && !["true", "false", "null"].includes(e)) {
      return humanizePath(e)
    }
    return `"${e}"`
  }
  if (typeof e === "number" || typeof e === "boolean") return String(e)
  if (typeof e === "object") {
    if ("literal" in e) return `"${e.literal}"`
    if ("path" in e) return humanizePath(e.path)
    if ("call" in e) return `${e.call[0]}(${e.call.slice(1).map(renderExpr).join(", ")})`
  }
  return String(e)
}

function humanizePath(p: string): string {
  const parts = p.split(".")
  if (parts.length === 1) return parts[0]
  return parts.join(" → ")
}

function renderAction(a: ThenAction): string {
  const k = Object.keys(a)[0]
  const v = a[k]
  if (k === "require_approval") return `要求 ${v} 审批`
  if (k === "tag") return `打标 "${v}"`
  if (k === "set_field") return `设置 ${v}`
  if (k === "notify") return `通知 ${v}`
  return `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`
}

// ========== 简单表达式求值（用于试运行） ==========

export function evaluateWhen(
  w: WhenExpr,
  ctx: any,
  functions: Record<string, (...args: any[]) => any> = {},
): boolean {
  if ("all" in w) return w.all.every(x => evaluateWhen(x, ctx, functions))
  if ("any" in w) return w.any.some(x => evaluateWhen(x, ctx, functions))
  if ("not" in w) return !evaluateWhen(w.not, ctx, functions)
  // 比较语义：当路径侧解析为 undefined（字段不存在）时，比较结果一律为 false。
  // 即「字段不存在」不等于「与某值不等」，避免整单无 invoiceType 时误命中 != 规则。
  if ("eq" in w) {
    const [lv, lmiss] = evalPathAware(w.eq[0], ctx, functions)
    const [rv, rmiss] = evalPathAware(w.eq[1], ctx, functions)
    if (lmiss || rmiss) return false
    return deepEqual(lv, rv)
  }
  if ("ne" in w) {
    const [lv, lmiss] = evalPathAware(w.ne[0], ctx, functions)
    const [rv, rmiss] = evalPathAware(w.ne[1], ctx, functions)
    if (lmiss || rmiss) return false
    return !deepEqual(lv, rv)
  }
  if ("gt" in w) {
    const [lv, lmiss] = evalPathAware(w.gt[0], ctx, functions)
    const [rv, rmiss] = evalPathAware(w.gt[1], ctx, functions)
    if (lmiss || rmiss) return false
    return Number(lv) > Number(rv)
  }
  if ("ge" in w) {
    const [lv, lmiss] = evalPathAware(w.ge[0], ctx, functions)
    const [rv, rmiss] = evalPathAware(w.ge[1], ctx, functions)
    if (lmiss || rmiss) return false
    return Number(lv) >= Number(rv)
  }
  if ("lt" in w) {
    const [lv, lmiss] = evalPathAware(w.lt[0], ctx, functions)
    const [rv, rmiss] = evalPathAware(w.lt[1], ctx, functions)
    if (lmiss || rmiss) return false
    return Number(lv) < Number(rv)
  }
  if ("le" in w) {
    const [lv, lmiss] = evalPathAware(w.le[0], ctx, functions)
    const [rv, rmiss] = evalPathAware(w.le[1], ctx, functions)
    if (lmiss || rmiss) return false
    return Number(lv) <= Number(rv)
  }
  if ("in" in w) {
    const v = evalExpr(w.in[0], ctx, functions)
    const arr = w.in[1].map(x => evalExpr(x, ctx, functions))
    return arr.some(x => deepEqual(x, v))
  }
  if ("notIn" in w) {
    const v = evalExpr(w.notIn[0], ctx, functions)
    const arr = w.notIn[1].map(x => evalExpr(x, ctx, functions))
    return !arr.some(x => deepEqual(x, v))
  }
  if ("contains" in w) {
    const v = evalExpr(w.contains[0], ctx, functions)
    const sub = evalExpr(w.contains[1], ctx, functions)
    if (Array.isArray(v) || typeof v === "string") return v.includes(sub as any)
    return false
  }
  if ("isEmpty" in w) {
    const v = evalExpr(w.isEmpty, ctx, functions)
    return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)
  }
  if ("isNotEmpty" in w) {
    const v = evalExpr(w.isNotEmpty, ctx, functions)
    return !(v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0))
  }
  if ("exists" in w) {
    const v = evalExpr(w.exists, ctx, functions)
    return v !== undefined && v !== null
  }
  if ("call" in w) {
    const [fnName, ...args] = w.call
    const fn = functions[fnName as string]
    if (!fn) return false
    return !!fn(...args.map(a => evalExpr(a, ctx, functions)))
  }
  return false
}

function evalExpr(e: Expr, ctx: any, functions: Record<string, (...args: any[]) => any>): any {
  if (e === null) return null
  if (typeof e === "string") {
    if (/^[a-zA-Z_][\w.*\[\]]*$/.test(e) && !["true", "false", "null"].includes(e)) {
      return resolvePath(e, ctx)
    }
    return e
  }
  if (typeof e === "number" || typeof e === "boolean") return e
  if (typeof e === "object") {
    if ("literal" in e) return e.literal
    if ("path" in e) return resolvePath(e.path, ctx)
    if ("call" in e) {
      const [fnName, ...args] = e.call
      const fn = functions[fnName as string]
      if (!fn) return undefined
      return fn(...args.map(a => evalExpr(a, ctx, functions)))
    }
  }
  return e
}

/**
 * 判断 Expr 是否是「路径表达式」（会从 ctx 取值，可能因字段不存在而 undefined）。
 * 字面量、数字、布尔等不是路径，其值是确定的。
 */
function exprIsPath(e: Expr): boolean {
  if (typeof e === "string") {
    return /^[a-zA-Z_][\w.*\[\]]*$/.test(e) && !["true", "false", "null"].includes(e)
  }
  if (typeof e === "object" && e !== null) {
    return "path" in e
  }
  return false
}

/**
 * 带路径缺失感知的求值。返回 [value, pathMissing]：
 * - 若 e 是路径且解析结果为 undefined，pathMissing=true（字段不存在）
 * - 否则 pathMissing=false，value 为正常求值结果
 *
 * 用于比较运算（==/!=/>/< 等）：路径侧缺失时让比较返回 false，
 * 避免「整单无 invoiceType」时 `invoiceType != "增值税专用发票"` 误判为 true。
 */
function evalPathAware(
  e: Expr,
  ctx: any,
  functions: Record<string, (...args: any[]) => any>,
): [any, boolean] {
  if (exprIsPath(e)) {
    const pathStr = typeof e === "string" ? e : (e as { path: string }).path
    const v = resolvePath(pathStr, ctx)
    return [v, v === undefined]
  }
  return [evalExpr(e, ctx, functions), false]
}

function resolvePath(path: string, ctx: any): any {
  if (!ctx) return undefined
  const parts = path.split(".")
  let cur: any = ctx
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    const m = p.match(/^([^\[]+)(\[(\*|\d+)\])?$/)
    if (!m) {
      cur = cur[p]
      continue
    }
    const [, key, , idx] = m
    cur = cur[key]
    if (idx === "*") {
      if (!Array.isArray(cur)) return undefined
      return cur
    } else if (idx !== undefined) {
      cur = cur[parseInt(idx, 10)]
    }
  }
  return cur
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (a == null || b == null) return a == b
  if (typeof a !== typeof b) return false
  if (typeof a === "object") return JSON.stringify(a) === JSON.stringify(b)
  return false
}

export function renderMessage(
  template: string,
  ctx: any,
  _functions: Record<string, (...args: any[]) => any> = {},
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
    const e = expr.trim()
    if (/^[a-zA-Z_][\w.*\[\]]*$/.test(e)) {
      const v = resolvePath(e, ctx)
      return v === undefined || v === null ? "" : String(v)
    }
    return `{{${expr}}}`
  })
}

// ========== DSL → SHACL（简化编译，仅演示） ==========

export function compileToShacl(rule: RuleDsl): string {
  const lines: string[] = []
  const shapeUri = `ex:${rule.id ?? "Rule"}Shape`
  lines.push(`# 由 Rule DSL 自动编译 - 规则 ${rule.id ?? ""} ${rule.name}`)
  lines.push(`${shapeUri} a sh:NodeShape ;`)
  lines.push(`  sh:targetClass ex:${rule.target} ;`)
  if (rule.targetPath) {
    lines.push(`  sh:targetSubjectsOf ex:${rule.targetPath.replace(/[\[\].]/g, "_")} ;`)
  }
  lines.push(`  sh:message "${rule.message ?? rule.name}" ;`)
  lines.push(`  sh:severity sh:${rule.severity === "ERROR" ? "Violation" : rule.severity === "WARNING" ? "Warning" : "Info"} ;`)
  lines.push(`  # 原始条件：${renderWhen(rule.when)}`)
  lines.push(compileWhenToShacl(rule.when, "  "))
  lines.push(`  .`)
  return lines.join("\n")
}

function compileWhenToShacl(w: WhenExpr, indent: string): string {
  if ("eq" in w) {
    const path = typeof w.eq[0] === "string" ? w.eq[0] : (w.eq[0] as any).path
    const val = w.eq[1]
    return `${indent}sh:property [\n${indent}  sh:path ex:${path} ;\n${indent}  sh:hasValue ${typeof val === "string" ? `"${val}"` : val} ;\n${indent}] ;`
  }
  if ("gt" in w) {
    const path = typeof w.gt[0] === "string" ? w.gt[0] : (w.gt[0] as any).path
    const val = w.gt[1]
    return `${indent}sh:property [\n${indent}  sh:path ex:${path} ;\n${indent}  sh:minExclusive ${val} ;\n${indent}] ;`
  }
  if ("all" in w) {
    return w.all.map(x => compileWhenToShacl(x, indent)).join("\n")
  }
  return `${indent}# (复杂条件未自动编译，请人工补 SHACL)`
}

/**
 * 内置受治理函数 - 用于 DSL 中的 call 表达式。
 * 实际平台应从 Function Registry 加载。
 */
/**
 * 通用内置函数 —— 领域无关的工具函数。
 *
 * 注意：受治理标准类函数（std_hotel_max / std_meal_max / entertainment_max 等）
 * 不再写死在此处。它们按领域存成 Standard.matrix（受治理取值表），由
 * validation-engine 在运行时加载并构建成同名函数注入 functions 注册表。
 * 规则 DSL 里 call 到某个 std_xxx 时：
 *   - 若该领域定义了对应 Standard → 按 call 参数下钻 matrix 取值；
 *   - 若未定义 → 函数不存在，evalExpr 返回 undefined → 比较取 false（不误报）。
 * 这样硬编码默认值不再掩盖「标准缺失/不匹配」的问题。
 */
export const builtinFunctions: Record<string, (...args: any[]) => any> = {
  // 是否工作日
  is_workday: (dateStr: string) => {
    const d = new Date(dateStr)
    const day = d.getDay()
    return day !== 0 && day !== 6
  },
  // 检测数组中某字段是否有重复
  has_duplicate_field: (arr: any[], fieldPath: string) => {
    if (!Array.isArray(arr)) return false
    const seen = new Set()
    for (const item of arr) {
      const val = resolvePath(fieldPath, item)
      if (val === undefined || val === null) continue
      if (seen.has(val)) return true
      seen.add(val)
    }
    return false
  },
  // 取数组中重复的字段值（用于消息渲染）
  first_duplicate_field: (arr: any[], fieldPath: string) => {
    if (!Array.isArray(arr)) return null
    const seen = new Map()
    for (const item of arr) {
      const val = resolvePath(fieldPath, item)
      if (val === undefined || val === null) continue
      if (seen.has(val)) return val
      seen.set(val, true)
    }
    return null
  },
  // 求和
  sum: (arr: any[]) => Array.isArray(arr) ? arr.reduce((a, b) => a + (Number(b) || 0), 0) : 0,
  // 计数
  count: (arr: any[]) => Array.isArray(arr) ? arr.length : 0,
  // 最大值
  max: (arr: any[]) => Array.isArray(arr) ? Math.max(...arr.map(v => Number(v) || 0)) : 0,
  // 最小值
  min: (arr: any[]) => Array.isArray(arr) ? Math.min(...arr.map(v => Number(v) || 0)) : 0,
}
