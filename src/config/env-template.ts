import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_REVIEW_MODE,
  DEFAULT_TEMPERATURE,
  MAX_FILE_DIFF_CHARS,
  MAX_TOTAL_DIFF_CHARS
} from './constants.js'

export const DEFAULT_ENV_TEMPLATE = `# AI 代码审查配置

# AI_REVIEW_BASE_URL
# AI 接口的服务根地址，采用OpenAI API协议，自动在末尾拼接 /v1/chat/completions。
AI_REVIEW_BASE_URL=${DEFAULT_BASE_URL}

# AI_REVIEW_API_KEY
# 访问 AI 接口所需的鉴权密钥。
AI_REVIEW_API_KEY=

# AI_REVIEW_MODEL
# 指定本次审查可使用的模型；支持多个模型用 | 分隔，交互模式下可手动选择。
AI_REVIEW_MODEL=${DEFAULT_MODEL}

# AI_REVIEW_RULES_FILE_PATH
# 项目自定义审查规则文件路径
AI_REVIEW_RULES_FILE_PATH=

# AI_REVIEW_ALLOW_ON_ERROR
# AI 调用失败、解析失败或上游报错时，是否仍然允许 git commit 继续。
AI_REVIEW_ALLOW_ON_ERROR=false

# AI_REVIEW_TEMPERATURE
# 控制模型输出随机性；越低越稳定，越高越发散。
AI_REVIEW_TEMPERATURE=${DEFAULT_TEMPERATURE}

# AI_REVIEW_MAX_TOKENS
# 限制单次 AI 响应的最大输出长度。
# 什么时候调小：频繁遇到 TPM/429 限流，或希望压缩输出成本。
# 什么时候调大：希望模型一次返回更完整的问题列表。
AI_REVIEW_MAX_TOKENS=${DEFAULT_MAX_TOKENS}

# MAX_FILE_DIFF_CHARS
# 限制“单个文件”在一次审查中可携带的最大 diff/上下文字数。
# 影响：值越小，越容易拆 chunk；值越大，单次上下文更完整，但请求更重。
MAX_FILE_DIFF_CHARS=${MAX_FILE_DIFF_CHARS}

# MAX_TOTAL_DIFF_CHARS
# 限制“一次提交”建议送审的总字数阈值。
# 影响：超过后不会立刻失败，而是提示本次会拆成多少 chunk / unit，再决定是否继续。
MAX_TOTAL_DIFF_CHARS=${MAX_TOTAL_DIFF_CHARS}

# AI_REVIEW_MODE
# 设置默认审查模式。
# diff-only = 只看 diff，最省 token；
# diff-w    = 带 Git 函数级上下文，适合常规 JS/TS；
# diff-ast  = 带 AST 提取出的最小包含代码块，上下文更准，但更耗 token。
AI_REVIEW_MODE=${DEFAULT_REVIEW_MODE}

# AI_REVIEW_WRITE_DATA_TO_FILE
# 是否把调试数据落盘，例如原始响应、分片结果、解析日志。
# 建议排查问题时开启；日常使用不关心调试细节时可关闭。
AI_REVIEW_WRITE_DATA_TO_FILE=false

# AI_REVIEW_WRITE_RESULT_TO_FILE
# 是否输出审查结果，默认输出到执行目录下的 ai-review-result.txt，文件存在则覆盖，默认关闭。
AI_REVIEW_WRITE_RESULT_TO_FILE=false

# AI_REVIEW_MCP_CONFIG_PATH
# MCP 配置文件路径，默认为当前目录下的 ai-code-review-mcp.json。
# 可以是绝对路径或相对路径（相对于执行目录）。
AI_REVIEW_MCP_CONFIG_PATH=

# AI_REVIEW_DISABLE_BUILTIN_RULES
# 是否禁用内置预设提示词（review-rules.mdc 中的审查行为准则和项目审查规则）。
# 设为 true 后，仅使用 AI_REVIEW_RULES_FILE_PATH 指定的自定义规则。
AI_REVIEW_DISABLE_BUILTIN_RULES=false
`
