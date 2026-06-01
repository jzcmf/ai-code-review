import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { logWarning } from '../../shared/logger.js'
import type { McpProvider } from './types.js'
import type { ProviderConfig, InputParseRule } from './config-loader.js'

function resolveTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{(\w+)\}/g, (_, name) => vars[name] ?? '')
}

function getByPath(obj: unknown, path: string): unknown {
  if (path === '$') return obj
  const parts = path.replace(/\]/g, '').split(/\.|\[/)
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    const idx = /^\d+$/.test(part) ? Number.parseInt(part, 10) : part
    current = (current as Record<string, unknown>)[idx as string]
  }
  return current
}

function extractTextFromResponse(result: unknown, path: string): string | null {
  const value = getByPath(result, path)
  if (typeof value === 'string') return value
  return null
}

function mapItem(raw: Record<string, unknown>, mapping: Record<string, string>): Record<string, string> {
  const item: Record<string, string> = {}
  for (const [key, sourcePath] of Object.entries(mapping)) {
    const val = getByPath(raw, sourcePath)
    item[key] = val !== undefined && val !== null ? String(val) : ''
  }
  return item
}

function parseInput(input: string, rules: InputParseRule[] | 'raw'): Record<string, string> {
  if (rules === 'raw') {
    return { input }
  }
  const vars: Record<string, string> = { input }
  for (const rule of rules) {
    try {
      const match = input.match(new RegExp(rule.regex))
      if (match && match[1]) {
        vars[rule.field] = match[1]
      }
    } catch {
      // invalid regex, skip
    }
  }
  return vars
}

// ─── transport builder ────────────────────────────────────────

function buildTransport(config: ProviderConfig): StdioClientTransport | StreamableHTTPClientTransport | null {
  if (config.transport.type === 'http') {
    try {
      return new StreamableHTTPClientTransport(new URL(config.transport.url))
    } catch {
      logWarning(`${config.label} 的 HTTP transport URL 不合法`)
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

// ─── ConfigMcpProvider ──────────────────────────────────────

export class ConfigMcpProvider implements McpProvider<Record<string, string>> {
  readonly id: string
  readonly label: string
  readonly itemLabel: string

  constructor(private readonly config: ProviderConfig) {
    this.id = config.id
    this.label = config.label
    this.itemLabel = config.itemLabel
  }

  isAvailable(): boolean {
    return !!this.config.toolName
  }

  getPresetUrls(): string[] {
    if (this.config.inputs.length > 0) return this.config.inputs
    return (process.env[this.config.presetInputEnvKey] || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  async fetch(inputs: string[]): Promise<Array<Record<string, string>>> {
    if (inputs.length === 0) return []
    if (!this.config.toolName) return []

    const transport = buildTransport(this.config)
    if (!transport) return []

    const client = new Client({ name: 'ai-review', version: '1.0.0' })

    try {
      await client.connect(transport)

      const items: Array<Record<string, string>> = []

      for (const input of inputs) {
        try {
          const vars = parseInput(input, this.config.inputParsing)

          const resolvedArgs: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(this.config.toolArgs)) {
            resolvedArgs[k] = resolveTemplate(String(v), vars)
          }

          const result = await client.callTool({
            name: this.config.toolName,
            arguments: resolvedArgs
          })

          const text = extractTextFromResponse(result, this.config.responseTextPath || 'content[0].text')
          if (!text) continue

          const parsed = JSON.parse(text)
          const mapped = mapItem(parsed as Record<string, unknown>, this.config.itemMapping)
          mapped._input = input
          items.push(mapped)
        } catch {
          logWarning(`${this.label} 拉取失败：${input}`)
        }
      }

      return items
    } catch {
      logWarning(`${this.label} MCP 连接失败，已跳过上下文。`)
      return []
    } finally {
      try {
        await client.close()
      } catch {
        // ignore
      }
    }
  }

  format(items: Array<Record<string, string>>): string {
    if (items.length === 0) return ''

    return items
      .map((item) => {
        const body = item.body || ''
        const truncated = body.length > this.config.maxBodyLength
          ? `${body.slice(0, this.config.maxBodyLength)}\n\n...（内容已截断）`
          : body || '(无内容)'

        return this.config.formatTemplate
          .replace(/\{\{label\}\}/g, this.config.label)
          .replace(/\{\{(\w+)\}\}/g, (_, key) => item[key] ?? '')
          .replace(/\{\{body\}\}/g, truncated)
      })
      .join('\n\n---\n\n')
  }
}
