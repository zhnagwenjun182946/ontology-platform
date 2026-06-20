/**
 * Agent 接口（/api/v1/）的共享类型。
 *
 * 结构化 Finding 参考 SHACL Validation Report 规范：
 * - ruleCode: 规则编码
 * - severity: ERROR | WARNING | INFO
 * - targetPath: 违规定位路径（如 lines[0]）
 * - field: 违规字段名
 * - value: 违规实际值
 * - constraint: 约束描述（如 "<= 600"）
 * - message: 人类可读消息
 * - suggestion: 可操作的修复建议（可选）
 */

export interface AgentFinding {
  ruleCode: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  targetPath: string | null
  field?: string | null
  value?: any
  constraint?: string | null
  message: string
  suggestion?: string | null
  context?: any
}

export interface AgentRunResponse {
  ok: boolean
  runId: string
  status: string
  passed: boolean
  summary: {
    totalFindings: number
    errors: number
    warnings: number
    infos: number
    extractedCount: number
    ruleCount: number
  }
  findings: AgentFinding[]
  extracted: Array<{
    id: string
    conceptLabel: string | null
    jsonPayload: any
  }>
  extraction?: {
    ok: boolean
    durationMs?: number
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
    }
  } | null
  report?: string  // Markdown 运行报告
}

export interface AgentValidateResponse {
  ok: boolean
  passed: boolean
  summary: {
    totalFindings: number
    errors: number
    warnings: number
    infos: number
    ruleCount: number
  }
  findings: AgentFinding[]
}
