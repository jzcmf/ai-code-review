import fs from 'node:fs'
import path from 'node:path'
import { logWarning } from '../../shared/logger.js'

export type McpTransport = StdioTransport | HttpTransport

export interface StdioTransport {
  type: 'stdio'
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface HttpTransport {
  type: 'http'
  url: string
}

export type FetchMode = 'perUrl' | 'batchByGroup'

export interface UrlGrouping {
  groupKeyRegex: string
  itemIdRegex: string
}

export interface ProviderConfig {
  id: string
  label: string
  itemLabel: string
  transport: McpTransport
  envCheckKeys: string[]
  presetUrlEnvKey: string
  /** 用户配置的文档 URL，存在则直接使用，跳过交互输入 */
  urls: string[]
  fetchMode: FetchMode
  toolName: string
  toolArgs: Record<string, unknown>
  responseTextPath: string
  itemMapping: Record<string, string>
  itemsPath: string
  itemIdField: string
  urlGrouping?: UrlGrouping
  formatTemplate: string
  maxBodyLength: number
}

function resolveEnvVars(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '')
  }
  if (Array.isArray(value)) {
    return value.map(resolveEnvVars)
  }
  if (value && typeof value === 'object') {
    const resolved: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      resolved[k] = resolveEnvVars(v)
    }
    return resolved
  }
  return value
}

function validateTransport(transport: unknown, context: string): McpTransport {
  const t = transport as Record<string, unknown> | undefined
  if (!t || typeof t.type !== 'string') {
    logWarning(`MCP 配置 [${context}] transport 无效，已跳过。`)
    throw new Error('INVALID_CONFIG')
  }
  if (t.type === 'stdio') {
    if (!t.command) throw new Error('INVALID_CONFIG')
    return {
      type: 'stdio',
      command: resolveEnvVars(t.command) as string,
      args: resolveEnvVars(Array.isArray(t.args) ? t.args : []) as string[],
      env: t.env ? (resolveEnvVars(t.env) as Record<string, string>) : undefined
    }
  }
  if (t.type === 'http') {
    if (!t.url) throw new Error('INVALID_CONFIG')
    return { type: 'http', url: resolveEnvVars(t.url) as string }
  }
  logWarning(`MCP 配置 [${context}] transport.type 不合法（仅支持 stdio / http），已跳过。`)
  throw new Error('INVALID_CONFIG')
}

function str(obj: Record<string, unknown>, key: string, fallback = ''): string {
  return (obj[key] as string) ?? fallback
}

function resolveConfigPath(): string {
  const configPath = process.env.AI_REVIEW_MCP_CONFIG_PATH || 'ai-code-review-mcp.json'
  return path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath)
}

function loadConfigFile(): ProviderConfig[] | null {
  const resolved = resolveConfigPath()
  try {
    if (!fs.existsSync(resolved)) return null
    const raw = fs.readFileSync(resolved, 'utf8')
    const parsed = JSON.parse(raw)
    const providers = parsed?.providers
    if (!Array.isArray(providers)) {
      logWarning(`MCP 配置文件 ${resolved} 格式错误：缺少 providers 数组。`)
      return null
    }
    return providers as ProviderConfig[]
  } catch {
    return null
  }
}

export function loadProviderConfigs(): ProviderConfig[] {
  const raw = loadConfigFile()
  if (!raw) return []

  const valid: ProviderConfig[] = []

  for (const item of raw) {
    const obj = item as unknown as Record<string, unknown>
    const id = str(obj, 'id')
    if (!id) {
      logWarning('MCP 配置中存在缺少 id 的条目，已跳过。')
      continue
    }
    const label = str(obj, 'label') || id
    const ctx = id

    try {
      const fetchMode: FetchMode = obj.fetchMode === 'batchByGroup' ? 'batchByGroup' : 'perUrl'
      const toolName = str(obj, 'toolName') || ''
      if (!toolName) {
        logWarning(`MCP 配置 [${ctx}] 缺少 toolName，已跳过。`)
        continue
      }

      const transport = validateTransport(obj.transport, ctx)

      // ── 智能默认值 ──
      const itemLabel = str(obj, 'itemLabel') || label
      const presetUrlEnvKey = str(obj, 'presetUrlEnvKey') || `AI_REVIEW_MCP_${id.toUpperCase()}_URLS`
      const envCheckKeys: string[] = Array.isArray(obj.envCheckKeys) ? obj.envCheckKeys as string[] : []

      const toolArgs = resolveEnvVars(
        (obj.toolArgs as Record<string, unknown>)
        ?? (fetchMode === 'perUrl' ? { url: '${url}' } : { workspace_id: '${groupKey}', limit: 200 })
      ) as Record<string, unknown>

      const itemMapping: Record<string, string> =
        (obj.itemMapping as Record<string, string> | undefined)
        ?? (fetchMode === 'perUrl' ? { title: 'title', body: 'body' } : { id: 'id', title: 'name', body: 'description' })

      const formatTemplate = str(obj, 'formatTemplate')
        || (fetchMode === 'perUrl'
          ? `### ${label}：{{title}}\n{{body}}`
          : `### ${label} #{{id}}：{{title}}\n{{body}}`)

      const config: ProviderConfig = {
        id,
        label,
        itemLabel,
        transport,
        envCheckKeys,
        presetUrlEnvKey,
        urls: Array.isArray(obj.urls) ? (obj.urls as string[]).filter((u) => typeof u === 'string' && u.trim()) : [],
        fetchMode,
        toolName,
        toolArgs,
        responseTextPath: str(obj, 'responseTextPath') || 'content[0].text',
        itemMapping,
        itemsPath: str(obj, 'itemsPath') || 'result',
        itemIdField: str(obj, 'itemIdField') || 'id',
        urlGrouping: obj.urlGrouping as UrlGrouping | undefined,
        formatTemplate,
        maxBodyLength: (obj.maxBodyLength as number) || 2000
      }

      if (fetchMode === 'batchByGroup' && !config.urlGrouping) {
        logWarning(`MCP 配置 [${ctx}] batchByGroup 模式下 urlGrouping 为必填，已跳过。`)
        continue
      }

      valid.push(config)
    } catch (e) {
      if (e instanceof Error && e.message === 'INVALID_CONFIG') continue
      logWarning(`MCP 配置 [${ctx}] 解析失败：${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  return valid
}

/** 将用户交互输入的 URL 写回 mcp-providers.json，下次直接使用 */
export function saveProviderUrls(urlMap: Record<string, string[]>): void {
  const configPath = resolveConfigPath()
  let doc: { providers: Array<Record<string, unknown>> }
  try {
    if (fs.existsSync(configPath)) {
      doc = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    } else {
      doc = { providers: [] }
    }
  } catch {
    return
  }

  if (!Array.isArray(doc.providers)) return

  for (const provider of doc.providers) {
    const id = provider.id as string | undefined
    if (id && urlMap[id]) {
      provider.urls = urlMap[id]
    }
  }

  try {
    fs.writeFileSync(configPath, JSON.stringify(doc, null, 2) + '\n', 'utf8')
  } catch {
    // 写回失败不影响主流程
  }
}
