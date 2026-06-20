# 贡献指南

感谢你对本体平台的关注！欢迎提交 Issue 和 Pull Request。

## 开发环境

- **Node.js** ≥ 20
- **Bun** ≥ 1.0（推荐，用作包管理器和运行时）
- DeepSeek API Key（用于 LLM 抽取功能）

## 本地启动

```bash
# 1. 安装依赖
bun install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY

# 3. 初始化数据库（SQLite）
bun run db:push

# 4. 启动开发服务器
bun run dev
```

打开 http://localhost:3000 即可使用。首次启动会自动初始化核心概念和默认管理员账号（凭据见启动日志）。

## 代码规范

- **TypeScript**：所有代码必须通过 `bun run typecheck` 类型检查。
- **ESLint**：`bun run lint` 必须无错误。
- **风格**：遵循现有代码风格（函数式组件、命名导出、中文注释）。

## 测试

仓库提供了一份示例材料 [example_docs/差旅管理规定.md](./example_docs/差旅管理规定.md)，可用于验证智能建库和规则校验流程。改动涉及 autoBuild / validation-engine / DSL parser 时，建议用该材料跑一遍端到端验证。

## 提交规范

- Commit message 用中文，格式：`<type>(<scope>): <描述>`，如 `feat(autobuild): 新增孤立概念自愈重试`。
- Type：`feat` / `fix` / `refactor` / `docs` / `chore` / `test`。

## 提交 PR

1. Fork 本仓库。
2. 从 `main` 切分支：`git checkout -b feat/your-feature`。
3. 确保通过 `bunx tsc --noEmit` 和 `bun run lint`。
4. 提交 PR，描述清楚改动内容和动机。

## 项目结构

详见 [README.md](./README.md) 的项目结构章节。核心模块在 `src/lib/`：
- `autoBuild.ts` — 智能建库（LLM 驱动）
- `validation-engine.ts` — 规则校验引擎
- `dsl/parser.ts` — 规则 DSL 解析器
- `llm.ts` — LLM 客户端
- `concept-field.ts` — 概念↔字段名映射

## 报告 Bug

提交 Issue 时请包含：
- 复现步骤
- 期望行为 vs 实际行为
- 相关日志（`dev.log` 中的 `[Run]` / `[AutoBuild]` 行）
