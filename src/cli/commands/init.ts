import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_ENV_TEMPLATE } from '../../config/env-template.js'
import { ANSI_COLORS, colorize, logInfo, logSuccess } from '../../shared/logger.js'

const MCP_CONFIG_TEMPLATE = `{
  "providers": [
    {
      "id": "mcp1",
      "label": "MCP1 Name",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "MCP Server 包名"],
        "env": { "MCP_PROXY_URL": "代理地址（可选）" }
      },
      "toolName": "MCP1 Tool Name"
    },
    {
      "id": "mcp2",
      "label": "MCP2 Name",
      "transport": {
        "type": "http",
        "url": "MCP2 服务地址"
      },
      "toolName": "MCP2 Tool Name"
    },
    {
      "id": "mcp3",
      "label": "MCP3 Name",
      "transport": {
        "type": "http",
        "url": "MCP3 服务地址"
      },
      "toolName": "MCP3 Tool Name",
      "inputParsing": [
        { "field": "param1", "regex": "从 URL 提取 param1 的正则" },
        { "field": "param2", "regex": "从 URL 提取 param2 的正则" }
      ],
      "toolArgs": { "param1": "\${param1}", "param2": "\${param2}" }
    }
  ]
}
`

function writeEnvTemplate(cwd: string): boolean {
  const dest = resolve(cwd, '.env.ai-review')
  if (existsSync(dest)) {
    logInfo(`.env.ai-review 已存在，跳过。`)
    return false
  }
  writeFileSync(dest, DEFAULT_ENV_TEMPLATE, 'utf8')
  return true
}

function writeMcpTemplate(cwd: string): boolean {
  const dest = resolve(cwd, 'ai-code-review-mcp.json')
  if (existsSync(dest)) {
    logInfo(`ai-code-review-mcp.json 已存在，跳过。`)
    return false
  }
  writeFileSync(dest, MCP_CONFIG_TEMPLATE, 'utf8')
  return true
}

export async function runInitCommand(): Promise<number> {
  const cwd = process.cwd()
  logInfo(`在 ${colorize(cwd, ANSI_COLORS.green)} 下初始化项目配置...\n`)

  let created = 0

  if (writeEnvTemplate(cwd)) {
    logSuccess('已创建 .env.ai-review（请填写 API 密钥等配置）')
    created++
  }

  if (writeMcpTemplate(cwd)) {
    logSuccess('已创建 ai-code-review-mcp.json（MCP 外部文档配置）')
    created++
  }

  if (created === 0) {
    logInfo('\n所有配置文件已存在，无需初始化。')
  } else {
    logInfo(`\n初始化完成，共创建 ${colorize(created, ANSI_COLORS.green)} 个文件。`)
    logInfo('请编辑 .env.ai-review 填写 AI_REVIEW_API_KEY 后再运行审查。')
  }

  return 0
}
