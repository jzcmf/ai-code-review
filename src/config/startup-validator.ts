import fs from 'node:fs'
import { ENV_FILE_NAME, DEFAULT_CUSTOM_RULES } from './constants.js'
import { getEnvLoadState } from './env-loader.js'
import { resolveCustomRulesFilePath, resetCustomRulesCache, setCustomRulesCache } from './runtime-config.js'
import { logError, logSuccess, logWarning } from '../shared/logger.js'

/**
 * 在审查流程开始时按固定顺序验证并输出关键配置。
 * 任一关键配置缺失都会返回 false，由调用方终止流程。
 */
export function validateStartupConfig(): boolean {
  resetCustomRulesCache()

  const envLoadState = getEnvLoadState()
  if (envLoadState.loadedFileCount === 0) {
    logError(`未找到环境配置文件（${ENV_FILE_NAME}），已终止审查。`)
    return false
  }
  logSuccess(`已加载环境文件：${envLoadState.loadedFilePaths[0]}`)

  const baseURLRaw = (process.env.AI_REVIEW_BASE_URL || '').trim()
  if (!baseURLRaw) {
    logError('缺少配置 AI_REVIEW_BASE_URL，已终止审查。')
    return false
  }
  const fullUrl = `${baseURLRaw.replace(/\/$/, '')}/v1/chat/completions`
  logSuccess(`当前请求地址：${fullUrl}`)

  const rulesPath = resolveCustomRulesFilePath()
  if (!rulesPath) {
    setCustomRulesCache({ customRulesFilePath: '', customRulesContent: DEFAULT_CUSTOM_RULES })
    return true
  }
  if (!fs.existsSync(rulesPath)) {
    logError(`自定义规则文件不存在：${rulesPath}，已终止审查。`)
    return false
  }

  const externalRules = fs.readFileSync(rulesPath, 'utf8').trim()
  if (!externalRules) {
    logWarning(`自定义规则文件为空：${rulesPath}，将使用内置默认规则。`)
    setCustomRulesCache({ customRulesFilePath: rulesPath, customRulesContent: DEFAULT_CUSTOM_RULES })
    return true
  }

  const mergedContent = `${DEFAULT_CUSTOM_RULES}\n\n${externalRules}`
  logSuccess(`已加载自定义规则文件：${rulesPath}`)
  setCustomRulesCache({ customRulesFilePath: rulesPath, customRulesContent: mergedContent })
  return true
}
