import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_BASE_URL,
  DEFAULT_CUSTOM_RULES,
  DEFAULT_MAX_TOKENS,
  DEFAULT_REVIEW_MODE,
  DEFAULT_TEMPERATURE,
  MAX_FILE_DIFF_CHARS,
  MAX_TOTAL_DIFF_CHARS
} from './constants.js'
import type { ReviewMode, RuntimeConfig } from '../shared/types.js'

export interface CustomRulesContext {
  customRulesFilePath: string
  customRulesContent: string
}

let customRulesCache: CustomRulesContext | null = null

export function setCustomRulesCache(context: CustomRulesContext): void {
  customRulesCache = context
}

export function resetCustomRulesCache(): void {
  customRulesCache = null
}

export function resolveCustomRulesFilePath(): string {
  const rawPath = (process.env.AI_REVIEW_RULES_FILE_PATH || '').trim()
  if (!rawPath) return ''

  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath)
}

function validateReviewMode(raw: string): ReviewMode {
  const trimmed = raw.trim().toLowerCase()
  if (trimmed === 'diff-only') return 'diff-only'
  if (trimmed === 'diff-w') return 'diff-w'
  if (trimmed === 'diff-ast') return 'diff-ast'
  return DEFAULT_REVIEW_MODE
}

export function getModelCandidates(): string[] {
  const raw = process.env.AI_REVIEW_MODEL || ''
  if (!raw) return []

  return Array.from(
    new Set(
      raw
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

// 读取自定义规则文件内容
function getCustomRulesContext(): CustomRulesContext {
  if (customRulesCache) return customRulesCache

  const rulesPath = resolveCustomRulesFilePath()
  if (!rulesPath || !fs.existsSync(rulesPath)) {
    customRulesCache = {
      customRulesFilePath: rulesPath || '',
      customRulesContent: DEFAULT_CUSTOM_RULES
    }
    return customRulesCache
  }

  const externalRules = fs.readFileSync(rulesPath, 'utf8').trim()
  const mergedContent = externalRules
    ? `${DEFAULT_CUSTOM_RULES}\n\n${externalRules}`
    : DEFAULT_CUSTOM_RULES

  customRulesCache = {
    customRulesFilePath: rulesPath,
    customRulesContent: mergedContent
  }
  return customRulesCache
}

export function getRuntimeConfig(): RuntimeConfig {
  const baseURL = process.env.AI_REVIEW_BASE_URL || DEFAULT_BASE_URL
  const { customRulesFilePath, customRulesContent } = getCustomRulesContext()
  const modelCandidates = getModelCandidates()

  const maxFileDiffCharsRaw = Number.parseInt(process.env.MAX_FILE_DIFF_CHARS || '', 10)
  const maxFileDiffChars =
    Number.isFinite(maxFileDiffCharsRaw) && maxFileDiffCharsRaw > 0
      ? maxFileDiffCharsRaw
      : MAX_FILE_DIFF_CHARS

  const maxTotalDiffCharsRaw = Number.parseInt(process.env.MAX_TOTAL_DIFF_CHARS || '', 10)
  const maxTotalDiffChars =
    Number.isFinite(maxTotalDiffCharsRaw) && maxTotalDiffCharsRaw > 0
      ? maxTotalDiffCharsRaw
      : MAX_TOTAL_DIFF_CHARS

  const temperatureRaw = Number.parseFloat(process.env.AI_REVIEW_TEMPERATURE || '')
  const temperature =
    Number.isFinite(temperatureRaw) && temperatureRaw >= 0 ? temperatureRaw : DEFAULT_TEMPERATURE

  const maxTokensRaw = Number.parseInt(process.env.AI_REVIEW_MAX_TOKENS || '', 10)
  const maxTokens =
    Number.isFinite(maxTokensRaw) && maxTokensRaw > 0 ? maxTokensRaw : DEFAULT_MAX_TOKENS

  const reviewMode = validateReviewMode(process.env.AI_REVIEW_MODE || '')

  return {
    baseURL,
    fullUrl: `${baseURL.replace(/\/$/, '')}/v1/chat/completions`,
    defaultModel: modelCandidates.length > 0 ? modelCandidates[0] : null,
    allowOnError: process.env.AI_REVIEW_ALLOW_ON_ERROR === 'true',
    writeDataToFile: process.env.AI_REVIEW_WRITE_DATA_TO_FILE === 'true',
    modelCandidates,
    temperature,
    maxTokens,
    maxFileDiffChars,
    maxTotalDiffChars,
    customRulesFilePath,
    customRulesContent,
    reviewMode
  }
}
