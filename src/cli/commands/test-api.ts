import { getRuntimeConfig } from '../../config/runtime-config.js'
import { AIReviewClient } from '../../core/ai-review-client.js'
import { logError, logSuccess } from '../../shared/logger.js'

export async function runTestApiCommand(aiClient: AIReviewClient): Promise<number> {
  const { defaultModel } = getRuntimeConfig()
  if (!defaultModel) {
    logError('未配置默认模型，无法执行连通性测试。')
    return 1
  }

  const ok = await aiClient.testApiConnectivity(defaultModel)
  if (ok) {
    logSuccess('AI API 连通性测试通过。')
    return 0
  }

  logError('AI API 连通性测试失败。')
  return 1
}
