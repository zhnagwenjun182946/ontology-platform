/**
 * 智能建库（Auto-Build）
 *
 * 把公司材料文本喂给 DeepSeek，让它一次性输出：
 * - 候选概念（含字段定义）
 * - 候选关系
 * - 候选规则 DSL
 * - 候选 scenario
 *
 * 用户在前端勾选/编辑后，调 commit API 入库。
 */

import { chat, type ChatMessage } from "./llm";

export interface CandidateConcept {
  localName: string;
  labelZh: string;
  labelEn?: string;
  description?: string;
  isCore?: boolean; // 是否建议作为核心概念
  /**
   * 映射到的基础核心概念 localName（如 "Person"），对应 owl:equivalentClass：
   * 领域概念声明与基础本体里的某核心概念等价，commit 时建 ConceptEquivalence。
   * 这样核心概念被领域引用 → 在图谱里连通，不再孤立（成熟本体的分层链接模式）。
   * 仅对存在明确 IS-A/等价关系的概念设置（员工↔Person、单据/申请↔Document、
   * 组织/部门↔Organization、金额↔Money），无明确对应则留空。
   */
  mapsToCore?: string;
  fields: Array<{
    name: string;
    type: string; // string | number | date | ref | array
    required?: boolean;
    label?: string;
    ref?: string;
    itemRef?: string;
    enum?: string[];
  }>;
}

export interface CandidateRelation {
  name: string;
  source: string; // localName
  target: string; // localName
  relationType: string; // CONTAINS | BELONGS_TO | REFERENCES | SUBMIT | APPROVE
  cardinality: string; // 1:1 | 1:N | N:M
  description?: string;
}

export interface CandidateRule {
  code: string;
  name: string;
  severity: "ERROR" | "WARNING" | "INFO";
  target: string; // localName
  targetPath?: string;
  dsl: string; // 完整 DSL YAML
  message: string;
  explanation?: string;
  tags?: string[];
}

export interface CandidateScenario {
  code: string;
  name: string;
  description?: string;
}

/**
 * 受治理标准候选 —— 规则 DSL 里 call 的 std_xxx 函数的取值表。
 * matrix 是嵌套查找表 JSON，下钻顺序 = 规则 call 参数顺序。
 * 例：std_hotel_max(cityCategory, level) 的 matrix：
 *   { "北上广深": { "其他员工": 400, "部门经理/部门副经理级": 600 } }
 */
export interface CandidateStandard {
  code: string;        // 受治理函数名，与规则 call[0] 一致（如 std_hotel_max）
  matrix: any;         // 嵌套查找表（运行时按 call 参数逐层下钻取叶子）
  description?: string;
}

export interface AutoBuildResult {
  concepts: CandidateConcept[];
  relations: CandidateRelation[];
  rules: CandidateRule[];
  scenarios: CandidateScenario[];
  standards: CandidateStandard[];
  // 元信息
  modelSummary?: string;
  raw?: string;
}

export interface AutoBuildResponse {
  ok: boolean;
  result?: AutoBuildResult;
  usage?: any;
  durationMs?: number;
  error?: string;
  raw?: string;
  // 自检告警（如重试后仍有孤立概念）；result 仍会返回，由调用方决定是否提交
  warnings?: string[];
}

/**
 * 可复用核心概念（运行时从 DB 动态查出，注入提示词——不在提示词里写死任何概念名）。
 */
export interface ReusableConcept {
  localName: string;
  labelZh: string;
  description?: string | null;
}

/**
 * 构建 SYSTEM_PROMPT。reusableConcepts 为运行时从 DB 查出的已有核心概念，
 * 动态注入提示词，避免在提示词里写死「Person/Organization/...」这种硬编码清单。
 */
