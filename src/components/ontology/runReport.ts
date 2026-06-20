/**
 * 运行报告生成 —— 从运行结果构造 Markdown 格式报告（不依赖 AI）。
 */

export interface ReportFinding {
  ruleCode?: string | null
  severity: string
  targetPath?: string | null
  message: string
  contextJson?: string
  rule?: { code: string; name: string; severity: string } | null
}

export interface ReportExtracted {
  id: string
  conceptLabel?: string | null
  jsonPayload: any
}

export interface ReportRunData {
  id: string
  status: string
  summary?: string | null
  startedAt: string
  finishedAt?: string | null
  error?: string | null
  inputDocuments?: string
  extractionMeta?: string | null
  scenario?: { name: string; domain?: { code: string; nameZh: string } | null } | null
  findings: ReportFinding[]
  extracted: ReportExtracted[]
}

const SEVERITY_LABEL: Record<string, string> = {
  ERROR: '错误',
  WARNING: '警告',
  INFO: '提示',
}

/**
 * 生成运行报告 Markdown
 */
export function generateRunReport(run: ReportRunData): string {
  const lines: string[] = []
  const scenarioName = run.scenario?.name ?? '未知场景'
  const domainName = run.scenario?.domain?.nameZh ?? '未知领域'
  const startTime = fmtTime(run.startedAt)
  const duration = run.finishedAt
    ? `${Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 100) / 10}s`
    : '-'

  // ===== 标题 =====
  lines.push(`# 运行报告：${scenarioName}`)
  lines.push('')

  // ===== 概览 =====
  lines.push('## 运行概览')
  lines.push('')
  lines.push(`| 项目 | 值 |`)
  lines.push(`|:---|:---|`)
  lines.push(`| 场景 | ${scenarioName} |`)
  lines.push(`| 领域 | ${domainName} |`)
  lines.push(`| 运行状态 | ${run.status === 'SUCCESS' ? '✅ 成功' : run.status === 'FAILED' ? '❌ 失败' : run.status} |`)
  lines.push(`| 开始时间 | ${startTime} |`)
  lines.push(`| 耗时 | ${duration} |`)
  lines.push(`| 抽取实体数 | ${run.extracted.length} |`)
  lines.push(`| 规则命中数 | ${run.findings.length} |`)

  // LLM 元信息
  if (run.extractionMeta) {
    try {
      const meta = JSON.parse(run.extractionMeta)
      if (meta.usage) {
        lines.push(`| LLM Prompt Tokens | ${meta.usage.prompt_tokens ?? '-'} |`)
        lines.push(`| LLM Completion Tokens | ${meta.usage.completion_tokens ?? '-'} |`)
      }
      if (meta.durationMs != null) {
        lines.push(`| LLM 抽取耗时 | ${meta.durationMs}ms |`)
      }
    } catch { /* ignore */ }
  }
  lines.push('')

  // 错误信息
  if (run.error) {
    lines.push('## ❌ 运行错误')
    lines.push('')
    lines.push('```')
    lines.push(run.error)
    lines.push('```')
    lines.push('')
  }

  // ===== 校验结果汇总 =====
  const errorCount = run.findings.filter(f => f.severity === 'ERROR').length
  const warnCount = run.findings.filter(f => f.severity === 'WARNING').length
  const infoCount = run.findings.filter(f => f.severity === 'INFO').length

  lines.push('## 校验结果汇总')
  lines.push('')
  if (run.findings.length === 0) {
    lines.push('✅ **所有规则校验通过，未发现违规。**')
  } else {
    lines.push(`本次运行共命中 **${run.findings.length}** 条规则：`)
    lines.push('')
    if (errorCount > 0) lines.push(`- 🔴 错误（ERROR）：**${errorCount}** 条`)
    if (warnCount > 0) lines.push(`- 🟡 警告（WARNING）：**${warnCount}** 条`)
    if (infoCount > 0) lines.push(`- 🔵 提示（INFO）：**${infoCount}** 条`)
  }
  lines.push('')

  // ===== 违规明细 =====
  if (run.findings.length > 0) {
    lines.push('## 违规明细')
    lines.push('')

    // 按严重级别排序
    const sorted = [...run.findings].sort((a, b) => {
      const order: Record<string, number> = { ERROR: 0, WARNING: 1, INFO: 2 }
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
    })

    sorted.forEach((f, i) => {
      const code = f.ruleCode ?? f.rule?.code ?? '未知规则'
      const sevLabel = SEVERITY_LABEL[f.severity] ?? f.severity
      const sevIcon = f.severity === 'ERROR' ? '🔴' : f.severity === 'WARNING' ? '🟡' : '🔵'
      const target = f.targetPath ? ` \`${f.targetPath}\`` : ''

      lines.push(`### ${i + 1}. ${sevIcon} [${code}] ${f.message}`)
      lines.push('')
      lines.push(`- **严重级别**：${sevLabel}（${f.severity}）`)
      if (f.targetPath) lines.push(`- **定位路径**：\`${f.targetPath}\``)
      if (f.rule?.name) lines.push(`- **规则名称**：${f.rule.name}`)
      lines.push('')

      // 上下文数据
      if (f.contextJson && f.contextJson !== '{}') {
        lines.push('**上下文数据**：')
        lines.push('```json')
        try {
          lines.push(JSON.stringify(JSON.parse(f.contextJson), null, 2))
        } catch {
          lines.push(f.contextJson)
        }
        lines.push('```')
        lines.push('')
      }
    })
  }

  // ===== 抽取实体清单 =====
  if (run.extracted.length > 0) {
    lines.push('## 抽取实体清单')
    lines.push('')
    lines.push(`本次运行共抽取 **${run.extracted.length}** 个实体：`)
    lines.push('')

    // 按概念类型分组
    const groups = new Map<string, ReportExtracted[]>()
    for (const e of run.extracted) {
      const label = e.conceptLabel || '未分类'
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label)!.push(e)
    }

    for (const [label, items] of groups) {
      lines.push(`### ${label}（${items.length} 个）`)
      lines.push('')
      items.forEach((e, i) => {
        const payload = e.jsonPayload
        // 取关键字段摘要
        const summary = summarizePayload(payload)
        lines.push(`${i + 1}. ${summary}`)
        lines.push('')
        lines.push('<details><summary>完整数据</summary>')
        lines.push('')
        lines.push('```json')
        try {
          lines.push(JSON.stringify(typeof payload === 'string' ? JSON.parse(payload) : payload, null, 2))
        } catch {
          lines.push(typeof payload === 'string' ? payload : JSON.stringify(payload))
        }
        lines.push('```')
        lines.push('')
        lines.push('</details>')
        lines.push('')
      })
    }
  }

  // ===== 原始输入 =====
  if (run.inputDocuments && run.inputDocuments !== '[]') {
    lines.push('## 原始输入材料')
    lines.push('')
    lines.push('<details><summary>点击展开</summary>')
    lines.push('')
    try {
      const docs = JSON.parse(run.inputDocuments)
      if (Array.isArray(docs)) {
        docs.forEach((doc, i) => {
          if (i > 0) lines.push('---')
          if (typeof doc === 'string') {
            lines.push(doc)
          } else {
            lines.push('```json')
            lines.push(JSON.stringify(doc, null, 2))
            lines.push('```')
          }
          lines.push('')
        })
      }
    } catch {
      lines.push(run.inputDocuments)
    }
    lines.push('')
    lines.push('</details>')
    lines.push('')
  }

  // ===== 页脚 =====
  lines.push('---')
  lines.push(`*报告生成时间：${new Date().toLocaleString('zh-CN')} · 运行 ID：${run.id}*`)

  return lines.join('\n')
}

// ============ 工具函数 ============

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN')
  } catch {
    return iso
  }
}

function summarizePayload(payload: any): string {
  if (!payload || typeof payload !== 'object') return String(payload)
  const p = typeof payload === 'string' ? (() => { try { return JSON.parse(payload) } catch { return {} } })() : payload
  const parts: string[] = []
  // 常见标识字段
  for (const k of ['name', 'id', 'loanId', 'number', 'code']) {
    if (p[k] != null) parts.push(`${k}=\`${p[k]}\``)
  }
  // 业务字段
  for (const k of ['type', 'amount', 'city', 'level', 'status', 'department']) {
    if (p[k] != null) parts.push(`${k}=\`${p[k]}\``)
  }
  // 嵌套对象的 name/id
  for (const k of ['borrower', 'employee', 'submitter', 'applicant']) {
    if (p[k] && typeof p[k] === 'object') {
      if (p[k].name) parts.push(`${k}=\`${p[k].name}\``)
      else if (p[k].id) parts.push(`${k}=\`${p[k].id}\``)
    }
  }
  return parts.length > 0 ? parts.join(' · ') : '(无关键字段)'
}
