import { parse } from '@babel/parser'
import type {
  ClassDeclaration,
  ClassMethod,
  FunctionDeclaration,
  Node,
  ObjectMethod,
  TSInterfaceDeclaration,
  TSTypeAliasDeclaration,
  VariableDeclarator
} from '@babel/types'
import type { FileDiff } from '../../shared/types.js'

interface CodeBlock {
  name: string
  type: string
  startLine: number
  endLine: number
  code: string
}

function getNodeName(node: Node): string {
  switch (node.type) {
    case 'FunctionDeclaration':
      return (node as FunctionDeclaration).id?.name || '(anonymous)'
    case 'ClassDeclaration':
      return (node as ClassDeclaration).id?.name || '(anonymous class)'
    case 'TSInterfaceDeclaration':
      return (node as TSInterfaceDeclaration).id?.name || '(anonymous interface)'
    case 'TSTypeAliasDeclaration':
      return (node as TSTypeAliasDeclaration).id?.name || '(anonymous type)'
    default:
      return '(anonymous)'
  }
}

function getBlockType(node: Node): string {
  switch (node.type) {
    case 'FunctionDeclaration':
      return '函数'
    case 'FunctionExpression':
      return '函数表达式'
    case 'ArrowFunctionExpression':
      return '箭头函数'
    case 'ClassDeclaration':
    case 'ClassExpression':
      return '类'
    case 'ClassMethod':
      return '类方法'
    case 'ObjectMethod':
      return '对象方法'
    case 'TSInterfaceDeclaration':
      return '接口'
    case 'TSTypeAliasDeclaration':
      return '类型别名'
    case 'VariableDeclarator':
      return '变量'
    default:
      return node.type
  }
}

function isFunctionNode(node: Node): boolean {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'ClassMethod' ||
    node.type === 'ObjectMethod' ||
    node.type === 'TSMethodSignature'
  )
}

function isBlockNode(node: Node): boolean {
  return (
    isFunctionNode(node) ||
    node.type === 'ClassDeclaration' ||
    node.type === 'ClassExpression' ||
    node.type === 'TSInterfaceDeclaration' ||
    node.type === 'TSTypeAliasDeclaration' ||
    node.type === 'TSModuleDeclaration'
  )
}

function walkAst(node: unknown, callback: (n: Node) => void): void {
  if (!node || typeof node !== 'object') return
  const n = node as { type?: unknown; [key: string]: unknown }
  if (!n.type || typeof n.type !== 'string') return
  callback(node as Node)
  for (const key of Object.keys(n)) {
    if (key === 'type') continue
    const value = n[key]
    if (Array.isArray(value)) {
      for (const item of value) walkAst(item, callback)
    } else if (value && typeof value === 'object') {
      walkAst(value, callback)
    }
  }
}

function parseSourceCode(code: string, filePath: string, forceTs = false, forceJsx = false): Node | null {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  const isTs = forceTs || /\.(ts|tsx|mts|cts)$/i.test(ext)
  const isJsx = forceJsx || /\.(tsx|jsx)$/i.test(ext)

  try {
    return parse(code, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: [
        ...(isTs ? (['typescript'] as const) : []),
        ...(isJsx ? (['jsx'] as const) : []),
        'decorators',
        'decoratorAutoAccessors',
        'explicitResourceManagement'
      ],
      attachComment: false
    })
  } catch {
    try {
      return parse(code, {
        sourceType: 'script',
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: [...(isTs ? (['typescript'] as const) : []), ...(isJsx ? (['jsx'] as const) : [])],
        attachComment: false
      })
    } catch {
      return null
    }
  }
}