function buildSystemPrompt(reusableConcepts: ReusableConcept[] = []): string {
  const coreList = reusableConcepts.length > 0
    ? reusableConcepts.map(c => `- ${c.localName}（${c.labelZh}${c.description ? `：${c.description}` : ""}）`).join("\n")
    : "（暂无已建核心概念，本领域为首建）";

  return `你是企业本体建模专家。你的任务是根据用户提供的公司业务材料，自动设计一个领域的本体（ontology）。

要求：
1. 输出一个严格的 JSON 对象，包含 concepts / relations / rules / scenarios / standards 五个数组。
2. 概念命名：localName 用 PascalCase（如 Employee、TravelRequest），labelZh 用中文，labelEn 用 PascalCase（不要带空格）。
3. 字段类型必须是：string / number / date / boolean / ref / array。枚举值（enum）必须取自材料里实际出现的值，不要套用示例里的值。
4. 复用已有核心概念（影响图谱连通性与跨领域去重）：
   领域概念若与「平台已有核心概念」（见下方清单）中某个同义/等价（IS-A 关系），设 mapsToCore 指向该核心概念的 localName，
   系统会据此建等价关系（owl:equivalentClass），把领域概念链到核心概念——核心概念因此被引用、在图谱连通，跨领域也自动去重。
   原则：
   - 有同义核心概念就映射，不要新建同义概念又不映射。
   - 领域特有的概念（清单里没有对应的，如某领域特有的费用类型、业务动作）不设 mapsToCore，留空。
   - 宁可多映射（把能对上核心概念的领域概念都链上）也不要漏——漏了核心概念就成孤立节点。

【平台已有核心概念】（运行时从库中动态查出，复用这些而非新建同义概念）：
${coreList}

5. 关系类型必须是：CONTAINS / BELONGS_TO / REFERENCES / SUBMIT / APPROVE 之一。

【关系完整性 —— 硬性约束，必须满足】
同一领域内的所有概念必须通过关系连通成一张图，不允许出现孤立概念（没有任何关系连到它的概念）。不相干的概念根本不应出现在同一个领域里——既然放进来，就必须有关系把它挂到领域图上。具体要求：
  - 每个概念至少出现在一条 relation 的 source 或 target 里（degree ≥ 1）。
  - 主/单据概念（如 TravelRequest、ExpenseReport、申请单）通过 SUBMIT 连到发起人（Employee），并 CONTAINS 其下所有明细概念。
  - 每个明细概念（如各项费用 AccommodationFee / MealFee / TransportationFee、明细行）必须被它的主单据 CONTAINS（即作为某条 CONTAINS relation 的 target），不能孤立。
  - ref 字段引用的概念（如 applicant→Employee）若该概念已在本领域，不必再为引用单独建关系；但被引用概念本身仍需通过其他关系连通。
  - 输出前自检：遍历 concepts，任一概念若不在任何 relation 中，补一条合理的关系（通常是 CONTAINS 挂到主单据，或 SUBMIT 连到 Employee），使其连通。
6. 规则 DSL 必须遵守以下语法（重要！）：
   - when 子句支持：
     * isEmpty(path) / isNotEmpty(path) / exists(path)
     * path == "字符串" / path != "x" / path > 100 / path >= 100 / path < 100 / path <= 100
     * path in [a, b, c] / path not_in [a, b]
     * func(args)  # 受治理函数调用，如 amount > std_xxx(dim1, dim2)
     * all: [条件列表]  # 且
     * any: [条件列表]  # 或
     * not (条件)
   - 字符串字面量必须用双引号
   - message 用 {{path}} 插值
   - 多行 explanation 用 | 块标量
   - targetPath（重要！）：当规则作用于"明细类概念"时，targetPath 必须写成"<对应数组字段名>[*]"使其逐条遍历。字段名 = 概念名转复数（AccommodationFee → accommodationFees）。示例：target: AccommodationFee, targetPath: accommodationFees[*]。不写 targetPath 的规则会在整单层求值一次。
   - 引用业务属性时直接用顶层概念字段（如 employee.level），不要走 ref 字段路径（如 travelRequest.applicant.level）——ref 字段（applicant/buyer 等）只携带 {id,name} 用于关联，不含 level/department 等业务属性，走 ref 路径会取不到值导致规则不触发。
6. 规则 severity 必须是 error / warning / info 之一（小写）。
7. 至少产出 3 个概念、2 条规则。关系数量无下限硬要求，但必须满足上面的「关系完整性」约束：所有概念连通，每个明细被 CONTAINS（通常 relations 数 ≥ concepts 数 - 1）。

【受治理标准（standards）—— 重点】
材料里常有"按城市×职级的住宿上限""按餐别×职级的餐标"这类数值标准表。这些数值是数据、不是代码，必须抽到 standards 数组里，供规则 DSL 通过受治理函数 call 取用，绝对不要把具体限额写进规则文本或硬编码。
每个 standard：
  - code：受治理函数名，与规则 call[0] 一致（如 std_hotel_max、std_meal_max）。命名用 std_ 前缀 + 语义。
  - matrix：嵌套查找表对象，下钻顺序 = 规则 call 的参数顺序。
    例：规则 when 里 amount > std_hotel_max(cityCategory, applicant.level)，
    则 matrix = { "北上广深": { "其他员工": 400, "部门经理/部门副经理级": 600 }, "省会直辖市": { ... } }。
    叶子值必须是 number。
  - matrix 的键必须与材料里的枚举值/维度值完全一致（城市类别、职级、餐别等），不要编造或套用示例值。
规则 call 的参数个数必须与 matrix 的嵌套层数一致。一个 code 对应一个 standard（一个 matrix 覆盖所有维度组合）。
若材料没有对应标准表，就不要造该 standard，相关规则也不要 call 不存在的 std_xxx。

【scenarios（使用场景/Action）抽取规则 —— 重点】
一个业务领域通常有多个"使用场景"，每个场景对应材料中描述的一个具体业务动作（Action）。
你必须通读材料，把材料里出现过的每一个独立业务动作都识别为一个 scenario，而不是只给一个笼统的"提交校验"。
常见动作来源包括但不限于：
- 制度流程中各办理环节（如"出差申请"、"费用报销"、"暂借款申请"等）
- 材料中明确列出的"动作一/动作二"或编号动作，每个动作应单独成一个 scenario
对每个 scenario：code 用 snake_case 英文，name 用中文动作名，description 说明该动作触发什么校验。通常一个领域应识别出 3 个以上 scenario。

输出 JSON Schema（字段值为结构演示，实际值取自材料）：
{
  "concepts": [
    {
      "localName": "Employee",
      "labelZh": "员工",
      "labelEn": "Employee",
      "description": "业务材料中的员工",
      "mapsToCore": "Person",
      "fields": [
        { "name": "id", "type": "string", "required": true, "label": "工号" },
        { "name": "name", "type": "string", "required": true, "label": "姓名" },
        { "name": "level", "type": "string", "label": "职级", "enum": ["<取自材料>"] }
      ]
    }
  ],
  "relations": [
    { "name": "提交", "source": "Employee", "target": "TravelRequest", "relationType": "SUBMIT", "cardinality": "1:N", "description": "员工提交出差申请" }
  ],
  "rules": [
    {
      "code": "R-AC-001",
      "name": "住宿费超标",
      "severity": "warning",
      "target": "AccommodationFee",
      "targetPath": "accommodationFees[*]",
      "dsl": "- id: R-AC-001\\n  name: 住宿费超标\\n  severity: warning\\n  target: AccommodationFee\\n  targetPath: accommodationFees[*]\\n  when:\\n    amount > std_hotel_max(cityCategory, travelRequest.applicant.level)\\n  message: \\"住宿费{{amount}}元超过标准\\"\\n  explanation: |\\n    住宿费按城市类别与职级有上限\\n  tags: [住宿, 超标]",
      "message": "住宿费{{amount}}元超过标准",
      "explanation": "住宿费按城市类别与职级有上限",
      "tags": ["住宿","超标"]
    }
  ],
  "scenarios": [
    { "code": "submit_travel_request", "name": "提交出差申请", "description": "出差前提交审批单" }
  ],
  "standards": [
    {
      "code": "std_hotel_max",
      "matrix": { "北上广深": { "其他员工": 400, "部门经理/部门副经理级": 600 }, "省会直辖市": { "其他员工": 350, "部门经理/部门副经理级": 500 } },
      "description": "住宿费上限（元/间/天），按城市类别×职级"
    }
  ]
}

注意：DSL 字符串里的换行用 \\n 转义，双引号用 \\" 转义。standards.matrix 里的数值与维度键必须取自材料，不要套用本示例的数字。`;
}

