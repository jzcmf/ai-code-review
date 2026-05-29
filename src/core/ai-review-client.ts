import { askModelSelection, askReviewMode } from '../cli/menus.js'
import { buildUserPrompt } from '../context/prompt/index.js'
import { requestReviewRaw } from '../providers/ai/ai-api-client.js'
import { logInfo } from '../shared/logger.js'
import type { FileDiff, ReviewMode, ReviewResult } from '../shared/types.js'
import { ReviewParser } from './review-parser.js'
import { buildReviewUnits } from './review-units.js'
import { ReviewService } from './review-service.js'
import { resolvePostReviewAction, shouldBlockBySummary } from './post-review-action.js'
import type { Spinner } from '../shared/spinner.js'

export class AIReviewClient {
  private readonly reviewService = new ReviewService()
  private readonly parser = new ReviewParser(() => undefined)

  printReviewResult(reviewResult: ReviewResult): void {
    logInfo('=============== 🤖AI 审查结果如下：===============\n')
    console.log(reviewResult.outputText)
    logInfo('\n=============== 🤖AI 审查结果输出结束 ===============')
  }

  buildPrompt(
    fileDiffList: FileDiff[],
    customRulesContent = '',
    fileAstContexts?: Map<string, string>,
    tempPrompt = '',
    mcpContext = ''
  ): string {
    return buildUserPrompt(fileDiffList, customRulesContent, fileAstContexts, tempPrompt, mcpContext)
  }

  buildReviewUnits = buildReviewUnits
  askModelSelection = askModelSelection
  askReviewMode = askReviewMode
  shouldBlockBySummary = shouldBlockBySummary
  resolvePostReviewAction = resolvePostReviewAction

  async requestReview(
    fileDiffList: FileDiff[],
    model: string,
    maxFileDiffChars: number,
    fileAstContexts?: Map<string, string>,
    tempPrompt = '',
    mcpContext = '',
    reviewSpinner?: Spinner
  ): Promise<ReviewResult> {
    return this.reviewService.requestReview(
      fileDiffList,
      model,
      maxFileDiffChars,
      fileAstContexts,
      tempPrompt,
      mcpContext,
      reviewSpinner
    )
  }

  async testApiConnectivity(model: string): Promise<boolean> {
    const pingPrompt = '请仅返回 JSON 对象：{"status":"pass","issues":[]}'
    const raw = await requestReviewRaw(pingPrompt, model)
    const payload = this.parser.extractReviewPayload(raw.raw)
    return payload.ok && payload.status === 'pass' && Array.isArray(payload.issues)
  }
}
