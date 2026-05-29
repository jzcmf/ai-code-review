import { askContinueMenu } from '../cli/menus.js'
import type { ReviewActionDecision, ReviewResult, ReviewSummary } from '../shared/types.js'

export function shouldBlockBySummary(summary: ReviewSummary): 'pass' | 'block' | 'confirm' {
  if (summary.hasMediumOrHigh) return 'block'
  if (summary.hasLow) return 'confirm'
  return 'pass'
}

export async function resolvePostReviewAction(reviewResult: ReviewResult): Promise<ReviewActionDecision> {
  const decision = shouldBlockBySummary(reviewResult.summary)
  if (decision === 'pass') {
    return { allow: true, level: 'pass', message: '🤖审查通过，允许继续提交。' }
  }

  if (decision === 'block') {
    return { allow: false, level: 'block', message: '检测到中高风险问题，已阻止提交。' }
  }

  if (!process.stdin.isTTY) {
    return {
      allow: false,
      level: 'confirm',
      message: '非交互环境下检测到低风险问题，已阻止提交。'
    }
  }

  const continueCommit = await askContinueMenu()
  if (!continueCommit) {
    return { allow: false, level: 'confirm', message: '⛔  用户取消提交。' }
  }
  return { allow: true, level: 'confirm', message: '用户选择忽略风险并继续提交。' }
}
