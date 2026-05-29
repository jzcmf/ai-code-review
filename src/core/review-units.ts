import { buildSystemPrompt } from '../context/prompt/index.js'
import { buildChunksFromHunks, exportSplitResult, splitDiffByHunks } from '../context/diff/diff-splitter.js'
import { getRuntimeConfig } from '../config/runtime-config.js'
import type { FileDiff, ReviewUnit } from '../shared/types.js'

export function buildReviewUnits(
  fileDiffList: FileDiff[],
  maxChars: number,
  fileAstContexts?: Map<string, string>,
  shouldExportSplitResult = true
): ReviewUnit[] {
  const units: ReviewUnit[] = []
  const fixedOverhead = buildSystemPrompt().length + 82

  for (const item of fileDiffList) {
    const hunks = splitDiffByHunks(item.diff)
    const astContext = fileAstContexts?.get(item.file)
    let effectiveMaxChars = maxChars - fixedOverhead

    if (astContext) {
      const perFileWrapper = 41 + item.file.length
      effectiveMaxChars -= astContext.length + perFileWrapper
      if (effectiveMaxChars < 200) effectiveMaxChars = 200
    }

    const chunks = buildChunksFromHunks(hunks, effectiveMaxChars)
    for (const chunkDiff of chunks) {
      units.push({
        files: [item.file],
        promptInput: [{ file: item.file, diff: chunkDiff }]
      })
    }
  }

  if (shouldExportSplitResult && getRuntimeConfig().writeDataToFile) {
    const reviewUnitDiffs = units.map((unit) => unit.promptInput.map((part) => part.diff).join('\n\n'))
    exportSplitResult(reviewUnitDiffs, fileDiffList.map((item) => item.file).join(', '))
  }

  return units
}
