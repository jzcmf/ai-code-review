import { loadLocalEnvFiles } from '../config/env-loader.js'
import { validateStartupConfig } from '../config/startup-validator.js'
import { getRuntimeConfig } from '../config/runtime-config.js'
import { AIReviewClient } from '../core/ai-review-client.js'
import { getErrorMessage } from '../shared/errors.js'
import { logError, logInfo, logWarning } from '../shared/logger.js'
import { resolveCommandFromArgs } from './args.js'
import { printCurrentConfig } from './commands/print-config.js'
import { runTestApiCommand } from './commands/test-api.js'
import { runMcpListCommand } from './commands/mcp-list.js'
import { runReviewCommand } from './review-flow.js'

type ReviewAbortError = Error & { code?: string }

export async function main(): Promise<void> {
  const command = resolveCommandFromArgs()

  // mcp-list 不依赖 AI 配置和暂存文件，独立运行
  if (command === 'mcp-list') {
    process.exit(await runMcpListCommand())
  }

  const aiClient = new AIReviewClient()
  logInfo('开始执行 AI 代码审查。')

  const loaded = await loadLocalEnvFiles()
  if (!loaded) process.exit(0)
  if (!validateStartupConfig()) process.exit(1)

  try {
    if (command === 'print-config') {
      printCurrentConfig()
      process.exit(0)
    }

    if (command === 'test-api') {
      process.exit(await runTestApiCommand(aiClient))
    }

    process.exit(await runReviewCommand(aiClient))
  } catch (error) {
    const reviewError = error as ReviewAbortError
    if (reviewError?.code === 'USER_ABORTED_REVIEW') {
      logWarning(reviewError.message)
      process.exit(1)
    }

    const { allowOnError } = getRuntimeConfig()
    logError(`审查执行失败：${getErrorMessage(error)}`)
    if (allowOnError) {
      logWarning('因 AI_REVIEW_ALLOW_ON_ERROR=true，失败后仍允许继续提交。')
      process.exit(0)
    }
    process.exit(1)
  }
}
