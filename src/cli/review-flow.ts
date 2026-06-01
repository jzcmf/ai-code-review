import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getRuntimeConfig } from '../config/runtime-config.js'
import { splitDiffByHunks } from '../context/diff/diff-splitter.js'
import { buildSystemPrompt, buildUserPrompt } from '../context/prompt/index.js'
import { AIReviewClient } from '../core/ai-review-client.js'
import { buildAstBlocks } from '../context/ast/ast-extractor.js'
import { getFileContentAtCommit, getFileDiff, getStagedFiles, isRelevantFile } from '../providers/git/git-provider.js'
import { getAvailableProviders } from '../providers/mcp/index.js'
import { saveProviderInputs } from '../providers/mcp/config-loader.js'
import { ANSI_COLORS, colorize, logError, logInfo, logSuccess, logWarning } from '../shared/logger.js'
import { Spinner } from '../shared/spinner.js'
import type { FileDiff, ReviewMode } from '../shared/types.js'
import { getErrorMessage } from '../shared/errors.js'
import { askMcpContext, askTempPrompt } from './menus.js'
import { resolveReviewModeFromArgs } from './args.js'

function collectReviewDiffs(relevantFiles: string[], mode: ReviewMode): FileDiff[] {
  const fileDiffList: FileDiff[] = []
  const diffMode = mode === 'diff-w' ? 'diff-w' : 'diff'

  for (const file of relevantFiles) {
    const rawDiff = getFileDiff(file, diffMode)
    if (!rawDiff) continue
    fileDiffList.push({ file, diff: rawDiff })
  }
  return fileDiffList
}

function collectFileContents(relevantFiles: string[]): Map<string, string> {
  const contents = new Map<string, string>()
  for (const file of relevantFiles) {
    const content = getFileContentAtCommit(file)
    if (content) contents.set(file, content)
  }
  return contents
}

async function resolveModelForCurrentRun(aiClient: AIReviewClient): Promise<string> {
  const { defaultModel, modelCandidates } = getRuntimeConfig()
  if (!defaultModel) {
    logError('未配置默认模型，请检查 .env.ai-review 文件中的 AI_REVIEW_MODEL 配置。')
    process.exit(1)
  }
  return aiClient.askModelSelection(modelCandidates, defaultModel)
}

async function loadLinkedDocs(): Promise<string> {
  const { writeDataToFile } = getRuntimeConfig()

  const availableProviders = getAvailableProviders()
  if (availableProviders.length === 0) return ''

  // Determine URL lists: config urls > env var preset > interactive prompt
  let urlMap: Record<string, string[]>
  const hasPresetUrls = availableProviders.some((p) => p.getPresetUrls().length > 0)
  if (hasPresetUrls) {
    urlMap = {}
    for (const p of availableProviders) {
      const urls = p.getPresetUrls()
      if (urls.length > 0) {
        urlMap[p.id] = urls
        logInfo(`已加载 ${urls.length} ${p.itemLabel} URL`)
      }
    }
  } else {
    urlMap = process.stdin.isTTY ? await askMcpContext() : {}
    if (Object.keys(urlMap).length > 0) {
      saveProviderInputs(urlMap)
    }
  }

  const hasUrls = Object.values(urlMap).some((urls) => urls.length > 0)
  if (!hasUrls) return ''

  const mcpSpinner = new Spinner('正在拉取关联文档...')
  mcpSpinner.start()

  const results: string[] = []
  const rawDataMap: Record<string, unknown[]> = {}

  try {
    for (const provider of availableProviders) {
      const urls = urlMap[provider.id]
      if (!urls || urls.length === 0) continue
      try {
        const items = await provider.fetch(urls)
        rawDataMap[provider.id] = items as unknown[]
        if (items.length > 0) {
          results.push(provider.format(items))
        }
      } catch {
        // provider.fetch handles its own error logging
      }
    }

    const summaryParts: string[] = []
    for (const provider of availableProviders) {
      const items = rawDataMap[provider.id]
      if (items && items.length > 0) summaryParts.push(`${items.length} ${provider.itemLabel}`)
    }

    if (results.length > 0) {
      mcpSpinner.succeed(`关联文档加载完成（${summaryParts.join('，')}）`)
    } else {
      mcpSpinner.warn('未拉取到关联文档，请检查 MCP 配置是否正确。')
    }
  } catch (error) {
    mcpSpinner.fail(`关联文档加载失败：${getErrorMessage(error)}`)
    throw error
  }

  if (writeDataToFile && rawDataMap && Object.keys(rawDataMap).length > 0) {
    writeFileSync(join(process.cwd(), 'ai-linked-docs.json'), JSON.stringify(rawDataMap, null, 2), 'utf-8')
    logInfo('关联文档已导出到 ai-linked-docs.json')
  }

  return results.join('\n\n')
}

