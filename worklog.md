# 企业级本体平台 v2 · 工作日志

---
Task ID: 1
Agent: 主代理 (orchestrator)
Task: 重设计企业级本体平台，写新设计文档 + 落地 Next.js 实现

Work Log:
- 阅读上传的 PROJECT_GUIDE.md (v1)，识别用户痛点：不打包发布、去重聚合、人能看懂的规则 DSL
- 撰写新版设计文档 `/home/z/my-project/ONTOLOGY_PLATFORM_DESIGN.md`
  - 提出"在线编辑 + 注册中心 + 快照冻结"取代打包发布
  - 设计"核心本体 + 领域本体 + 等价聚合"两层结构
  - 设计 Rule DSL（YAML 风格，可编译 SHACL，可读中文渲染）
  - 三层去重算法（URI / 别名 / 字段指纹）
- 设计 Prisma schema：Concept / ConceptAlias / ConceptEquivalence / Domain / DomainConcept / DomainRelation / RuleSet / Rule / RuleTest / Scenario / RunRecord / ExtractedObject / Finding / AuditLog
- 实现 Rule DSL 解析器 `src/lib/dsl/parser.ts`：
  - 自实现极简 YAML 子集解析（不引入新依赖）
  - WhenExpr / Expr 类型化 AST
  - renderRuleHumanReadable：渲染成中文可读句子
  - evaluateWhen：执行表达式，支持路径、比较、逻辑、受治理函数调用
  - compileToShacl：编译成简化版 SHACL TTL
  - builtinFunctions：内置 std_hotel_max / std_meal_max / entertainment_max / is_workday
- 实现种子数据 `src/lib/seed.ts`：4 个核心概念 + 报销领域（5 概念/4 关系/6 规则）+ 采购领域（3 概念/2 规则）+ 2 个场景
- 实现 14 个 API 路由：
  - /api/init /api/stats
  - /api/concepts, /api/concepts/[id], /api/concepts/[id]/equivalences
  - /api/domains, /api/domains/[id]
  - /api/rulesets, /api/rules, /api/rules/[id] (GET/PUT/POST compile/test/evaluate)
  - /api/aggregation/map, /api/aggregation/concepts/[id]/usages, /api/aggregation/domains/[id]/overlap
  - /api/scenarios, /api/runs, /api/runs/[id], /api/runs/[id]/findings
  - /api/design-doc
- 验证后端：curl /api/init 成功注入 12 概念 / 2 领域 / 8 规则 / 2 场景
- 验证 /api/aggregation/map：聚合后 10 个簇，"人员"簇成功合并 core:Person + reimbursement:Employee + procurement:Buyer

Stage Summary:
- 设计文档完整，明确"去打包化 + 去重聚合 + 人能读 DSL"三大方向
- 后端全部 API 跑通，数据库种子就绪
- 准备开始构建前端 8 个 tab：Dashboard / 概念仓库 / 本体图谱 / 规则引擎 / 场景试运行 / 运行记录 / 设计文档
- 前端将委托给 full-stack-developer 子代理并行实现

---
Task ID: 5
Agent: full-stack-developer
Task: 构建本体平台前端 8 个 tab（单页应用，仅 `/` 路由）

