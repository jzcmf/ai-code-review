import type { ReviewMode } from '../shared/types.js'

export const DEFAULT_BASE_URL = 'https://api.deepseek.com'
export const DEFAULT_MODEL = 'deepseek-v4-pro'
export const DEFAULT_TEMPERATURE = 0.2
export const DEFAULT_REVIEW_MODE: ReviewMode = 'diff-only'
export const DEFAULT_MAX_TOKENS = 2000
export const MAX_FILE_DIFF_CHARS = 18000
export const MAX_TOTAL_DIFF_CHARS = 50000
export const ENV_FILE_NAME = '.env.ai-review'

export const CODE_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.vue',
  '.py',
  '.java',
  '.go',
  '.php',
  '.rb'
] as const

export const IGNORED_PATH_PARTS = ['node_modules/', 'dist/', 'build/', '.git/', 'coverage/'] as const
