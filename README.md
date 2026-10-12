# AI Code Review

基于 AI 的 Git 暂存区代码审查工具，在 `git commit` 前自动拦截并审查代码变更，发现问题可阻止提交

## 快速开始

### 构建

```bash
git clone <repo> && cd ai-code-review
npm install
npm run build
```

构建产物在 `dist/ai-review.mjs`，可全局链接或直接调用：

```bash
# 全局链接（可选）
npm link

# 或直接运行
node dist/ai-review.mjs
```

### 初始化配置

首次运行时，工具会自动在项目根目录生成 `.env.ai-review` 模板，填写以下必要配置：

```bash
AI_REVIEW_BASE_URL=https://api.deepseek.com  # AI 接口地址（内部走OpenAI 协议）
AI_REVIEW_API_KEY=sk-xxx                           # 鉴权密钥
AI_REVIEW_MODEL=deepseek-chat                      # 模型名称
```

### 使用方式

本工具需要终端交互（选择审查模式、选择模型、输入关联文档 URL 等），**不支持在 Git Hook 中运行**。推荐的使用流程：

```bash
# 1. 暂存要提交的文件
git add .

# 2. 主动运行审查(两种方式)
node dist/ai-review.mjs
or
paykka-ai-review

# 3. 审查通过后再提交
git commit -m "feat: xxx"
```

如果审查发现中/高风险问题，工具会阻止提交，开发者修复后重新暂存并重新发起审查。

### 推荐提交流程

在实际项目中，可以将 AI 审查串联到类型检查和提交之间：

```bash
# 完整提交流程：类型检查 → AI 审查 → 规范化提交
npm run type-check && node dist/ai-review.mjs && git-cz
```

每一步失败都会中断后续步骤：

- `type-check` 失败 → 修复类型错误
- AI 审查发现高/中风险 → 修复代码问题
- 审查通过 → `git-cz` 规范化提交

可以在 `package.json` 中配置为 script 方便调用：

```json
{
  "scripts": {
    "review:commit": "npm run type-check && node dist/ai-review.mjs && git-cz"
  }
}
```

## 审查模式

| 模式        | 说明                                | 提交的总内容                    |
| ----------- | ----------------------------------- | ------------------------------- |
| `diff-only` | 仅变更行上下文                      | 最低                            |
| `diff-w`    | Git 函数级上下文（`git diff -W`）   | 较高                            |
| `diff-ast`  | diff + AST 提取变更所在函数完整代码 | 较高，部分情况会比diff -W省一点 |

**diff-ast 的优势：**

- 对 `.vue` 文件只提取 `<script>` 中变更所在函数，不带入模板和样式
- 超大函数（>100 行）自动截断：保留函数签名 + 变更前后各 30 行
- 每个 chunk 都携带被修改函数的完整定义，避免跨 hunk 上下文丢失

在 `.env.ai-review` 中设置默认模式，或在交互模式下手动选择。

## 配置说明

所有配置项均在 `.env.ai-review` 中设置：

| 配置项                           | 说明                                                 | 默认值                     |
| -------------------------------- | ---------------------------------------------------- | -------------------------- |
| `AI_REVIEW_BASE_URL`             | AI 接口服务根地址（自动拼接 `/v1/chat/completions`） | `https://api.deepseek.com` |
| `AI_REVIEW_API_KEY`              | 鉴权密钥                                             | -                          |
| `AI_REVIEW_MODEL`                | 模型名称，多个用 `\|` 分隔                           | `deepseek-v4-pro`          |
| `AI_REVIEW_TEMPERATURE`          | 输出随机性                                           | `0.2`                      |
| `AI_REVIEW_MAX_TOKENS`           | 单次响应最大输出长度                                 | `2000`                     |
| `AI_REVIEW_RULES_FILE_PATH`      | 项目自定义审查规则文件路径                           | -                          |
| `AI_REVIEW_ALLOW_ON_ERROR`       | AI 调用失败时是否仍允许提交                          | `false`                    |
| `MAX_FILE_DIFF_CHARS`            | 单个文件最大 diff 字数                               | `18000`                    |
| `MAX_TOTAL_DIFF_CHARS`           | 一次提交最大总 diff 字数                             | `50000`                    |
| `AI_REVIEW_MODE`                 | 默认审查模式                                         | `diff-only`                |
| `AI_REVIEW_WRITE_DATA_TO_FILE`   | 是否输出调试数据                                     | `true`                     |
| `AI_REVIEW_WRITE_RESULT_TO_FILE` | 是否输出审查结果到 `ai-review-result.txt`            | `false`                    |
| `AI_REVIEW_MCP_CONFIG_PATH`      | MCP 配置文件路径                                     | `ai-code-review-mcp.json`  |

