# AI Code Review V2

这是按分层结构重新整理后的 AI 代码审查工具目录。当前目标是保持原 `scripts/ai-code-review` 的对外行为不变，同时把职责拆清楚，方便后续继续维护和分发。

## 目录结构

```text
src/
  cli/                # 命令行入口、参数解析、交互菜单、审查流程编排
  config/             # 环境变量加载、运行配置、启动校验、默认模板
  context/            # diff 分片、行号标注、AST 上下文、prompt 构建
  core/               # 审查执行、结果解析、结果格式化、提交阻断决策
  providers/          # Git、AI API、MCP 文档等外部依赖适配层
  shared/             # 公共类型、日志、spinner、并发工具、错误工具
```

## 常用命令

```bash
npm install
npm run type-check
npm run build
npm run print-config
npm run test-api
npm run review
```

## 迁移说明

- 原 `index.ts` 的流程拆到 `src/cli/main.ts`、`src/cli/review-flow.ts` 和 `src/cli/commands/*`。
- 原 `ai-client.ts` 拆到 `src/core/*` 与 `src/providers/ai/ai-api-client.ts`。
- 原 `diff-splitter.ts` 拆到 `src/context/diff/*`。
- 原 `prompt-builder.ts` 拆到 `src/context/prompt/*`。
- 原 `git-utils.ts` 迁移为 `src/providers/git/git-provider.ts`。
- 原 `mcp-client.ts` 迁移为 `src/providers/mcp/mcp-doc-provider.ts`。
