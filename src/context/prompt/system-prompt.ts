import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { logWarning } from '../../shared/logger.js'

const RULES_FILE = 'review-rules.mdc'

function resolveRulesPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), RULES_FILE),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..', RULES_FILE)
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

let cached: string | null = null

export function buildSystemPrompt(): string {
  if (cached !== null) return cached
  const rulesPath = resolveRulesPath()
  if (!rulesPath) {
    logWarning(`未找到 ${RULES_FILE}，暂未设置内置审查规则。`)
    cached = ''
    return cached
  }
  cached = fs.readFileSync(rulesPath, 'utf8').trim()
  return cached
}
