import { stdin as input, stdout as output } from 'node:process'
import readline from 'node:readline'
import { logInfo, logSuccess } from '../shared/logger.js'
import { getAvailableProviders } from '../providers/mcp/index.js'
import type { McpProvider } from '../providers/mcp/types.js'
import type { ReviewMode } from '../shared/types.js'

interface MenuOption<T extends string> {
  id: T
  label: string
}

type Keypress = {
  ctrl?: boolean
  name?: string
}

function createSelectionMenu<T extends string>(
  title: string,
  options: MenuOption<T>[],
  defaultIndex = 0,
  onSelect?: (value: MenuOption<T>) => void
): Promise<T> {
  let selectedIndex = Math.max(Math.min(defaultIndex, options.length - 1), 0)
  let renderedLines = 0

  const renderMenu = (): void => {
    if (renderedLines > 0) {
      readline.moveCursor(output, 0, -renderedLines)
      readline.clearScreenDown(output)
    }

    const lines = [
      title,
      ...options.map((option, index) => {
        const pointer = index === selectedIndex ? '>' : ' '
        return `${pointer} ${index + 1}. ${option.label}`
      })
    ]
    output.write(`${lines.join('\n')}\n`)
    renderedLines = lines.length
  }

  const canUseRawMode = typeof input.setRawMode === 'function'
  readline.emitKeypressEvents(input)
  if (canUseRawMode) input.setRawMode(true)
  input.resume()

  return new Promise((resolve) => {
    const cleanup = (): void => {
      input.off('keypress', onKeypress)
      if (renderedLines > 0) {
        readline.moveCursor(output, 0, -renderedLines)
        readline.clearScreenDown(output)
      }
      if (canUseRawMode) input.setRawMode(false)
    }

    const onKeypress = (_str: string, key?: Keypress): void => {
      if (!key) return
      if (key.ctrl && key.name === 'c') {
        cleanup()
        process.exit(1)
      }
      if (key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length
        renderMenu()
        return
      }
      if (key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % options.length
        renderMenu()
        return
      }
      if (key.name === 'return') {
        const selected = options[selectedIndex]
        cleanup()
        onSelect?.(selected)
        resolve(selected.id)
      }
    }

    renderMenu()
    input.on('keypress', onKeypress)
  })
}

export async function askModelSelection(candidates: string[], defaultModel: string): Promise<string> {
  if (!process.stdin.isTTY) return candidates[0] || defaultModel
  const options: MenuOption<string>[] = candidates.map((model) => ({ id: model, label: model }))
  return createSelectionMenu('检测到可选模型列表，请用 ↑/↓ 选择，回车确认：', options, 0, (selected) => {
    logSuccess(`已选择模型：${selected.label}`)
  })
}

export async function askContinueMenu(promptText = '⚠️ 检测到潜在问题，是否仍继续提交？(y/N): '): Promise<boolean> {
  const rl = readline.createInterface({ input, output, terminal: true })
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close()
      resolve(['y', 'yes'].includes(String(answer).trim().toLowerCase()))
    })
  })
}

export async function askMcpContext(): Promise<Record<string, string[]>> {
  if (!process.stdin.isTTY) return {}

  const providers = getAvailableProviders()
  if (providers.length === 0) return {}

  const rl = readline.createInterface({ input, output, terminal: true })
  const labels = providers.map((p) => p.label).join(' / ')
  const useMcp = await new Promise<boolean>((resolve) => {
    rl.question(`\n是否带入关联文档（${labels}）？(y/N): `, (answer) => {
      resolve(['y', 'yes'].includes(String(answer).trim().toLowerCase()))
    })
  })
  if (!useMcp) {
    rl.close()
    return {}
  }

  const result: Record<string, string[]> = {}
  for (const provider of providers) {
    const urls = await new Promise<string[]>((resolve) => {
      rl.question(`请输入${provider.label} URL（多个用空格分隔，直接回车跳过）:\n> `, (answer) => {
        resolve(String(answer).trim().split(/\s+/).filter(Boolean))
      })
    })
    if (urls.length > 0) {
      result[provider.id] = urls
      logSuccess(`已录入 ${urls.length} ${provider.itemLabel} URL`)
    }
  }

  rl.close()
  return result
}

export async function askUseCachedUrls(provider: McpProvider): Promise<boolean> {
  if (!process.stdin.isTTY) return true

  const urls = provider.getPresetUrls()
  logInfo(`${provider.label} 历史缓存:`)
  for (const url of urls) {
    logInfo(`  - ${url}`)
  }

  const rl = readline.createInterface({ input, output, terminal: true })
  return new Promise((resolve) => {
    rl.question(`是否沿用以上缓存？(y/N): `, (answer) => {
      rl.close()
      resolve(['y', 'yes'].includes(String(answer).trim().toLowerCase()))
    })
  })
}

export async function askProviderInput(provider: McpProvider): Promise<string[]> {
  if (!process.stdin.isTTY) return []

  const rl = readline.createInterface({ input, output, terminal: true })
  return new Promise((resolve) => {
    rl.question(`请输入${provider.label} URL（多个用空格分隔，直接回车跳过）:\n> `, (answer) => {
      rl.close()
      resolve(String(answer).trim().split(/\s+/).filter(Boolean))
    })
  })
}

export async function askTempPrompt(): Promise<string> {
  if (!process.stdin.isTTY) return ''

  const rl = readline.createInterface({ input, output, terminal: true })
  return new Promise((resolve) => {
    rl.question(`\n请输入本次审查的临时提示（如"重点关注支付逻辑"，直接回车跳过）:\n> `, (answer) => {
      rl.close()
      resolve(String(answer).trim())
    })
  })
}

export async function askReviewMode(defaultMode: ReviewMode): Promise<ReviewMode> {
  if (!process.stdin.isTTY) return defaultMode

  const options: MenuOption<ReviewMode>[] = [
    { id: 'diff-only', label: 'diff only（仅变更行上下文，最省 token）' },
    { id: 'diff-w', label: 'diff -W（Git 函数级上下文，理解更准）' },
    { id: 'diff-ast', label: 'diff only + AST（提取变更所在函数完整代码，Vue/JS/TS 适用）' }
  ]

  const defaultIndex = options.findIndex((option) => option.id === defaultMode)
  return createSelectionMenu('请选择审查模式（↑/↓ 选择，回车确认）：', options, Math.max(defaultIndex, 0), (selected) => {
    logSuccess(`已选择审查模式：${selected.label}`)
  })
}
