import { getRuntimeConfig } from '../../config/runtime-config.js'
import { getRegisteredProviders } from '../../providers/mcp/index.js'
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
  logInfo(`AI_REVIEW_WRITE_RESULT_TO_FILE: ${config.writeResultToFile}`)
  const providers = getRegisteredProviders()
  if (providers.length === 0) {
    logInfo('MCP: (未配置 mcp-providers.json)')
  } else {
    for (const p of providers) {
      const available = p.isAvailable()
      const urls = p.getPresetUrls()
      logInfo(`MCP ${p.label}: ${available ? '(已就绪)' : '(未配置连接)'} | URL: ${urls.length > 0 ? urls.join(' | ') : '(未配置)'}`)
    }
  }
  logInfo('====================================')
}
