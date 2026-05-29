import { getRuntimeConfig } from '../../config/runtime-config.js'
import { logInfo } from '../../shared/logger.js'

export function printCurrentConfig(): void {
  const config = getRuntimeConfig()
  logInfo('=========== 当前审查配置 ===========')
  logInfo(`AI_REVIEW_BASE_URL: ${config.baseURL}`)
  logInfo(`AI_REVIEW_MODEL: ${config.modelCandidates.join(' | ') || '(未配置)'}`)
  logInfo(`AI_REVIEW_TEMPERATURE: ${config.temperature}`)
  logInfo(`AI_REVIEW_MAX_TOKENS: ${config.maxTokens}`)
  logInfo(`MAX_FILE_DIFF_CHARS: ${config.maxFileDiffChars}`)
  logInfo(`MAX_TOTAL_DIFF_CHARS: ${config.maxTotalDiffChars}`)
  logInfo(`AI_REVIEW_RULES_FILE_PATH: ${config.customRulesFilePath || '(未配置)'}`)
  logInfo(`AI_REVIEW_WRITE_DATA_TO_FILE: ${config.writeDataToFile}`)
  logInfo(`AI_REVIEW_MCP_ENABLED: ${config.mcpEnabled}`)
  logInfo(`AI_REVIEW_MCP_YUQUE_URLS: ${config.mcpYuqueUrls.join(' | ') || '(未配置)'}`)
  logInfo(`AI_REVIEW_MCP_TAPD_URLS: ${config.mcpTapdUrls.join(' | ') || '(未配置)'}`)
  logInfo(`内置语雀 MCP 网关: ${config.yuqueProxyUrl ? '(已内置)' : '(未内置)'}`)
  logInfo(`内置 TAPD MCP 网关: ${config.mcpTapdUrl ? '(已内置)' : '(未内置)'}`)
  logInfo('====================================')
}
