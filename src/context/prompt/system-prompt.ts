import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

declare const __BUILTIN_RULES__: string

let cached: string | null = null

export function buildSystemPrompt(): string {
  if (cached !== null) return cached

  if (process.env.AI_REVIEW_DISABLE_BUILTIN_RULES === 'true') {
    cached = ''
    return cached
  }

  // esbuild define 在构建时注入 review-rules.mdc 内容；tsx 开发模式下 typeof 为 undefined，回退读文件
  if (typeof __BUILTIN_RULES__ === 'string') {
    cached = __BUILTIN_RULES__
    return cached
  }

  const sourcePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..', 'review-rules.mdc')
  if (fs.existsSync(sourcePath)) {
    cached = fs.readFileSync(sourcePath, 'utf8').trim()
    return cached
  }

  cached = ''
  return cached
}
