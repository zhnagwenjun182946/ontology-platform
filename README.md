# 本体平台（Ontology Platform）

业务规则智能校验平台。基于本体（ontology）治理 + LLM 智能建库 + DSL 规则引擎，为上游 Agent 和业务系统提供规则校验和数据提取能力。

## 核心能力

- **本体治理**：核心概念（Person/Organization/Money/Document）+ 领域概念两层结构，跨领域等价去重
- **智能建库**：上传业务材料，LLM 自动抽取概念 / 关系 / 规则 / 场景 / 受治理标准，含孤立概念自愈重试
- **规则引擎**：自定义 DSL（YAML 风格），声明式条件 + 可读消息 + 黄金样本测试
- **受治理标准**：数值标准（住宿上限/餐标等）存为数据表，规则通过 `std_xxx()` 函数取用，不硬编码
- **场景试运行**：传文本或 JSON，LLM 抽取 → 规则校验 → 结构化 Findings + 可视化图谱
- **Agent API**：REST 接口供上游系统集成，API Key 鉴权

## 技术栈

- **前端**：Next.js 16 + React 19 + Tailwind CSS v4 + shadcn/ui
- **后端**：Next.js Route Handlers + Prisma ORM + SQLite
- **LLM**：DeepSeek（文本抽取 + 智能建库）
- **图布局**：dagre（分层）+ d3-force（力导向）

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) ≥ 20
- [Bun](https://bun.sh/) ≥ 1.0（推荐）
- [DeepSeek API Key](https://platform.deepseek.com/)

### 安装

```bash
git clone <repo-url>
cd ontology-platform

# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY

# 初始化数据库（SQLite，自动创建）
bun run db:push

# 启动开发服务器
bun run dev
```

打开 http://localhost:3000

### 首次启动凭据

首次启动时自动初始化管理员账号和 API Key。**默认随机生成，打印在控制台日志里**（仅显示一次）：

```
========================================
[Seed] 初始凭据（请妥善保存，仅显示一次）：
  管理员账号：admin / <随机密码>
  API Key：sk-<随机key>
========================================
```

如需指定凭据，在 `.env` 中设置：

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-password
DEFAULT_API_KEY=your-api-key
```

> ⚠️ 生产环境务必通过环境变量设置凭据，不要使用随机生成的默认值。

## 示例文档

仓库内提供了一份可直接使用的业务材料，方便快速体验智能建库和规则校验：

- [example_docs/差旅管理规定.md](./example_docs/差旅管理规定.md) — 差旅管理领域材料

使用方式：在「智能建库」页面粘贴该文档内容，LLM 会自动抽取概念、关系、规则、受治理标准，生成可试运行的差旅领域。

## Agent API

上游 Agent / 业务系统通过 `/api/v1/` 接口接入，详见 [AGENT_API.md](./AGENT_API.md)。

### 快速示例

```bash
# 查询可用场景
curl http://localhost:3000/api/v1/scenarios \
  -H "X-API-Key: <your-api-key>"

# 提交文本校验
curl -X POST http://localhost:3000/api/v1/runs \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "scenarioId": "<scenario_id>",
    "mode": "text",
    "text": "员工赵志刚出差报销，住宿费900元..."
  }'
```

### 主要接口

| 接口 | 方法 | 说明 |
|:---|:---|:---|
| `/api/v1/runs` | POST | 完整校验（抽取→校验→落库→返回） |
| `/api/v1/validate` | POST | 无副作用校验（不落库） |
| `/api/v1/domains` | GET | 领域+场景目录 |
| `/api/v1/scenarios` | GET | 场景列表 |
| `/api/v1/schemas/:concept` | GET | 概念 JSON Schema |

## 项目结构

```
src/
├── app/
│   ├── api/              # API 路由
│   │   ├── v1/           # Agent 接口（API Key 鉴权）
│   │   ├── autobuild/    # 智能建库
│   │   ├── runs/         # 运行校验
│   │   ├── concepts/     # 概念管理
│   │   ├── domains/      # 领域管理
│   │   └── rules/        # 规则管理
│   └── page.tsx          # 入口
├── components/
│   ├── ontology/         # 业务组件
│   └── ui/               # shadcn 基础组件
└── lib/
    ├── autoBuild.ts          # 智能建库（LLM 驱动 + 自愈重试）
    ├── validation-engine.ts  # 规则校验引擎
    ├── dsl/parser.ts         # 规则 DSL 解析器
    ├── llm.ts                # LLM 客户端
    ├── concept-field.ts      # 概念↔字段名映射
    └── auth.ts               # API Key 鉴权
```

## 开发

```bash
# 类型检查
bun run typecheck

# 代码规范检查
bun run lint

# 数据库操作
bun run db:push      # 同步 schema 到数据库
bun run db:generate   # 重新生成 Prisma Client
bun run db:reset      # 重置数据库（慎用）
```

贡献指南详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 文档

- [AGENT_API.md](./AGENT_API.md) — Agent API 接口文档
- [ONTOLOGY_PLATFORM_DESIGN.md](./ONTOLOGY_PLATFORM_DESIGN.md) — 架构设计文档

## License

[MIT](./LICENSE)