### 内置提示词

`review-rules.mdc` 为内置审查提示词，包含审查行为准则和项目审查规则。修改此文件即可调整审查行为，无需改动代码。

### 自定义规则

通过 `AI_REVIEW_RULES_FILE_PATH` 指定项目级自定义规则文件，内容会追加到内置提示词之后，与内置规则共存。

## MCP 外部文档

支持在审查时带入外部文档作为参考上下文（如需求文档、设计文档），通过 `ai-code-review-mcp.json` 配置。

### 配置文件

在项目根目录创建 `ai-code-review-mcp.json`，参考 `ai-code-review-mcp.example.json`：

```json
{
  "providers": [
    // 单参数工具：不需要配 toolArgs，默认用 ${input} 传整条输入
    {
      "id": "yuque",
      "label": "语雀文档",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "语雀 MCP Server 包名"],
        "env": { "YUQUE_PROXY_URL": "语雀代理地址" }
      },
      "toolName": "yuque_get_doc_by_url"
    },
    {
      "id": "yuque-gateway",
      "label": "语雀文档-gateway版",
      "transport": {
        "type": "http",
        "url": "语雀 MCP 服务地址"
      },
      "toolName": "getDocByUrl"
    },
    // 多参数工具：需要 inputParsing 从输入提取变量，toolArgs 映射到工具参数
    {
      "id": "tapd",
      "label": "TAPD 需求",
      "transport": {
        "type": "http",
        "url": "TAPD MCP 服务地址"
      },
      "toolName": "getStories",
      "inputParsing": [
        { "field": "workspaceId", "regex": "tapd\\.cn/(\\d+)" },
        { "field": "storyId", "regex": "/(\\d{10,})(?:\\?|$)" }
      ],
      "toolArgs": { "workspace_id": "${workspaceId}", "story_id": "${storyId}" }
    }
  ]
}
```

### 传输模式

| 类型    | 适用场景                   | 配置方式                |
| ------- | -------------------------- | ----------------------- |
| `stdio` | 本地启动 MCP Server 子进程 | 指定 `command` + `args` |
| `http`  | 连接远程 MCP 网关服务      | 指定 `url`              |

### 输入解析

每条用户输入（URL、关键词等）调用一次 MCP 工具。通过 `inputParsing` 控制如何从输入提取参数：

| 值      | 说明                                                            | 示例                                    |
| ------- | --------------------------------------------------------------- | --------------------------------------- |
| `"raw"` | 整条输入原样传入，通过 `${input}` 引用                          | 语雀文档 URL 直接传给工具               |
| 数组    | 用正则从输入提取命名变量，在 `toolArgs` 中通过 `${变量名}` 引用 | 从 TAPD URL 提取 workspaceId 和 storyId |

### URL 缓存

首次交互输入的文档 URL 会自动写回 `ai-code-review-mcp.json` 的 `inputs` 字段，下次运行直接使用，无需重复输入。需要更换时编辑 JSON 或清空 `inputs` 即可。

### 新增 MCP 提供方

最小配置只需 `id` + `transport` + `toolName`：

```json
{
  "id": "feishu",
  "label": "飞书文档",
  "transport": { "type": "http", "url": "飞书 MCP 服务地址" },
  "toolName": "get_document"
}
```

运行 `paykka-ai-review mcp-list` 可连接 MCP Server 并列出工具签名，自动生成建议配置。

### 完整配置项

| 字段               | 必填 | 默认值                                 | 说明                                             |
| ------------------ | :--: | -------------------------------------- | ------------------------------------------------ |
| `id`               |  是  | -                                      | 唯一标识                                         |
| `label`            |  否  | = id                                   | 显示名称                                         |
| `transport`        |  是  | -                                      | 连接配置（`type` + `url` 或 `command` + `args`） |
| `toolName`         |  是  | -                                      | MCP 工具名                                       |
| `inputParsing`     |  否  | `"raw"`                                | 输入解析规则                                     |
| `toolArgs`         |  否  | `{ "url": "${input}" }`                | 工具参数模板，支持 `${变量名}` 占位              |
| `responseTextPath` |  否  | `content[0].text`                      | MCP 响应中文本内容的路径                         |
| `itemMapping`      |  否  | `{ "title": "title", "body": "body" }` | 响应字段到 title/body 的映射                     |
| `formatTemplate`   |  否  | `### {{label}}：{{title}}\n{{body}}`   | 格式化模板，支持 `{{field}}` 占位                |
| `maxBodyLength`    |  否  | `2000`                                 | 正文最大长度，超出截断                           |
| `inputs`           |  否  | `[]`                                   | 预置输入项（交互输入后自动写回）                 |