export async function runReviewCommand(aiClient: AIReviewClient): Promise<number> {
  const stagedFiles = getStagedFiles()
  const relevantFiles = stagedFiles.filter(isRelevantFile)
  if (relevantFiles.length === 0) {
    logWarning('未检测到需要审查的暂存代码文件，已跳过。')
    return 0
  }

  const { maxFileDiffChars, writeDataToFile, reviewMode: configMode } = getRuntimeConfig()
  logInfo(`暂存文件数：${colorize(stagedFiles.length, ANSI_COLORS.green)}，实际审查文件数：${colorize(relevantFiles.length, ANSI_COLORS.green)}。`)

  const mcpContext = await loadLinkedDocs()
  const argMode = resolveReviewModeFromArgs()
  const pickedMode = process.stdin.isTTY ? await aiClient.askReviewMode(argMode ?? configMode) : argMode ?? configMode
  const tempPrompt = process.stdin.isTTY ? await askTempPrompt() : ''
  const fileDiffList = collectReviewDiffs(relevantFiles, pickedMode)

  if (fileDiffList.length === 0) {
    logWarning('未获取到可用的 diff 内容，已跳过。')
    return 0
  }

  logInfo(`实际审查 diff 文件数：${colorize(fileDiffList.length, ANSI_COLORS.green)}。`)
  let fileAstContexts: Map<string, string> | undefined

  if (pickedMode === 'diff-ast') {
    const astSpinner = new Spinner('正在提取 AST 上下文...')
    astSpinner.start()
    try {
      fileAstContexts = buildAstBlocks(fileDiffList, collectFileContents(relevantFiles))
      astSpinner.succeed(`AST 上下文提取完成（${fileAstContexts.size} 个文件）`)
    } catch (error) {
      astSpinner.fail(`AST 上下文提取失败：${getErrorMessage(error)}`)
      throw error
    }

    if (writeDataToFile) {
      const astEntries = Array.from(fileAstContexts.entries()).map(([file, ast]) => ({ file, ast }))
      writeFileSync(join(process.cwd(), 'ai-ast-contexts.json'), JSON.stringify(astEntries, null, 2), 'utf-8')
      logInfo(`AST 最小包含块已导出到 ai-ast-contexts.json，共 ${colorize(astEntries.length, ANSI_COLORS.green)} 个文件。`)
    }
  }

  const { customRulesContent } = getRuntimeConfig()
  const systemPromptLen = buildSystemPrompt().length
  const customRulesLen = (customRulesContent || '').length
  const diffLen = fileDiffList.reduce((sum, item) => sum + item.diff.length, 0)
  const contextLen = fileAstContexts ? Array.from(fileAstContexts.values()).reduce((sum, value) => sum + value.length, 0) : 0
  const previewPrompt = buildUserPrompt(fileDiffList, customRulesContent, fileAstContexts, tempPrompt, mcpContext)
  const previewTotalLen = systemPromptLen + previewPrompt.length
  const modeLabel = pickedMode === 'diff-w' ? 'diff -W' : pickedMode === 'diff-ast' ? 'diff only + AST' : 'diff only'
  const totalHunks = fileDiffList.reduce((sum, item) => {
    const hunks = splitDiffByHunks(item.diff)
    return sum + hunks.filter((hunk) => hunk.startsWith('@@ ')).length
  }, 0)
  const units = aiClient.buildReviewUnits(fileDiffList, maxFileDiffChars, fileAstContexts)
  const mcpLabel = mcpContext.length > 0 ? `${colorize(mcpContext.length, ANSI_COLORS.green)}（关联文档）` : '0'
  const contextLabel = contextLen > 0 ? `${colorize(contextLen, ANSI_COLORS.green)}（AST 最小包含块）` : '0'

  logInfo('=========== 预估提交审查字数 ===========')
  logInfo(`审查模式：          ${colorize(modeLabel, ANSI_COLORS.green)}`)
  logInfo(`默认提示词：        ${colorize(systemPromptLen, ANSI_COLORS.green)} 字`)
  logInfo(`用户自定义提示词：  ${colorize(customRulesLen, ANSI_COLORS.green)} 字`)
  logInfo(`diff 内容：         ${colorize(diffLen, ANSI_COLORS.green)} 字`)
  logInfo(`关联文档：          ${mcpLabel} 字`)
  logInfo(`上下文：            ${contextLabel} 字`)
  logInfo(`分片信息：          ${colorize(totalHunks, ANSI_COLORS.green)} 个 hunk / ${colorize(units.length, ANSI_COLORS.green)} 个 chunk / ${colorize(units.length, ANSI_COLORS.green)} 个 unit`)
  logInfo(`本次调用总计：      ${colorize(previewTotalLen, ANSI_COLORS.green)} 字（含格式化包装）`)
  logInfo('========================================')

  const pickedModel = await resolveModelForCurrentRun(aiClient)
  const reviewSpinner = new Spinner('正在等待 AI 审查...')
  let reviewResult
  try {
    reviewResult = await aiClient.requestReview(fileDiffList, pickedModel, maxFileDiffChars, fileAstContexts, tempPrompt, mcpContext, reviewSpinner)
  } catch (error) {
    reviewSpinner.fail(`AI 审查失败：${getErrorMessage(error)}`)
    if (getRuntimeConfig().writeResultToFile) {
      writeFileSync(join(process.cwd(), 'ai-review-result.txt'), `AI 审查失败：${getErrorMessage(error)}`, 'utf-8')
    }
    throw error
  }

  const issueCount = reviewResult.issues.filter((issue) => issue.file !== '参考文档').length
  reviewSpinner.succeed(issueCount === 0 ? 'AI 审查完成，未发现问题' : `AI 审查完成，发现 ${issueCount} 个问题`)
  aiClient.printReviewResult(reviewResult)

  if (getRuntimeConfig().writeResultToFile) {
    const plainText = reviewResult.outputText.replace(/\x1b\[[0-9;]*m/g, '')
    writeFileSync(join(process.cwd(), 'ai-review-result.txt'), plainText, 'utf-8')
    logInfo('审查结果已输出到 ai-review-result.txt')
  }

  const postReviewAction = await aiClient.resolvePostReviewAction(reviewResult)
  if (postReviewAction.allow) {
    if (postReviewAction.level === 'pass') logSuccess(postReviewAction.message)
    else logWarning(postReviewAction.message)
    return 0
  }

  logError(postReviewAction.message)
  return 1
}