Work Log:
- 阅读上下文：`worklog.md`（Task 1 设计 + 后端已就绪）、`ONTOLOGY_PLATFORM_DESIGN.md`、14 个 API 路由、`prisma/schema.prisma`、`lib/seed.ts`、`src/components/ui/` 已有 shadcn 组件
- 全局主题：更新 `src/app/globals.css` 把 primary 改为 emerald-600、accent 改为 amber-500、destructive 改为 rose-500；chart 色板改为 emerald/amber/rose/slate；新增 `.scrollbar-thin` 工具类
- 全局布局：新建 `ThemeProvider` 包装 next-themes；更新 `layout.tsx` 挂载 ThemeProvider + Sonner Toaster + 中文 metadata + `lang="zh-CN"`；重写 `page.tsx` 仅挂载 `<AppShell/>`
- 共享层：`lib.ts`（领域色 / severity / 状态徽章 / 时间格式化 / jsonSchema 解析 / `api()` 客户端）；`hooks.ts`（`useFetch` + `usePlatformInit`）；`primitives.tsx`（Loading/Error/Empty/SectionCard/PageHeader/各 Badge/KpiCard）
- AppShell：`min-h-screen flex flex-col` 根布局；Header h-14 sticky（logo + 面包屑 + 主题切换）；Sidebar w-60 + 移动端 Sheet；8 个 NavItem 分 4 组；Footer mt-auto；启动时调 `/api/init` 用 sonner 反馈
- Tab 1 Dashboard：欢迎区 + 6 KPI 卡 + 领域覆盖网格 + recharts 严重度饼图 + 最近运行表
- Tab 2 概念仓库（核心）：顶部 Tab 切换"原始列表/聚合视图"；左列表（搜索 + scope 筛选）右详情（基本信息 + 字段表 + 等价关系 + 别名带置信度 + 被引用规则）；聚合视图每簇一卡，"人员"簇显示 3 成员
- Tab 3 本体图谱：纯 SVG 自绘，核心概念居中圆环，领域概念按域扇形分布；等价虚线（CONFIRMED=灰/PROPOSED=紫）+ 关系实线箭头；节点点击右侧 320px 详情卡；图例 + 缩放控制
- Tab 4 规则引擎（核心）：左规则列表按 ruleset 分组 + severity 筛选；右详情含三视图 Tab（可读渲染卡片 / DSL Textarea 可保存 / SHACL 编译只读）+ 试运行区（JSON ctx + 求值显示命中/未命中 + 渲染后 message）
- Tab 5 场景试运行：3 步向导（场景网格 → JSON 编辑器含示例预填 → 结果摘要 + Findings 列表按 severity 排序可展开 context + 抽取对象）
- Tab 6 运行记录：列表筛选 + 行点击 Sheet 抽屉调 `/api/runs/[id]` 显示完整 Findings + 抽取对象（Tab 切换）
- Tab 7 设计文档：react-markdown 渲染 + 左侧 sticky TOC（IntersectionObserver 高亮当前节）+ react-syntax-highlighter Prism 代码块
- Tab 8 关于：Hero + 三大创新点卡 + v1↔v2 对比流程 + 去重聚合 SVG 示意 + DSL 三视图示意 + 技术栈网格
- 验证：`bun run lint` 0 errors 0 warnings；`curl /` HTTP 200；端到端 POST /api/runs 跑报销示例得 6 Findings + 4 抽取对象；`/api/aggregation/map` "人员"簇含 3 成员（core:Person + reimbursement:Employee + procurement:Buyer）；dev.log 无前端运行时错误

Stage Summary:
- 产物清单（新增 13 个文件）：`src/components/ontology/{ThemeProvider,lib,hooks,primitives,AppShell,Dashboard,ConceptRepo,OntologyGraph,RuleEngine,ScenarioRun,RunHistory,DesignDoc,About}.tsx`
- 产物清单（修改 3 个文件）：`src/app/globals.css`、`src/app/layout.tsx`、`src/app/page.tsx`
- 8 个 Tab 全部实现，统一 emerald/amber/slate/rose 配色，支持 light/dark 主题，移动端 Sheet 抽屉式 sidebar
- 全部数据走 `fetch('/api/...')`，无 server actions；每个 Tab 都有 loading/error/empty 三态
- 详细工作记录见 `/agent-ctx/5-full-stack-developer.md`
- 遗留问题（后端范畴，与前端无关）：`renderMessage` 在 lines[*] 规则下未插值 `{{path}}`；R-EXP-004/005 在字段已提供时仍触发，疑似 `isEmpty()` 求值 bug —— 前端按原样展示，后端修复后前端无需改动


---
Task ID: 6 + 8 (主代理收尾)
Agent: 主代理 (orchestrator)
Task: 端到端验证 + 修复子代理遗留的后端 bug

Work Log:
- 接手 full-stack-developer 子代理的前端产物，跑 lint 通过
- 用 agent-browser 验证 8 个 tab：
  - Dashboard ✓ (KPI / 领域覆盖 / 饼图 / 最近运行)
  - 概念仓库 ✓ (原始列表 + 聚合视图切换)
  - 本体图谱 ✓
  - 规则引擎 ✓ (可读 / DSL / SHACL 三视图)
  - 场景试运行 ✓ (3 步向导，4 findings 全部命中)
  - 运行记录 ✓
  - 设计文档 ✓ (markdown + TOC)
  - 关于 ✓
- 子代理报告了 2 个后端 bug，自己又发现 2 个：
  1. DSL 解析器不支持内联表达式 `isEmpty(submitter)` / `type == "住宿"`
  2. DSL 解析器 parseScalar 不区分"带引号字符串字面量"和"路径"，导致 call 函数参数被误解析
  3. /api/concepts/[id] 缺少 _count include
  4. DomainRelation 缺少 sourceDomainConcept/targetDomainConcept 关系字段
- 修复 1：新增 parseInlineWhen/parseInlineExpr 函数
  - 支持 `isEmpty(path)` / `func(args)` / `a op b` / `not (expr)` / 裸路径
  - YAML 解析器单行标量场景识别（不含 `:` 的行当标量）
  - parseDsl 支持 list 和 object 两种 YAML 顶层
- 修复 2：Expr 类型新增 `{ literal: string }` 区分字符串字面量
  - parseScalar 对带引号字符串返回 `{ __literal: true, value }` 标记
  - normalizeExpr 把 __literal 转 `{ literal: value }`
  - evalExpr/renderExpr 支持 literal 类型
  - normalizeDsl 用 unwrapLiteral 还原字符串字段
