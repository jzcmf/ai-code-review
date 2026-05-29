import type { FileDiff } from '../../shared/types.js'

function buildJoinedDiff(fileDiffList: FileDiff[], fileAstContexts?: Map<string, string>): string {
  return fileDiffList
    .map(({ file, diff }) => {
      const astContext = fileAstContexts?.get(file)
      const contentSection = astContext ? `\n\n${astContext}` : ''
      return `## File: ${file}${contentSection}\n\n本次变更 diff：\n\`\`\`diff\n${diff}\n\`\`\``
    })
    .join('\n\n')
}

export function buildUserPrompt(
  fileDiffList: FileDiff[],
  customRulesContent = '',
  fileAstContexts?: Map<string, string>,
  tempPrompt = '',
  mcpContext = ''
): string {
  const joinedDiff = buildJoinedDiff(fileDiffList, fileAstContexts)
  const customRulesSection = customRulesContent ? ['项目自定义审查规则（必须遵守）：', customRulesContent.trim(), ''] : []
  const tempPromptSection = tempPrompt ? ['开发者审查提示（请重点关注以下方面）：', tempPrompt, ''] : []

  const mcpSection = mcpContext
    ? [
        '以下为本次变更相关的参考上下文，请结合审查：',
        mcpContext,
        '',
        '参考上下文的输出规则（按优先级执行）：',
        '1. 先判断参考文档与本次代码变更是否相关。',
        '   不相关的情形包括：文档描述的功能模块与变更文件无关、文档中的字段/接口名未出现在 diff 中、文档讨论的业务流程与本次改动明显不同。',
        '2. 如果不相关：在 issues 数组第一项输出 low 风险提示，file 填"参考文档"，suggestion 填"参考文档与本次代码变更无关，已忽略文档上下文"，不要强行关联，后续审查按无文档模式进行。',
        '3. 如果相关：在 issues 数组第一项以 low 风险输出文档中的关键需求要点摘要（file 填"参考文档"，line 填 null），后续审查项中引用文档内容作为判断依据时写入 impact 字段。',
        '4. 文档摘要项不计入实际代码问题，仅用于开发者确认上下文是否正确。',
        ''
      ]
    : []

  const hasAstContext = fileAstContexts && fileAstContexts.size > 0
  const contextHint = hasAstContext
    ? '每个文件都附带了变更所在函数的完整代码（含函数体）供你理解上下文，但请只审查 diff 中的变更。'
    : '请基于 diff 中的变更上下文进行审查。'

  return [
    '请基于以下暂存区改动执行代码审查。',
    contextHint,
    '请只输出当前这次改动直接相关的问题。',
    '',
    ...mcpSection,
    ...tempPromptSection,
    ...customRulesSection,
    '本次审查 diff：',
    joinedDiff
  ].join('\n')
}
