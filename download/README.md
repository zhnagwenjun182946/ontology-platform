# 企业级本体平台 v2 · 本地启动指南

## 环境要求

- Node.js 20+ / Bun 1.3+
- 推荐用 Bun（更快）

## 启动步骤

```bash
# 1. 安装依赖
bun install

# 2. 初始化数据库（SQLite，文件在 db/custom.db）
bun run db:push

# 3. 启动 dev server（默认 3000 端口）
bun run dev
```

打开浏览器访问 `http://localhost:3000`，平台会自动调用 `/api/init` 注入种子数据：
- 4 个核心概念（人员 / 组织 / 金额 / 文档）
- 报销领域（5 概念 / 4 关系 / 6 规则 / 1 场景）
- 采购领域（3 概念 / 2 规则 / 1 场景）

## DeepSeek LLM 集成

`.env` 已配置 DeepSeek API：

```
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-v4-pro
```

场景试运行的"文本模式"会调用 DeepSeek v4-pro 把业务文本抽取为结构化 JSON，再跑规则集。
"JSON 模式"则直接传结构化对象，跳过 LLM。

## 主要功能

| Tab | 功能 |
|-----|------|
| 仪表盘 | KPI / 领域覆盖 / 规则严重度分布 / 最近运行 |
| 概念仓库 | 核心+领域概念，聚合视图显示跨领域等价簇 |
| 本体图谱 | SVG 可视化，节点按领域着色，等价关系虚线 |
| 规则引擎 | DSL 编辑 + 可读中文渲染 + SHACL 编译 + 试运行 |
| 场景试运行 | 文本/JSON 双模式，DeepSeek 抽取 + 规则校验 |
| 运行记录 | 历史运行列表 + Findings 详情 |
| 设计文档 | 完整设计文档在线阅读 |
| 关于平台 | 三大创新点介绍 |

## 设计文档

完整设计理念见根目录 `ONTOLOGY_PLATFORM_DESIGN.md`，或访问平台 → 设计文档 tab。

## 工作日志

开发过程见 `worklog.md`。

## 技术栈

- Next.js 16 (App Router) + TypeScript 5
- Tailwind CSS 4 + shadcn/ui (New York)
- Prisma ORM (SQLite)
- DeepSeek v4-pro (LLM 抽取)
- 自实现 Rule DSL 解析器（YAML 子集 + 内联表达式）

## 关键创新点

1. **不打包发布**：本体在线编辑 → 校验 → 快照冻结发布，无 jar/包
2. **跨领域去重聚合**：核心本体 + 领域本体，等价关系把报销.Employee、采购.Buyer 聚合成 core:Person
3. **人能看懂的规则 DSL**：YAML 风格，可读中文渲染，可编译 SHACL，可执行求值