function collectCodeBlocks(ast: Node, code: string, lineOffset = 0): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const lines = code.split('\n')

  walkAst(ast, (node) => {
    if (!isBlockNode(node) || !node.loc) return

    const startLine = (node.loc.start?.line ?? 0) + lineOffset
    const endLine = (node.loc.end?.line ?? 0) + lineOffset
    if (startLine <= 0 || endLine <= 0 || endLine < startLine) return

    const blockCode = lines.slice(startLine - 1 - lineOffset, endLine - lineOffset).join('\n')
    let name = getNodeName(node)
    let type = getBlockType(node)

    if (node.type === 'ClassMethod' || node.type === 'ObjectMethod') {
      const methodNode = node as ClassMethod | ObjectMethod
      const methodName = methodNode.key?.type === 'Identifier' ? methodNode.key.name : undefined
      if (methodName) {
        name = methodName
        type = '类方法'
      }
    }

    if (node.type === 'VariableDeclarator') {
      const decl = node as VariableDeclarator
      const idName = decl.id?.type === 'Identifier' ? decl.id.name : undefined
      const initType = decl.init?.type
      if (initType === 'ArrowFunctionExpression' || initType === 'FunctionExpression') {
        name = idName || '(anonymous)'
        type = initType === 'ArrowFunctionExpression' ? '箭头函数' : '函数'
      }
    }

    blocks.push({ name, type, startLine, endLine, code: blockCode })
  })

  return blocks
}

function extractChangedLinesFromDiff(diff: string): number[] {
  const lines: number[] = []
  const lineRegex = /\((?:\d+|\s*),\s*(\d+)\)\s*([+-])/g
  let match: RegExpExecArray | null

  while ((match = lineRegex.exec(diff)) !== null) {
    const newLine = parseInt(match[1], 10)
    const marker = match[2]
    if (marker === '+' && !Number.isNaN(newLine) && newLine > 0) {
      lines.push(newLine)
    }
  }

  return Array.from(new Set(lines)).sort((a, b) => a - b)
}

function findMinimalContainingBlocks(changedLines: number[], blocks: CodeBlock[]): CodeBlock[] {
  const result: CodeBlock[] = []
  const usedKeys = new Set<string>()

  for (const line of changedLines) {
    const containing = blocks
      .filter((b) => line >= b.startLine && line <= b.endLine)
      .sort((a, b) => a.endLine - a.startLine - (b.endLine - b.startLine))
    if (containing.length === 0) continue

    const innermost = containing[0]
    const key = `${innermost.startLine}-${innermost.endLine}`
    if (usedKeys.has(key)) continue
    usedKeys.add(key)
    result.push(innermost)
  }

  return result.sort((a, b) => a.startLine - b.startLine)
}

const MAX_BLOCK_LINES = 100
const CONTEXT_AROUND_CHANGE = 30

function truncateBlockCode(block: CodeBlock, changedLines: number[]): string {
  const lines = block.code.split('\n')
  if (lines.length <= MAX_BLOCK_LINES) return block.code

  const changedIndices = changedLines
    .filter((line) => line >= block.startLine && line <= block.endLine)
    .map((line) => line - block.startLine)
  if (changedIndices.length === 0) return block.code

  const minChanged = Math.min(...changedIndices)
  const maxChanged = Math.max(...changedIndices)
  const preserveStart = Math.max(0, minChanged - CONTEXT_AROUND_CHANGE)
  const preserveEnd = Math.min(lines.length - 1, maxChanged + CONTEXT_AROUND_CHANGE)
  const result: string[] = []

  if (preserveStart > 0) {
    result.push(lines[0])
    const omitted = preserveStart - 1
    if (omitted > 0) result.push(`  // ... (前略 ${omitted} 行) ...`)
  }

  result.push(...lines.slice(preserveStart > 0 ? preserveStart : 0, preserveEnd + 1))

  if (preserveEnd < lines.length - 1) {
    result.push(`  // ... (后略 ${lines.length - 1 - preserveEnd} 行) ...`)
  }

  return result.join('\n')
}

function normalizeAstBlockCode(code: string): string {
  if (!code) return code

  const lines = code.split('\n')
  const compressed: string[] = []
  let blankRun = 0

  for (const rawLine of lines) {
    const trimmedRight = rawLine.replace(/[ \t]+$/u, '')
    if (trimmedRight.trim() === '') {
      blankRun += 1
      if (blankRun > 1) continue
      compressed.push('')
      continue
    }

    blankRun = 0
    const indent = trimmedRight.match(/^[ \t]*/)?.[0] ?? ''
    const rest = trimmedRight.slice(indent.length)
    let normalizedIndent = indent.replace(/\t/g, '  ')
    if (normalizedIndent.length > 4) {
      const depth = Math.floor(normalizedIndent.length / 2)
      normalizedIndent = '  '.repeat(depth)
    }
    compressed.push(normalizedIndent + rest)
  }

  while (compressed.length > 0 && compressed[compressed.length - 1] === '') compressed.pop()
  while (compressed.length > 0 && compressed[0] === '') compressed.shift()
  return compressed.join('\n')
}

