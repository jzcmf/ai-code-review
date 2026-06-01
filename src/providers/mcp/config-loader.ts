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

export interface InputParseRule {
  field: string
  regex: string
}

export interface ProviderConfig {
  id: string
  label: string
  itemLabel: string
  transport: McpTransport
  presetInputEnvKey: string
  /** 用户配置的输入项，存在则直接使用，跳过交互输入 */
  inputs: string[]
  /** 输入解析规则，"raw" 表示整条输入原样作为 ${input} */
  inputParsing: InputParseRule[] | 'raw'
  toolName: string
  toolArgs: Record<string, unknown>
  responseTextPath: string
  itemMapping: Record<string, string>
  formatTemplate: string
  maxBodyLength: number
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
      command: t.command as string,
      args: Array.isArray(t.args) ? t.args as string[] : [],
      env: t.env as Record<string, string> | undefined
    }
  }
  if (t.type === 'http') {
    if (!t.url) throw new Error('INVALID_CONFIG')
    return { type: 'http', url: t.url as string }
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

function loadConfigFile(): unknown[] | null {
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
    return providers
  } catch {
    return null
  }
}

export function loadProviderConfigs(): ProviderConfig[] {
  const raw = loadConfigFile()
  if (!raw) return []

  const valid: ProviderConfig[] = []

  for (const item of raw) {
    const obj = item as Record<string, unknown>
    const id = str(obj, 'id')
    if (!id) {
      logWarning('MCP 配置中存在缺少 id 的条目，已跳过。')
      continue
    }
    const label = str(obj, 'label') || id
    const ctx = id

    try {
      const toolName = str(obj, 'toolName') || ''

      const transport = validateTransport(obj.transport, ctx)

      const itemLabel = str(obj, 'itemLabel') || label
      const presetInputEnvKey = str(obj, 'presetInputEnvKey') || `AI_REVIEW_MCP_${id.toUpperCase()}_INPUTS`

      const rawParsing = obj.inputParsing
      const inputParsing: InputParseRule[] | 'raw' =
        rawParsing === 'raw' || !Array.isArray(rawParsing)
          ? 'raw'
          : (rawParsing as InputParseRule[]).filter((r) => r.field && r.regex)

      const toolArgs = (obj.toolArgs as Record<string, unknown>) ?? { url: '${input}' }

      const itemMapping: Record<string, string> =
        (obj.itemMapping as Record<string, string> | undefined)
        ?? { title: 'title', body: 'body' }

      const formatTemplate = str(obj, 'formatTemplate')
        || `### ${label}：{{title}}\n{{body}}`

      const config: ProviderConfig = {
        id,
        label,
        itemLabel,
        transport,
        presetInputEnvKey,
        inputs: Array.isArray(obj.inputs) ? (obj.inputs as string[]).filter((u) => typeof u === 'string' && u.trim()) : [],
        inputParsing,
        toolName,
        toolArgs,
        responseTextPath: str(obj, 'responseTextPath') || 'content[0].text',
        itemMapping,
        formatTemplate,
        maxBodyLength: (obj.maxBodyLength as number) || 2000
      }

      valid.push(config)
    } catch (e) {
      if (e instanceof Error && e.message === 'INVALID_CONFIG') continue
      logWarning(`MCP 配置 [${ctx}] 解析失败：${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  return valid
}

export function saveProviderInputs(inputMap: Record<string, string[]>): void {
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
    if (id && inputMap[id]) {
      provider.inputs = inputMap[id]
    }
  }

  try {
    fs.writeFileSync(configPath, JSON.stringify(doc, null, 2) + '\n', 'utf8')
  } catch {
    // 写回失败不影响主流程
  }
}