- 修复 3：/api/concepts/[id] 加 `_count: { select: { rulesAsTarget, domainConcepts } }`
- 修复 4：DomainRelation 加 source/target DomainConcept @relation；Concept 加 relationsAsSource/relationsAsTarget 反向关系
- 重置 DB 并重新种子，端到端测试报销场景：
  - 输入：5800 元报销单，3 条 lines（上海住宿 900、招待 1200 无客户、苏州住宿 450，发票 INV001 重复）
  - 命中 4 条 findings：
    * R-EXP-001 ERROR 报销单内存在重复发票号
    * R-EXP-002 WARNING 上海 住宿 900 元超过标准
    * R-EXP-003 ERROR 业务招待费（1200元）必须关联客户或项目
    * R-EXP-006 WARNING 报销总额 5800 元超过 5000
  - 未命中（正确）：R-EXP-004/005（submitter/costCenter 都有）
- 最终 bun run lint 0 errors，所有 API 返回 200

Stage Summary:
- 平台完整可用，8 个 tab 全部通过 agent-browser 验证
- 后端 DSL 解析器现在支持人能读的内联表达式，编译/求值/渲染全跑通
- 跨领域"人员"概念簇正确聚合 3 个成员：core:Person + reimbursement:Employee + procurement:Buyer
- 准备创建 webDevReview cron 任务做长期演进

---
Task ID: 7 (DeepSeek 集成 + 打包)
Agent: 主代理 (orchestrator)
Task: 接入 DeepSeek v4-pro，升级场景试运行，端到端验证，打包发用户

Work Log:
- 用户给了 DeepSeek API key + base_url + model name (deepseek-v4-pro)
- 创建 `src/lib/llm.ts`：
  - chat() 函数：调 DeepSeek OpenAI 兼容接口
  - extractStructured()：把文本 + schema 提示喂给 LLM，强制 json_object 响应
  - buildReimbursementSchemaPrompt() / buildProcurementSchemaPrompt()：按领域生成 schema 提示
- 重构 `POST /api/runs`：
  - 支持 mode: "json" | "text"
  - text 模式：调 extractStructured 得结构化对象 → 跑规则
  - 返回 extraction 元信息（ok / usage / durationMs / raw）
  - 返回 extracted 数组（带 jsonPayload，前端可直接渲染）
- 升级前端 ScenarioRun：
  - 加 Tabs 切换"文本模式 (LLM)" / "JSON 模式"
  - 文本模式占位符提示"将调用 DeepSeek v4-pro 抽取"
  - 结果页新增"DeepSeek LLM 抽取"卡片：状态/耗时/prompt_tokens/completion_tokens
  - 结果页新增"LLM 抽取的结构化对象"列表，每条显示 conceptLabel + JSON
  - 加载示例按钮会同时填两个模式的示例
- 端到端验证：
  - curl POST /api/runs mode=text，文本是报销单原文
  - LLM 167ms 完成抽取，返回结构化 JSON
  - 规则引擎命中 4 条 findings：
    * R-EXP-001 ERROR 报销单内存在重复发票号
    * R-EXP-002 WARNING 上海 住宿 900 元超过标准
    * R-EXP-003 ERROR 业务招待费（1200元）必须关联客户或项目
    * R-EXP-006 WARNING 报销总额 5800 元超过 5000
  - token 消耗：prompt 585 / completion 1001 / total 1586
- agent-browser 验证前端：
  - 切到场景试运行 tab
  - 默认文本模式，示例已预填
  - 点"抽取并运行"按钮，4 秒后跳到结果页
  - 显示 4 条 findings + LLM 抽取元信息 + 抽取的结构化对象
  - toast 提示"运行完成 抽取 166ms · 4 条 Findings"
