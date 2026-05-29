import { ANSI_COLORS, colorize } from '../shared/logger.js'
import type { ReviewIssue, ReviewSummary } from '../shared/types.js'

export function dedupeIssues(issues: ReviewIssue[]): ReviewIssue[] {
  const seen = new Set<string>()
  const result: ReviewIssue[] = []
  for (const issue of issues) {
    const key = `${issue.file}|${issue.line}|${issue.level}|${issue.suggestion}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(issue)
  }
  return result
}

export function formatIssuesByFile(issues: ReviewIssue[], reviewedFiles: string[] = []): string {
  const docSummaries = issues.filter((issue) => issue.file === '参考文档')
  const codeIssues = issues.filter((issue) => issue.file !== '参考文档')
  const grouped = new Map<string, ReviewIssue[]>()

  for (const issue of codeIssues) {
    if (!grouped.has(issue.file)) grouped.set(issue.file, [])
    grouped.get(issue.file)?.push(issue)
  }

  const orderedFiles = reviewedFiles.length > 0 ? reviewedFiles : codeIssues.length > 0 ? Array.from(grouped.keys()) : []
  const lines: string[] = []

  if (docSummaries.length > 0) {
    lines.push(colorize('=============== 📄 参考文档要点 ===============', ANSI_COLORS.blue))
    for (const doc of docSummaries) {
      lines.push(`📋 ${doc.suggestion}`)
      if (doc.impact) lines.push(`   ${doc.impact}`)
    }
    lines.push('')
  }

  if (orderedFiles.length === 0 && docSummaries.length === 0) {
    return colorize('审查已通过✅', ANSI_COLORS.green)
  }

  if (orderedFiles.length === 0) {
    lines.push(colorize('审查已通过✅', ANSI_COLORS.green))
    return lines.join('\n').trim()
  }

  let index = 1
  for (const file of orderedFiles) {
    const fileIssues = grouped.get(file) || []
    lines.push(`${colorize(`## ${index}. 文件： `, ANSI_COLORS.blue)}${colorize(file, ANSI_COLORS.blue)}`)
    if (fileIssues.length === 0) {
      lines.push(colorize('审查已通过✅', ANSI_COLORS.green))
      lines.push('')
      index += 1
      continue
    }

    for (const issue of fileIssues) {
      const levelLabel = issue.level === 'high' ? '🔴 高风险' : issue.level === 'medium' ? '🟠 中风险' : '🟡 低风险'
      const location = typeof issue.line === 'number' && Number.isFinite(issue.line) ? `${issue.file}:${issue.line}:1` : issue.file
      lines.push(`${levelLabel} ${location} :\n${issue.suggestion}`)
    }
    lines.push('')
    index += 1
  }

  return lines.join('\n').trim()
}

export function summarizeIssues(issues: ReviewIssue[]): ReviewSummary {
  const hasHigh = issues.some((item) => item.level === 'high')
  const hasMedium = issues.some((item) => item.level === 'medium')
  const hasLow = issues.some((item) => item.level === 'low')
  return {
    hasHigh,
    hasMedium,
    hasLow,
    hasMediumOrHigh: hasHigh || hasMedium
  }
}