function formatAstBlocks(filePath: string, blocks: CodeBlock[], changedLines: number[]): string {
  if (blocks.length === 0) return ''

  const lines: string[] = [`=== ${filePath} 相关代码块 ===`, '']

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const totalLines = block.endLine - block.startLine + 1
    const isTruncated = totalLines > MAX_BLOCK_LINES
    const rawDisplayCode = isTruncated ? truncateBlockCode(block, changedLines) : block.code
    const truncatedLabel = isTruncated ? ', 已截断' : ''

    lines.push(`【代码块 ${i + 1}/${blocks.length}】${block.name} (${block.type}, 第 ${block.startLine}-${block.endLine} 行${truncatedLabel})`)
    lines.push('```')
    lines.push(normalizeAstBlockCode(rawDisplayCode))
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}

const VUE_SETUP_MACROS = [
  'defineProps',
  'defineEmits',
  'defineExpose',
  'defineModel',
  'defineOptions',
  'defineSlots',
  'withDefaults'
]

function sanitizeVueSetupMacros(code: string): string {
  let result = code
  for (const macro of VUE_SETUP_MACROS) {
    result = result.replace(new RegExp(`\\b${macro}\\b\\s*<[^>]*>\\s*\\([^)]*\\)`, 'g'), `function ${macro}(){}`)
    result = result.replace(new RegExp(`\\b${macro}\\b\\s*\\([^)]*\\)`, 'g'), `function ${macro}(){}`)
  }
  return result
}

function extractVueScript(content: string): { code: string; lineOffset: number; isTs: boolean; isJsx: boolean } | null {
  const tagMatch = content.match(/<script\b([^>]*?)>/)
  if (!tagMatch) return null

  const attributes = tagMatch[1] || ''
  const isTs = /\blang\s*=\s*["']ts["']/.test(attributes)
  const isJsx = /\blang\s*=\s*["']tsx["']/.test(attributes)
  const isSetup = /\bsetup\b/.test(attributes)
  const openTag = tagMatch[0]
  const openIndex = tagMatch.index ?? 0
  const afterOpen = content.slice(openIndex + openTag.length)
  const closeIndex = afterOpen.indexOf('</script>')
  if (closeIndex === -1) return null

  const code = afterOpen.slice(0, closeIndex)
  const lineOffset = content.slice(0, openIndex).split('\n').length - 1
  return { code: isSetup ? sanitizeVueSetupMacros(code) : code, lineOffset, isTs, isJsx }
}

export function extractAstBlocks(filePath: string, content: string, diff: string): string {
  if (!content || !content.trim() || !diff || !diff.trim()) return ''

  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  const changedLines = extractChangedLinesFromDiff(diff)
  if (changedLines.length === 0) return ''

  let code: string
  let lineOffset = 0
  let forceTs = false
  let forceJsx = false

  if (ext === '.vue') {
    const scriptInfo = extractVueScript(content)
    if (!scriptInfo) return ''
    code = scriptInfo.code
    lineOffset = scriptInfo.lineOffset
    forceTs = scriptInfo.isTs
    forceJsx = scriptInfo.isJsx
  } else if (ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx') {
    code = content
  } else {
    return ''
  }

  const ast = parseSourceCode(code, filePath, forceTs, forceJsx)
  if (!ast) return ''

  const allBlocks = collectCodeBlocks(ast, code, lineOffset)
  const relevantBlocks = findMinimalContainingBlocks(changedLines, allBlocks)
  return formatAstBlocks(filePath, relevantBlocks, changedLines)
}

export function buildAstBlocks(fileDiffList: FileDiff[], fileContents: Map<string, string>): Map<string, string> {
  const astBlocks = new Map<string, string>()

  for (const { file, diff } of fileDiffList) {
    const content = fileContents.get(file)
    if (!content) continue

    const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
    if (ext !== '.vue' && ext !== '.js' && ext !== '.jsx' && ext !== '.ts' && ext !== '.tsx') continue

    const blocks = extractAstBlocks(file, content, diff)
    if (blocks) astBlocks.set(file, blocks)
  }

  return astBlocks
}
