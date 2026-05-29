import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getRuntimeConfig } from '../config/runtime-config.js'
import { splitDiffByHunks } from '../context/diff/diff-splitter.js'
import { buildUserPrompt } from '../context/prompt/index.js'
import { requestReviewRaw } from '../providers/ai/ai-api-client.js'
import { runWithConcurrency } from '../shared/concurrency.js'
import { ANSI_COLORS, colorize, logInfo } from '../shared/logger.js'
import { Spinner } from '../shared/spinner.js'
import type { FileDiff, ParseErrorEntry, ReviewDataLogEntry, ReviewIssue, ReviewResult } from '../shared/types.js'
import { createParseError, ReviewParser } from './review-parser.js'
import { dedupeIssues, formatIssuesByFile, summarizeIssues } from './review-formatter.js'
import { buildReviewUnits } from './review-units.js'
import { askContinueMenu } from '../cli/menus.js'

export class ReviewService {
  private parseErrors: ParseErrorEntry[] = []
  private parser = new ReviewParser((reason, rawText) => this.pushParseError(reason, rawText))

  async requestReview(
    fileDiffList: FileDiff[],
    model: string,
    maxFileDiffChars: number,
    fileAstContexts?: Map<string, string>,
    tempPrompt = '',
    mcpContext = '',
    reviewSpinner?: Spinner
  ): Promise<ReviewResult> {
    this.parseErrors = []
    const totalHunks = fileDiffList.reduce((sum, item) => {
      const hunks = splitDiffByHunks(item.diff)
      return sum + hunks.filter((hunk) => hunk.startsWith('@@ ')).length
    }, 0)
    const units = buildReviewUnits(fileDiffList, maxFileDiffChars, fileAstContexts, false)

    if (getRuntimeConfig().writeDataToFile) {
      writeFileSync(join(process.cwd(), 'unit.json'), JSON.stringify(units, null, 2), 'utf-8')
    }

    if (units.length === 0) {
      return {
        issues: [],
        outputText: colorize('审查已通过✅', ANSI_COLORS.green),
        summary: { hasHigh: false, hasMedium: false, hasLow: false, hasMediumOrHigh: false }
      }
    }

    const totalDiffChars = fileDiffList.reduce((sum, item) => sum + item.diff.length, 0)
    const totalChunks = units.length
    const totalReviewUnits = units.length
    const { maxTotalDiffChars, writeDataToFile, customRulesContent } = getRuntimeConfig()

    if (totalDiffChars > maxTotalDiffChars) {
      if (process.stdin.isTTY) {
        logInfo(
          `当前审查总量 ${colorize(totalDiffChars, ANSI_COLORS.orange)} 字符，已超过建议阈值 ${colorize(maxTotalDiffChars, ANSI_COLORS.orange)}。`
        )
        const shouldContinue = await askContinueMenu(
          `⚠️ 本次预计分成 ${totalHunks} 个 hunk / ${totalChunks} 个 chunk / ${totalReviewUnits} 个审查片段（预计调用 ${totalReviewUnits} 次 AI），是否继续？(y/N): `
        )
        if (!shouldContinue) {
          const error = new Error('用户取消了超大批量 AI 审查。') as Error & { code?: string }
          error.code = 'USER_ABORTED_REVIEW'
          throw error
        }
      } else {
        logInfo(`当前审查总量 ${totalDiffChars} 字符，已超过建议阈值 ${maxTotalDiffChars}，非交互环境下将继续执行。`)
      }
    }

    if (reviewSpinner) {
      reviewSpinner.update(`正在审查 0/${totalReviewUnits} 个片段（共 ${fileDiffList.length} 个文件）`)
      reviewSpinner.start()
    } else {
      logInfo(
        `📜 正在按文件审查：共 ${colorize(fileDiffList.length, ANSI_COLORS.green)} 个文件 / ${colorize(totalHunks, ANSI_COLORS.green)} 个 hunk / ${colorize(totalChunks, ANSI_COLORS.green)} 个 chunk / ${colorize(totalReviewUnits, ANSI_COLORS.green)} 个审查片段`
      )
    }

    const rawIssues: ReviewIssue[] = []
    const dataLogs = new Array<ReviewDataLogEntry>(units.length)
    let completedUnits = 0
    const responses = await runWithConcurrency(units, async (unit, idx) => {
      const prompt = buildUserPrompt(unit.promptInput, customRulesContent, fileAstContexts, tempPrompt, mcpContext)
      const { raw, dataLog } = await requestReviewRaw(prompt, model)
      const reviewUnitDiff = unit.promptInput.map((part) => part.diff).join('\n\n')
      dataLogs[idx] = {
        reviewUnitIndex: idx + 1,
        reviewUnitLabel: `片段 ${idx + 1} / ${units.length}`,
        files: unit.files,
        chunkCount: unit.promptInput.length,
        diffChars: reviewUnitDiff.length,
        promptChars: prompt.length,
        promptInput: unit.promptInput.map((part, partIdx) => ({
          partIndex: partIdx + 1,
          file: part.file,
          diffChars: part.diff.length
        })),
        response: dataLog
      }
      completedUnits++
      reviewSpinner?.update(`正在审查 ${completedUnits}/${totalReviewUnits} 个片段（共 ${fileDiffList.length} 个文件）`)
      return { raw, files: unit.files }
    })

    for (const item of responses) {
      const parsed = this.parser.parseIssues(item.raw, item.files)
      if (!parsed.ok && units.length > 1) {
        this.pushParseError(`某个审查片段解析失败，模型可能未按格式输出。涉及文件: ${item.files.slice(0, 3).join(', ')}`, item.raw.slice(0, 500))
      }
      rawIssues.push(...parsed.issues)
    }

    const deduped = dedupeIssues(rawIssues)
    const codeIssues = deduped.filter((issue) => issue.file !== '参考文档')
    const summary = summarizeIssues(codeIssues)
    this.flushParseErrors()

    if (writeDataToFile) {
      writeFileSync(join(process.cwd(), 'ai-data-log.json'), JSON.stringify(dataLogs, null, 2), 'utf-8')
    }

    return {
      issues: deduped,
      outputText: formatIssuesByFile(deduped, fileDiffList.map((item) => item.file)),
      summary
    }
  }

  private pushParseError(reason: string, rawText: string): void {
    this.parseErrors.push(createParseError(reason, rawText))
  }

  private flushParseErrors(): void {
    if (this.parseErrors.length === 0 || !getRuntimeConfig().writeDataToFile) return
    const lines = [
      '# AI 审查解析错误日志',
      `# 生成时间: ${new Date().toLocaleString('zh-CN')}`,
      `# 错误数量: ${this.parseErrors.length}`,
      '',
      '='.repeat(80),
      ''
    ]

    for (let i = 0; i < this.parseErrors.length; i++) {
      const err = this.parseErrors[i]
      lines.push(`## 错误 ${i + 1} / ${this.parseErrors.length}`)
      lines.push(`时间: ${err.time}`)
      lines.push(`原因: ${err.reason}`)
      lines.push('原文(前500字符):')
      lines.push('```')
      lines.push(err.text)
      lines.push('```')
      lines.push('')
      lines.push('='.repeat(80))
      lines.push('')
    }

    try {
      writeFileSync(join(process.cwd(), 'ai-review-error-log.txt'), lines.join('\n'), 'utf-8')
    } catch {
      // 写文件失败不应影响主流程
    }
  }
}