/**
 * 找出没有任何关系连接的孤立概念（领域内不应出现）。
 * ref 字段引用的本领域概念也算「已被引用」，不强制为它单独建关系。
 * 返回孤立的 localName 列表。
 */
export function findIsolatedConcepts(
  concepts: CandidateConcept[],
  relations: CandidateRelation[],
): string[] {
  const related = new Set<string>();
  for (const r of relations) {
    if (r.source) related.add(r.source);
    if (r.target) related.add(r.target);
  }
  const localNames = new Set(concepts.map((c) => c.localName));
  for (const c of concepts) {
    for (const f of c.fields ?? []) {
      if (f.ref && localNames.has(f.ref)) related.add(f.ref);
    }
  }
  return concepts.filter((c) => !related.has(c.localName)).map((c) => c.localName);
}

/**
 * 调 DeepSeek 让它根据材料生成本体候选。
 * 自检：发现孤立概念时，把原始输出 + 问题作为补充信息回喂 LLM 重新生成（最多重试 2 次）。
 */
export async function autoBuildOntology(
  materials: string,
  domainHint?: { code?: string; name?: string; description?: string },
  reusableConcepts?: ReusableConcept[],
): Promise<AutoBuildResponse> {
  const start = Date.now();
  const MAX_RETRIES = 2;

  const systemPrompt = buildSystemPrompt(reusableConcepts);
  const userPrompt = [
    domainHint?.name ? `领域名称：${domainHint.name}` : "",
    domainHint?.code ? `领域 code：${domainHint.code}` : "",
    domainHint?.description ? `领域描述：${domainHint.description}` : "",
    "",
    "公司业务材料：",
    "```",
    materials,
    "```",
  ].filter(Boolean).join("\n");

  // 单次「调 LLM → 解析 → 规范化」
  async function callAndNormalize(messages: ChatMessage[]): Promise<
    { ok: true; result: AutoBuildResult; usage: any; durationMs: number } | { ok: false; raw?: string; error: string; durationMs: number }
  > {
    const { text: raw, usage, durationMs } = await chat(messages, {
      jsonMode: true, temperature: 0.2, maxTokens: 12288,
    });
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      const m = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
      if (m) { try { data = JSON.parse(m[1]); } catch {} }
    }
    if (!data || typeof data !== "object") {
      console.error(`[AutoBuild] JSON 解析失败，raw 前 500 字符：${raw.slice(0, 500)}`);
      return { ok: false, raw, error: "LLM 返回不是合法 JSON", durationMs };
    }
    const result: AutoBuildResult = {
      concepts: Array.isArray(data.concepts) ? data.concepts.map(normalizeConcept) : [],
      relations: Array.isArray(data.relations) ? data.relations.map(normalizeRelation) : [],
      rules: Array.isArray(data.rules) ? data.rules.map(normalizeRule) : [],
      scenarios: Array.isArray(data.scenarios) ? data.scenarios.map(normalizeScenario) : [],
      standards: Array.isArray(data.standards) ? data.standards.map(normalizeStandard) : [],
      modelSummary: data.modelSummary,
      raw,
    };
    return { ok: true, result, usage, durationMs };
  }

  try {
    let messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
    let totalMs = 0;
    let lastUsage: any;
    let result: AutoBuildResult | null = null;
    let lastRaw = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const r = await callAndNormalize(messages);
      if (!r.ok) return { ok: false, raw: r.raw, error: r.error, durationMs: totalMs + r.durationMs };
      result = r.result;
      lastRaw = r.result.raw ?? "";
      lastUsage = r.usage;
      totalMs += r.durationMs;

      const isolated = findIsolatedConcepts(r.result.concepts, r.result.relations);
      console.log(`[AutoBuild] 领域=${domainHint?.code ?? '-'} 第${attempt + 1}次 耗时=${r.durationMs}ms 孤立概念=${isolated.length ? isolated.join(",") : "无"}`);

      if (isolated.length === 0) {
        // 全连通，直接返回
        return { ok: true, result, usage: lastUsage, durationMs: totalMs };
      }

      if (attempt < MAX_RETRIES) {
        // 把原始输出 + 检查出的问题回喂，要求在原输出基础上补关系
        messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
          { role: "assistant", content: lastRaw },
          {
            role: "user",
            content: [
              "你上次的输出未通过关系完整性校验：以下概念没有任何关系连接（孤立），不符合「领域内所有概念必须连通成一张图」的约束：",
              isolated.map((n) => `- ${n}`).join("\n"),
              "",
              "请在「上次输出」的基础上修正 relations，使每个概念都连通：",
              "- 明细概念（费用/明细行）用 CONTAINS 挂到它的主单据；",
              "- 主单据用 SUBMIT 连到 Employee；",
              "- concepts / rules / scenarios / standards 尽量保持不变，只补/改 relations（除非确有必要才动其他数组）。",
              "",
              "只返回修正后的完整 JSON 对象（包含 concepts/relations/rules/scenarios/standards 五个数组），不要任何解释。",
            ].join("\n"),
          },
        ];
      }
    }

    // 重试后仍有孤立：返回最后一次结果，但标注 warnings（提交时 commit 校验会再次拦截）
    const isolated = result ? findIsolatedConcepts(result.concepts, result.relations) : [];
    return {
      ok: true,
      result: result!,
      usage: lastUsage,
      durationMs: totalMs,
      warnings: isolated.length > 0
        ? [`关系完整性校验：重试 ${MAX_RETRIES} 次后仍有孤立概念：${isolated.join("、")}`]
        : undefined,
    };
  } catch (e: any) {
    return { ok: false, error: e.message, durationMs: Date.now() - start };
  }
}

