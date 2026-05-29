import type { ParsedReviewIssues, ParseErrorEntry, ReviewIssue, ReviewLevel, ReviewPayload } from '../shared/types.js'

type UnknownRecord = Record<string, unknown>

function toRecord(value: unknown): UnknownRecord {
  if (typeof value === 'object' && value !== null) return value as UnknownRecord
  return {}
}

export class ReviewParser {
  constructor(private readonly pushParseError: (reason: string, rawText: string) => void) {}

  normalizeLevel(level: unknown): ReviewLevel {
    const lower = String(level || '').toLowerCase()
    if (['high', '严重', '高'].some((key) => lower.includes(key))) return 'high'
    if (['medium', '中'].some((key) => lower.includes(key))) return 'medium'
    return 'low'
  }

  extractReviewPayload(text: string): ReviewPayload {
    const normalized = String(text || '').trim()
    if (!normalized) {
      this.pushParseError('AI 响应为空，无法提取审查结果。', normalized)
      return { ok: false, status: 'invalid', issues: [] }
    }

    const firstBrace = normalized.indexOf('{')
    const lastBrace = normalized.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      const jsonText = normalized.slice(firstBrace, lastBrace + 1)
      try {
        const parsed = JSON.parse(jsonText) as UnknownRecord
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.issues)) {
          return {
            ok: true,
            status: parsed.status === 'issues' ? 'issues' : 'pass',
            issues: parsed.issues
          }
        }
        this.pushParseError('AI 响应 JSON 对象缺少合法的 issues 数组。', jsonText)
      } catch {
        this.pushParseError('AI 响应 JSON 对象解析失败。', jsonText)
      }
      return { ok: false, status: 'invalid', issues: [] }
    }

    const firstBracket = normalized.indexOf('[')
    const lastBracket = normalized.lastIndexOf(']')
    if (firstBracket === -1 || lastBracket === -1 || firstBracket >= lastBracket) {
      this.pushParseError('AI 响应中未找到合法的 JSON 对象或数组格式。', normalized)
      return { ok: false, status: 'invalid', issues: [] }
    }

    const jsonText = normalized.slice(firstBracket, lastBracket + 1)
    try {
      const legacyIssues = JSON.parse(jsonText)
      if (!Array.isArray(legacyIssues)) {
        this.pushParseError('AI 响应中的旧版 JSON 数组格式无效。', jsonText)
        return { ok: false, status: 'invalid', issues: [] }
      }
      return {
        ok: true,
        status: legacyIssues.length > 0 ? 'issues' : 'pass',
        issues: legacyIssues
      }
    } catch {
      this.pushParseError('AI 响应旧版 JSON 数组解析失败。', jsonText)
      return { ok: false, status: 'invalid', issues: [] }
    }
  }

  parseIssues(rawResponse: string, fallbackFiles: string[]): ParsedReviewIssues {
    const payload = this.extractReviewPayload(rawResponse)
    const fallbackFile = String(fallbackFiles[0] || 'unknown')
    const validIssues: ReviewIssue[] = []

    if (!payload.ok) {
      return { ok: false, status: 'invalid', issues: [] }
    }

    for (const item of payload.issues) {
      const record = toRecord(item)
      const suggestion = String(record.suggestion || record.message || '').trim()
      if (!suggestion) {
        const rawItem = JSON.stringify(item).slice(0, 200)
        this.pushParseError(`审查结果中存在缺少 suggestion 的项，已丢弃。文件: ${fallbackFile}`, rawItem)
        continue
      }

      const line = Number.parseInt(String(record.line ?? ''), 10)
      validIssues.push({
        level: this.normalizeLevel(record.level),
        file: String(record.file || fallbackFile),
        line: Number.isFinite(line) ? line : null,
        suggestion,
        impact: typeof record.impact === 'string' ? record.impact : undefined
      })
    }

    return { ok: true, status: payload.status, issues: validIssues }
  }
}

export function createParseError(reason: string, rawText: string): ParseErrorEntry {
  return {
    time: new Date().toISOString(),
    reason,
    text: String(rawText || '').slice(0, 500)
  }
}
