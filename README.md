# 智规平台

业务规则智能校验平台。为上游 Agent 和业务系统提供规则校验和数据提取能力。

## 核心能力

- **本体治理**：核心概念 + 领域概念两层结构，跨领域去重聚合，等价关系管理
- **智能建库**：上传业务材料，LLM 自动抽取概念/关系/规则/场景
- **规则引擎**：自定义 DSL 规则（YAML 风格），声明式条件 + 可读消息 + 黄金样本测试
- **场景试运行**：传文本或 JSON，LLM 抽取 → 规则校验 → 结构化 Findings + 可视化
- **Agent API**：REST 接口供上游系统集成，API Key 鉴权

## 技术栈

- **前端**：Next.js 16 + React 19 + Tailwind CSS v4 + shadcn/ui
- **后端**：Next.js Route Handlers + Prisma ORM + SQLite
- **LLM**：DeepSeek（文本抽取 + 智能建库）
- **图布局**：dagre（分层）+ d3-force（力导向）

## 快速开始

```bash
# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY 和 DATABASE_URL

# 初始化数据库
bun run db:push

# 启动开发服务器
bun run dev
```

打开 http://localhost:3000，使用默认账号 `admin` / `admin` 登录。

## Agent API

上游 Agent / 业务系统通过 `/api/v1/` 接口接入，详见 [AGENT_API.md](./AGENT_API.md)。

### 快速示例

```bash
# 查询可用场景
curl http://localhost:3000/api/v1/scenarios \
  -H "X-API-Key: ontology-platform-default-key"

# 提交文本校验
curl -X POST http://localhost:3000/api/v1/runs \
  -H "X-API-Key: ontology-platform-default-key" \
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
    ├── autoBuild.ts      # 智能建库
    ├── llm.ts            # LLM 客户端
    ├── validation-engine.ts # 校验引擎
    ├── auth.ts           # API Key 鉴权
    └── dsl/parser.ts     # 规则 DSL 解析器
```

## 默认凭据

| 项目 | 值 |
|:---|:---|
| 登录账号 | admin / admin |
| API Key | ontology-platform-default-key |
| 租户 | default |

> 生产环境请替换默认凭据，当前租户隔离和权限校验为预留未启用。

## 文档

- [AGENT_API.md](./AGENT_API.md) — Agent API 接口文档
- [ONTOLOGY_PLATFORM_DESIGN.md](./ONTOLOGY_PLATFORM_DESIGN.md) — 内部设计文档