function normalizeConcept(c: any): CandidateConcept {
  return {
    localName: String(c.localName ?? c.name ?? "Unknown"),
    labelZh: String(c.labelZh ?? c.label ?? c.localName ?? "未命名"),
    labelEn: c.labelEn ? String(c.labelEn) : undefined,
    description: c.description ? String(c.description) : undefined,
    isCore: !!c.isCore,
    mapsToCore: c.mapsToCore ? String(c.mapsToCore) : undefined,
    fields: Array.isArray(c.fields) ? c.fields.map((f: any) => ({
      name: String(f.name ?? "field"),
      type: String(f.type ?? "string"),
      required: !!f.required,
      label: f.label ? String(f.label) : undefined,
      ref: f.ref ? String(f.ref) : undefined,
      itemRef: f.itemRef ? String(f.itemRef) : undefined,
      enum: Array.isArray(f.enum) ? f.enum.map(String) : undefined,
    })) : [],
  };
}

function normalizeRelation(r: any): CandidateRelation {
  return {
    name: String(r.name ?? "关联"),
    source: String(r.source ?? r.from ?? ""),
    target: String(r.target ?? r.to ?? ""),
    relationType: String(r.relationType ?? r.type ?? "REFERENCES").toUpperCase(),
    cardinality: String(r.cardinality ?? "1:N"),
    description: r.description ? String(r.description) : undefined,
  };
}

