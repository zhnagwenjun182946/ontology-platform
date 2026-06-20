# Agent API 接口文档（v1）

> 本体平台为上游 Agent / 业务系统提供的 API 接口。所有接口需 API Key 鉴权。

## 鉴权

所有 `/api/v1/` 接口需要 API Key，通过以下任一方式传递：

```
X-API-Key: <your-api-key>
```
或
```
Authorization: Bearer <your-api-key>
```

> API Key 在首次启动时自动生成（见控制台日志），或通过环境变量 `DEFAULT_API_KEY` 设置。

---

## 1. 运行校验（带记录）

`POST /api/v1/runs`

上游 Agent 传业务文本或结构化数据，平台完成 LLM 抽取 → 规则校验 → 落库 → 返回结果。

### 请求

```json
{
  "scenarioId": "cmqm1rn8i001z8ovkxqhxnfhf",
  "mode": "text",
  "text": "员工赵志刚出差报销，住宿费900元...",
  "report": true
}
```

| 参数 | 必填 | 说明 |
|:---|:---|:---|
| scenarioId | 是 | 场景 ID（通过 GET /api/v1/scenarios 获取） |
| mode | 否 | `text`（传文本，LLM 抽取）或 `json`（传结构化数据），默认 text |
| text | mode=text 时 | 业务材料原文 |
| payload | mode=json 时 | 结构化数据对象 |
| report | 否 | 是否返回 Markdown 运行报告，默认 false |

### 响应

```json
{
  "ok": true,
  "runId": "cmqmb32j...",
  "status": "SUCCESS",
  "passed": false,
  "summary": {
    "totalFindings": 2,
    "errors": 0,
    "warnings": 2,
    "infos": 0,
    "extractedCount": 3,
    "ruleCount": 6
  },
  "findings": [
    {
      "ruleCode": "R-EXP-002",
      "severity": "WARNING",
      "targetPath": "lines[0]",
      "field": "lines[0]",
      "value": { "type": "住宿", "amount": 900, "city": "上海" },
      "message": "上海 住宿 900 元超过标准，需部门经理额外审批",
      "suggestion": "建议确认是否需要额外审批",
      "context": { "type": "住宿", "amount": 900 }
    }
  ],
  "extracted": [
    { "id": "...", "conceptLabel": "ExpenseReport", "jsonPayload": {...} }
  ],
  "extraction": { "ok": true, "durationMs": 178, "usage": { "prompt_tokens": 1200 } },
  "report": "# 运行报告：报销提交校验\n..."
}
```

---

## 2. 无副作用校验（不落库）

`POST /api/v1/validate`

与 `/api/v1/runs` 相同的校验逻辑，但不写数据库。适合实时拦截场景。

### 响应

```json
{
  "ok": true,
  "passed": false,
  "summary": { "totalFindings": 2, "errors": 0, "warnings": 2, "ruleCount": 6 },
  "findings": [...]
}
```

---

## 3. 查询领域目录

`GET /api/v1/domains`

返回所有领域及其场景列表，Agent 用它选择 scenarioId。

```json
{
  "ok": true,
  "domains": [
    {
      "id": "...", "code": "reimbursement", "name": "办公报销",
      "conceptCount": 8, "rulesetCount": 2,
      "scenarios": [
        { "id": "...", "code": "validate_submission", "name": "报销提交校验" }
      ]
    }
  ]
}
```

---

## 4. 查询场景列表

`GET /api/v1/scenarios?domainCode=reimbursement`

---

## 5. 查询概念 JSON Schema

`GET /api/v1/schemas/:concept`

`:concept` 可以是 concept id、uri、labelEn 或 labelZh。

```json
{
  "ok": true,
  "concept": { "uri": "exp_v4:Loan", "labelZh": "暂借款", "scope": "DOMAIN" },
  "jsonSchema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "暂借款",
    "type": "object",
    "properties": {
      "loanId": { "type": "string", "description": "借款编号" },
      "amount": { "type": "number", "description": "借款金额" }
    },
    "required": ["loanId", "amount"]
  }
}
```

---

## 典型接入流程

```
1. GET /api/v1/domains          → 选择领域和场景，拿到 scenarioId
2. GET /api/v1/schemas/ExpenseReport → 了解数据结构（可选）
3. POST /api/v1/runs             → 传文本/数据，拿校验结果
4. 根据 findings 回复用户或拦截操作
```
