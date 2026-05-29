import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { logWarning } from '../../shared/logger.js'
import type { McpProvider } from './types.js'
import type { ProviderConfig, FetchMode, UrlGrouping } from './config-loader.js'

function resolveTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{(\w+)\}/g, (_, name) => vars[name] ?? '')
}

function parseUrl(url: string, regex: string): string | null {
  try {
    const match = url.match(new RegExp(regex))
    return match ? match[1] : null
  } catch {
    return null
  }
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

// ─── perUrl engine ──────────────────────────────────────────

async function fetchPerUrl(
  client: Client,
  urls: string[],
  config: ProviderConfig
): Promise<Array<Record<string, string>>> {
  const items: Array<Record<string, string>> = []

  for (const url of urls) {
    try {
      const resolvedArgs: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(config.toolArgs)) {
        resolvedArgs[k] = resolveTemplate(String(v), { url })
      }

      const result = await client.callTool({
        name: config.toolName,
        arguments: resolvedArgs
      })

      const text = extractTextFromResponse(result, config.responseTextPath || 'content[0].text')
      if (!text) continue

      const parsed = JSON.parse(text)
      const mapped = mapItem(parsed as Record<string, unknown>, config.itemMapping)
      mapped._url = url
      items.push(mapped)
    } catch {
      logWarning(`${config.label} 拉取失败：${url}`)
    }
  }

  return items
}

// ─── batchByGroup engine ────────────────────────────────────

interface GroupedUrls {
  groupKey: string
  targets: Array<{ url: string; itemId: string }>
}

function groupUrls(urls: string[], grouping: UrlGrouping): {
  groups: GroupedUrls[]
  unparseable: string[]
} {
  const map = new Map<string, Array<{ url: string; itemId: string }>>()
  const unparseable: string[] = []

  const groupRegex = new RegExp(grouping.groupKeyRegex)
  const itemRegex = new RegExp(grouping.itemIdRegex)

  for (const url of urls) {
    const groupKey = url.match(groupRegex)?.[1]
    const itemId = url.match(itemRegex)?.[1]
    if (!groupKey || !itemId) {
      unparseable.push(url)
      continue
    }
    if (!map.has(groupKey)) map.set(groupKey, [])
    map.get(groupKey)!.push({ url, itemId })
  }

  const groups: GroupedUrls[] = []
  for (const [groupKey, targets] of map) {
    groups.push({ groupKey, targets })
  }
  return { groups, unparseable }
}

async function fetchBatchByGroup(
  client: Client,
  urls: string[],
  config: ProviderConfig & { urlGrouping: UrlGrouping; itemsPath: string; itemIdField: string }
): Promise<Array<Record<string, string>>> {
  const { groups, unparseable } = groupUrls(urls, config.urlGrouping)
  for (const u of unparseable) {
    logWarning(`${config.label} URL 格式无法识别：${u}`)
  }
  if (groups.length === 0) return []

  const items: Array<Record<string, string>> = []

  for (const group of groups) {
    try {
      const resolvedArgs: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(config.toolArgs)) {
        resolvedArgs[k] = resolveTemplate(String(v), { groupKey: group.groupKey })
      }

      const result = await client.callTool({
        name: config.toolName,
        arguments: resolvedArgs
      })

      const text = extractTextFromResponse(result, config.responseTextPath || 'content[0].text')
      if (!text) continue

      const parsed = JSON.parse(text)
      const itemsArray = getByPath(parsed, config.itemsPath)
      const allItems: Array<Record<string, unknown>> = Array.isArray(itemsArray)
        ? itemsArray as Array<Record<string, unknown>>
        : []

      if (allItems.length === 0) {
        // Try alternate common paths
        let found = false
        for (const altPath of ['result', 'data', 'data.list', 'items']) {
          const alt = getByPath(parsed, altPath)
          if (Array.isArray(alt) && alt.length > 0) {
            found = true
            for (const row of alt as Array<Record<string, unknown>>) {
              const mapped = mapItem(row, config.itemMapping)
              const mappedId = mapped[config.itemIdField]
              const matched = group.targets.find((t) => t.itemId === mappedId)
              if (matched) {
                mapped._url = matched.url
                items.push(mapped)
              }
            }
            break
          }
        }
        if (!found) continue
      } else {
        const targetIds = new Set(group.targets.map((t) => t.itemId))
        for (const row of allItems) {
          const mapped = mapItem(row, config.itemMapping)
          const mappedId = mapped[config.itemIdField]
          if (targetIds.has(mappedId)) {
            const matched = group.targets.find((t) => t.itemId === mappedId)
            if (matched) mapped._url = matched.url
            items.push(mapped)
          }
        }

        for (const target of group.targets) {
          if (!items.some((item) => item[config.itemIdField] === target.itemId)) {
            logWarning(`${config.label} 未找到：${target.url}`)
          }
        }
      }
    } catch {
      logWarning(`${config.label} 拉取失败（group: ${group.groupKey}）`)
    }
  }

  return items
}

// ─── transport builder ──────────────────────────────────────

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
    return this.config.envCheckKeys.every((key) => {
      const val = (process.env[key] || '').trim()
      return val.length > 0
    })
  }

  getPresetUrls(): string[] {
    if (this.config.urls.length > 0) return this.config.urls
    return (process.env[this.config.presetUrlEnvKey] || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  async fetch(urls: string[]): Promise<Array<Record<string, string>>> {
    if (urls.length === 0) return []

    const transport = buildTransport(this.config)
    if (!transport) return []

    const client = new Client({ name: 'ai-review', version: '1.0.0' })

    try {
      await client.connect(transport)

      if (this.config.fetchMode === 'perUrl') {
        return await fetchPerUrl(client, urls, this.config)
      }

      return await fetchBatchByGroup(
        client,
        urls,
        this.config as ProviderConfig & { urlGrouping: UrlGrouping; itemsPath: string; itemIdField: string }
      )
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
