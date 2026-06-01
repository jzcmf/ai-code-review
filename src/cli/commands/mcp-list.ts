import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { loadProviderConfigs, type ProviderConfig, type InputParseRule } from '../../providers/mcp/config-loader.js'
import { logInfo, logError } from '../../shared/logger.js'

// ── types ─────────────────────────────────────────────────────

interface ToolParam {
  name: string
  type: string
  required: boolean
  description: string
}

interface ToolInfo {
  name: string
  description: string
  params: ToolParam[]
}

// ── transport ─────────────────────────────────────────────────

function buildTransport(config: ProviderConfig) {
  if (config.transport.type === 'http') {
    try {
      return new StreamableHTTPClientTransport(new URL(config.transport.url))
    } catch {
      return null
    }
  }
  if (config.transport.type === 'stdio') {
    const mergedEnv = config.transport.env
      ? { ...process.env as Record<string, string>, ...config.transport.env }
      : undefined
    return new StdioClientTransport({
      command: config.transport.command,
      args: config.transport.args,
      env: mergedEnv
    })
  }
  return null
}

// ── tool discovery ────────────────────────────────────────────

async function listTools(config: ProviderConfig): Promise<ToolInfo[]> {
  const transport = buildTransport(config)
  if (!transport) return []

  const client = new Client({ name: 'ai-review-mcp-list', version: '1.0.0' })
  try {
    await client.connect(transport)
    const { tools } = await client.listTools()

    return tools.map((t) => {
      const schema = (t.inputSchema as { properties?: Record<string, unknown>; required?: string[] }) ?? {}
      const requiredSet = new Set(schema.required ?? [])
      const params: ToolParam[] = []
      if (schema.properties) {
        for (const [name, prop] of Object.entries(schema.properties) as [string, Record<string, unknown>][]) {
          params.push({
            name,
            type: (prop.type as string) || 'any',
            required: requiredSet.has(name),
            description: (prop.description as string) || ''
          })
        }
      }
      return { name: t.name, description: t.description ?? '', params }
    })
  } finally {
    try { await client.close() } catch { /* ignore */ }
  }
}

// ── config template ───────────────────────────────────────────

function pickBestTool(tools: ToolInfo[]): ToolInfo | undefined {
  return tools.find((t) => t.name.includes('get') || t.name.includes('fetch') || t.name.includes('read'))
    ?? tools.find((t) => t.name.includes('search') || t.name.includes('query'))
    ?? tools[0]
}

function buildTemplate(config: ProviderConfig, tool: ToolInfo): object {
  const toolArgs: Record<string, string> = {}
  const parsingRules: InputParseRule[] = []

  for (const p of tool.params) {
    if (!p.required) continue
    if (['url', 'query', 'slug', 'path', 'namespace'].includes(p.name)) {
      toolArgs[p.name] = '${input}'
    } else if (p.name.endsWith('_id') || p.name === 'id') {
      const field = p.name === 'id' ? 'itemId' : p.name.replace(/_id$/, 'Id')
      parsingRules.push({ field, regex: `<提取 ${p.name} 的正则>` })
      toolArgs[p.name] = `\${${field}}`
    } else {
      toolArgs[p.name] = `<${p.name}>`
    }
  }

  return {
    id: config.id,
    label: config.label,
    transport: config.transport,
    toolName: tool.name,
    inputParsing: parsingRules.length > 0 ? parsingRules : 'raw',
    ...(Object.keys(toolArgs).length > 0 ? { toolArgs } : {})
  }
}

// ── output ────────────────────────────────────────────────────

function printTools(tools: ToolInfo[]) {
  if (tools.length === 0) {
    console.log('   (无可用工具)\n')
    return
  }
  for (const tool of tools) {
    console.log(`   📌 ${tool.name}`)
    if (tool.description) {
      console.log(`      ${tool.description}`)
    }
    if (tool.params.length > 0) {
      for (const p of tool.params) {
        const req = p.required ? ' *' : ''
        const desc = p.description ? ` — ${p.description}` : ''
        console.log(`        ${p.name}: ${p.type}${req}${desc}`)
      }
    }
    console.log()
  }
}

function formatJsonBlock(obj: object): string {
  const json = JSON.stringify(obj, null, 2)
  return json.split('\n').map((line) => '   ' + line).join('\n')
}

function printTemplate(config: ProviderConfig, tools: ToolInfo[]) {
  const tool = pickBestTool(tools)
  if (!tool) return

  console.log('   💡 建议配置:')
  console.log(formatJsonBlock(buildTemplate(config, tool)))
  console.log()
  console.log('   inputParsing 说明:')
  console.log('     "raw"  — 整条输入原样传给 toolArgs 中的 ${input}')
  console.log('     数组   — 用正则从输入提取命名变量，如:')
  console.log('       [{ "field": "workspaceId", "regex": "tapd\\\\.cn/(\\\\d+)" }]')
  console.log('       提取后在 toolArgs 中用 ${workspaceId} 引用')
  console.log()
}

// ── main ──────────────────────────────────────────────────────

export async function runMcpListCommand(): Promise<number> {
  const configs = loadProviderConfigs()
  if (configs.length === 0) {
    logError('未找到 MCP 配置。请检查 ai-code-review-mcp.json 文件。')
    return 1
  }

  logInfo(`共 ${configs.length} 个 MCP Provider，开始连接并列出工具...\n`)

  let hasError = false

  for (const config of configs) {
    console.log(`── ${config.label} (${config.id}) ──`)
    console.log(`   transport: ${config.transport.type}${config.transport.type === 'http' ? ` → ${config.transport.url}` : ` → ${config.transport.command} ${(config.transport.args || []).join(' ')}`}`)

    try {
      const tools = await listTools(config)
      printTools(tools)

      if (tools.length > 0) {
        printTemplate(config, tools)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logError(`${config.label} 连接失败: ${msg}`)
      hasError = true
    }

    console.log()
  }

  return hasError ? 1 : 0
}