- 修复 .env：DATABASE_URL 从绝对路径改为相对路径 `file:./db/custom.db`，方便打包后跨机器使用
- 创建 download/README.md：本地启动指南
- 打包项目：`download/ontology-platform-v2.tar.gz` (214KB, 145 个文件)
  - 排除 node_modules / .next / .git / db/*.db / 日志 / 内部目录
  - 包含所有源码、prisma schema、配置、设计文档、worklog、.env（含 DeepSeek key）
- 创建 webDevReview cron 任务：job_id 219039，每 15 分钟跑一次
  - 优先 QA，稳定后自主提新需求
  - 重点验证：场景试运行文本模式 LLM 抽取链路、概念仓库聚合视图、规则引擎 DSL 三视图

Stage Summary:
- DeepSeek v4-pro 集成完成，文本模式端到端跑通
- 项目打包在 `/home/z/my-project/download/ontology-platform-v2.tar.gz` (214KB)
- 启动方式：tar xzf → bun install → bun run db:push → bun run dev
- cron 任务已创建，将持续演进

---
Task ID: 8 (智能建库 + 领域管理)
Agent: 主代理 (orchestrator)
Task: 实现界面化创建本体领域 + 智能建库（导入公司材料自动生成本体）

Work Log:
- 用户提问：如何在界面上创建本体领域？如何通过导入公司材料自动建库+试运行？
- 识别这是平台"创建侧"的核心缺失，规划 4 个新能力：
  1. 领域管理（CRUD）
  2. 智能建库向导（材料→LLM 抽取→审核→入库→试运行）
  3. DSL parser 修复块标量 bug（explanation: | 被解析成 "|"）
  4. AppShell 加 2 个新 tab

后端实现：
- `src/lib/autoBuild.ts`：智能建库核心
  - SYSTEM_PROMPT：让 DeepSeek 一次性输出 concepts/relations/rules/scenarios 的 JSON
  - autoBuildOntology()：调 chat() with jsonMode, temperature 0.2, maxTokens 8192
  - normalizeConcept/Relation/Rule/Scenario：规范化 LLM 返回
- `POST /api/autobuild`：分析材料返回候选
- `POST /api/autobuild/commit`：把勾选的候选入库
  - 支持新建领域 or 补充已有领域
  - 创建 Concept + DomainConcept + DomainRelation + RuleSet + Rule + Scenario
  - DSL 不可解析的规则标为 DRAFT
  - 写 AuditLog
- `POST /api/domains`：新建领域（code 唯一校验）
- `PUT /api/domains/[id]`：更新领域
- `DELETE /api/domains/[id]`：级联删除

DSL parser bug 修复：
- 旧 bug：`explanation: |` 被解析成字面量 "|"，多行块内容丢失
- 修复：新增 isBlockScalarMarker() + collectBlockScalar() helper
  - 支持 | / > / |- / >- / |+ / >+ 标记
  - 正确识别块缩进，收集所有更深缩进的行
  - > 折叠模式：把换行折叠成空格
- 应用到 map 解析 + list item 内 map 解析两个路径
- 验证：explanation 现在正确解析为完整多行文本

前端实现（2 个新组件）：
- `src/components/ontology/DomainManager.tsx`：领域管理
  - 卡片网格展示所有领域（概念/规则集/场景数）
  - 新建/编辑对话框：code/nameZh/nameEn/description/owner/color/icon
  - 删除确认（AlertDialog）
  - 每卡 3 个快捷按钮：概念/规则/试运行
- `src/components/ontology/AutoBuildWizard.tsx`：智能建库向导（4 步）
  - Step1 选择领域：创建新 or 补充已有
  - Step2 粘贴材料：Textarea + 示例预填（合同审核流程）
  - Step3 审核候选：
    * LLM 元信息卡（耗时/tokens）
    * 4 个候选区：概念(字段展开)/关系(源→目标)/规则(DSL 可展开)/场景
    * Checkbox 勾选，默认全选
    * 每项显示选中/总数
  - Step4 完成入库：3 个操作按钮（查看概念/立即试运行/再建一个）

AppShell 更新：
- 新增 2 个 tab：领域管理 / 智能建库
- TabKey 类型扩展到 13 个
- NAV 数组新增 2 项，归到"本体"组

端到端验证（agent-browser）：
1. 领域管理 tab：显示 2 个种子领域，新建对话框正常
2. 智能建库 tab 全流程：
   - Step1：填 code=contract, name=合同审核
   - Step2：材料预填合同审核流程（8 条规则）
   - Step3：DeepSeek 分析（约 30s 含 reasoning），识别 4 概念/5 关系/6 规则/1 场景
   - 点击"入库（11 项）"→ 成功
   - 数据库验证：3 个领域，contract 领域有 4 概念/1 规则集/1 场景
3. 跳转试运行：
   - 选择"合同提交校验"场景
   - 文本模式输入合同材料
   - DeepSeek 抽取 165ms（192+89 tokens）
   - 执行 6 条规则，命中 1 条 ERROR：R-CON-005 对方公司统一社会信用代码不能为空
   - 完整闭环验证通过

Stage Summary:
- 平台"创建侧"能力补齐：界面化创建领域 + 智能建库
- 智能建库全链路跑通：材料→LLM→审核→入库→试运行
- DSL parser 块标量 bug 修复，explanation 多行文本正确解析
- 平台现有 13 个 tab：仪表盘/领域管理/智能建库/概念仓库/本体图谱/重叠矩阵/规则引擎/规则评测/场景试运行/运行记录/审计日志/设计文档/关于
- 下一步可做：概念仓库加"新建概念"按钮、规则引擎加"新建规则"按钮、智能建库支持链接到已有核心概念