## 支持的命令

| npm script(源码调用)   | 等效命令（打包后调用）                 | 说明                                   |
| ---------------------- | -------------------------------------- | -------------------------------------- |
| `npm run review`       | `node dist/ai-review.mjs`              | 执行完整审查流程                       |
| `npm run test-api`     | `node dist/ai-review.mjs test-api`     | 测试 AI API 连通性                     |
| `npm run print-config` | `node dist/ai-review.mjs print-config` | 打印当前配置                           |
| `npm run mcp-list`     | `node dist/ai-review.mjs mcp-list`     | 连接 MCP Server 列出工具签名及建议配置 |

全局安装后也可使用 `paykka-ai-review` 作为命令前缀。

## 审查流程

```
启动 → 加载 .env.ai-review 配置 → 校验启动配置
  ↓
暂存区扫描 → git diff --cached --name-only → 过滤代码文件
  ↓
获取变更 → git diff --cached → 行号标注 (旧行号, 新行号)
  ↓
MCP 上下文（可选）→ 连接 MCP Server → 拉取关联文档
  ↓
选择审查模式 → diff-only / diff-w / diff-ast
  ↓
AST 上下文（仅 diff-ast）→ 提取变更所在函数完整代码 → 大函数截断
  ↓
Diff 分片 → 按 hunk 切分 → 合并 chunk → 超大 hunk 智能断行
  ↓
预检查 → 估算字数 → 显示分片数 → 选择模型 → 超量确认
  ↓
执行 AI 审查 → 构建 prompt → 并发调用 AI API（最多 3 并发）
  ↓
解析结果 → 提取 JSON → 校验 issue → 去重 → 按文件分组
  ↓
决策 → 高/中风险：阻止提交 → 低风险：询问用户 → 无问题：放行
```

## 审查结果输出

### 终端输出

审查结果在终端以彩色格式输出，按文件分组，标注风险等级：

- 🔴 **high**：阻止提交
- 🟠 **medium**：阻止提交
- 🟡 **low**：询问用户是否继续
- ✅️ **success**：通过

### 文件输出

设置 `AI_REVIEW_WRITE_RESULT_TO_FILE=true`，审查结果（无论成功或失败）会写入当前目录下的 `ai-review-result.txt`（纯文本，无 ANSI 颜色码），文件已存在则覆盖。

## 常见问题

**Q: 支持哪些编程语言？**
A: `.js` `.jsx` `.ts` `.tsx` `.vue` `.py` `.java` `.go` `.php` `.rb`

**Q: diff-ast 模式对 Vue 文件如何处理？**
A: diff 会捕获 `<template>`、`<style>`、`<script>` 的所有变更，但 AST 上下文提取仅针对 `<script>` / `<script setup>` 中变更所在的函数。模板和样式的变更以原始 diff 形式参与审查，没有 AST 补充上下文。会自动处理 `defineProps` / `defineEmits` 等宏。

**Q: 没有配置 MCP 文档会影响审查吗？**
A: 不会。没有 `ai-code-review-mcp.json` 文件时，MCP 功能完全不生效，审查流程正常进行。

**Q: 如何查看 MCP Server 提供了哪些工具？**
A: 运行 `paykka-ai-review mcp-list`，连接 MCP Server 后列出所有工具签名，并自动生成建议配置。

## 日志

- **2026-06-01**：
  1. MCP 重构为外部配置驱动，新增 `mcp-list` 命令；输入解析改为 `inputParsing` + `toolArgs` 变量模板；
  2. 审查结果输出到文件去除 ANSI 颜色码
- **2026-05-18**：
  1. AST 上下文增强能力上线，支持 Vue `<script>` 提取、大函数截断、跨 hunk 上下文补全
- **2026-05-13**：
  1. 确定三种审查模式（diff-only / diff-w / diff-ast），寻找 token 用量与准确度的平衡点
- **2026-05-08**：
  1. 初步走通针对提交代码的 AI 代码审查流程，支持批量/单文件模式审查、diff 文件的融合与切割、AI 审查结果输出