function normalizeRule(r: any): CandidateRule {
  return {
    code: String(r.code ?? `R-${Math.random().toString(36).slice(2, 6).toUpperCase()}`),
    name: String(r.name ?? "未命名规则"),
    severity: (String(r.severity ?? "warning").toUpperCase()) as "ERROR" | "WARNING" | "INFO",
    target: String(r.target ?? ""),
    targetPath: r.targetPath ? String(r.targetPath) : undefined,
    dsl: String(r.dsl ?? ""),
    message: String(r.message ?? ""),
    explanation: r.explanation ? String(r.explanation) : undefined,
    tags: Array.isArray(r.tags) ? r.tags.map(String) : undefined,
  };
}

function normalizeScenario(s: any): CandidateScenario {
  return {
    code: String(s.code ?? "validate"),
    name: String(s.name ?? "校验场景"),
    description: s.description ? String(s.description) : undefined,
  };
}

function normalizeStandard(s: any): CandidateStandard {
  // matrix 必须是对象（嵌套查找表）；不是对象则丢弃，避免脏数据进库
  const matrix = (s.matrix && typeof s.matrix === "object" && !Array.isArray(s.matrix)) ? s.matrix : {};
  return {
    code: String(s.code ?? ""),
    matrix,
    description: s.description ? String(s.description) : undefined,
  };
}
