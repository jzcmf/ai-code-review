import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { logWarning } from '../../shared/logger.js'

export interface YuqueDoc {
  url: string
  title: string
  body: string
}

export interface TapdStory {
  id: string
  name: string
  description: string
}

interface TapdUrlInfo {
  workspaceId: string
  storyId: string
}

function buildYuqueTransport(proxyUrl: string): StdioClientTransport | null {
  const args = ['-y']
  const registry = (process.env.AI_REVIEW_MCP_NPM_REGISTRY || '').trim()
  if (registry) args.push('--registry', registry)
  const yuquePkg = (process.env.__AI_REVIEW_BUILD_MCP_YUQUE_PKG || '').trim()
  if (!yuquePkg) {
    logWarning('未内置语雀 MCP Server 包名，已跳过语雀文档上下文。')
    return null
  }
  args.push(yuquePkg)

  return new StdioClientTransport({
    command: 'npx',
    args,
    env: {
      ...process.env,
      YUQUE_PROXY_URL: proxyUrl
    }
  })
}

export async function fetchYuqueDocs(urls: string[], proxyUrl: string): Promise<YuqueDoc[]> {
  if (urls.length === 0) return []
  if (!proxyUrl) {
    logWarning('未内置语雀 MCP Server 代理网关地址，已跳过语雀文档上下文。')
    return []
  }

  const transport = buildYuqueTransport(proxyUrl)
  if (!transport) return []
  const client = new Client({ name: 'ai-review', version: '1.0.0' })

  try {
    await client.connect(transport)
    const docs: YuqueDoc[] = []

    for (const url of urls) {
      try {
        const result = await client.callTool({
          name: 'yuque_get_doc_by_url',
          arguments: { url, full: false }
        })
        const content = (result.content as Array<{ type: string; text?: string }>)?.[0]?.text
        if (content) {
          const parsed = JSON.parse(content)
          docs.push({
            url,
            title: parsed.title || '',
            body: parsed.body || ''
          })
        }
      } catch {
        logWarning(`语雀文档拉取失败：${url}`)
      }
    }

    return docs
  } catch {
    logWarning('语雀 MCP Server 连接失败，已跳过文档上下文。')
    return []
  } finally {
    try {
      await client.close()
    } catch {
      // ignore
    }
  }
}

function parseTapdUrl(url: string): TapdUrlInfo | null {
  const wsMatch = url.match(/tapd\.cn\/[^/]*?\/(\d+)/)
  if (!wsMatch) return null
  const workspaceId = wsMatch[1]

  const dialogMatch = url.match(/dialog_preview_id=story_(\d+)/)
  if (dialogMatch) return { workspaceId, storyId: dialogMatch[1] }

  const pathMatch = url.match(/\/(\d{10,})(?:\?|$)/)
  if (pathMatch) return { workspaceId, storyId: pathMatch[1] }

  return null
}

export async function fetchTapdStories(urls: string[], tapdUrl: string): Promise<TapdStory[]> {
  if (urls.length === 0) return []

  const byWorkspace = new Map<string, Array<{ url: string; storyId: string }>>()
  for (const url of urls) {
    const info = parseTapdUrl(url)
    if (info) {
      if (!byWorkspace.has(info.workspaceId)) byWorkspace.set(info.workspaceId, [])
      byWorkspace.get(info.workspaceId)?.push({ url, storyId: info.storyId })
    } else {
      logWarning(`TAPD URL 格式无法识别：${url}`)
    }
  }
  if (byWorkspace.size === 0) return []

  if (!tapdUrl) {
    logWarning('未配置 TAPD MCP Gateway 地址，已跳过需求上下文。')
    return []
  }

  const transport = new StreamableHTTPClientTransport(new URL(tapdUrl))
  const client = new Client({ name: 'ai-review', version: '1.0.0' })

  try {
    await client.connect(transport)
    const stories: TapdStory[] = []

    for (const [workspaceId, targets] of byWorkspace) {
      try {
        const result = await client.callTool({
          name: 'getStories',
          arguments: { workspace_id: workspaceId, limit: 200 }
        })
        const content = (result.content as Array<{ type: string; text?: string }>)?.[0]?.text
        if (!content) continue

        const parsed = JSON.parse(content)
        const allItems: Array<Record<string, unknown>> = parsed.result || parsed.data || (Array.isArray(parsed) ? parsed : [])
        const targetIds = new Set(targets.map((target) => target.storyId))

        for (const item of allItems) {
          const story = (item.Story || item) as Record<string, unknown>
          const storyId = String(story.id || '')
          if (targetIds.has(storyId)) {
            stories.push({
              id: storyId,
              name: String(story.name || ''),
              description: String(story.description || '')
            })
          }
        }

        for (const target of targets) {
          if (!stories.some((story) => story.id === target.storyId)) {
            logWarning(`TAPD 需求未找到：${target.url}`)
          }
        }
      } catch {
        logWarning(`TAPD 拉取失败（workspace: ${workspaceId}）`)
      }
    }

    return stories
  } catch {
    logWarning('TAPD MCP Gateway 连接失败，已跳过需求上下文。')
    return []
  } finally {
    try {
      await client.close()
    } catch {
      // ignore
    }
  }
}

export function formatYuqueContext(docs: YuqueDoc[]): string {
  if (docs.length === 0) return ''

  return docs
    .map((doc, i) => {
      const title = doc.title || `文档 ${i + 1}`
      const body = doc.body.length > 3000 ? `${doc.body.slice(0, 3000)}\n\n...（内容已截断）` : doc.body
      return `### 语雀文档：${title}\n${body}`
    })
    .join('\n\n---\n\n')
}

export function formatTapdContext(stories: TapdStory[]): string {
  if (stories.length === 0) return ''

  return stories
    .map((story) => {
      const desc = story.description
        ? story.description.length > 2000
          ? `${story.description.slice(0, 2000)}\n...（内容已截断）`
          : story.description
        : '(无描述)'
      return `### TAPD 需求 #${story.id}：${story.name}\n${desc}`
    })
    .join('\n\n---\n\n')
}
