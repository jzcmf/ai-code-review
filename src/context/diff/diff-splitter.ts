import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function exportSplitResult(chunks: string[], filename = ''): void {
  const content = [
    '# 代码审查分割结果',
    `# 生成时间: ${new Date().toLocaleString('zh-CN')}`,
    filename ? `# 原始文件: ${filename}` : '',
    `# 分割数量: ${chunks.length} 个片段`,
    '',
    '='.repeat(80),
    '',
    ...chunks.flatMap((chunk, index) => [
      `## 片段 ${index + 1} / ${chunks.length}`,
      `长度: ${chunk.length} 字符`,
      '-'.repeat(40),
      chunk,
      '',
      '='.repeat(80),
      ''
    ])
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const outputPath = join(process.cwd(), 'review-split.txt')
    writeFileSync(outputPath, content, 'utf-8')
    console.log(`✅ 分割结果已导出到: ${outputPath}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`❌ 导出分割结果失败: ${message}`)
  }
}

export function splitDiffByHunks(diff: string): string[] {
  if (!diff || !diff.trim()) return []

  const lines = diff.split('\n')
  const hunks: string[] = []
  let current: string[] = []

  for (const line of lines) {
    if (line.startsWith('@@ ')) {
      if (current.length > 0) hunks.push(current.join('\n'))
      current = [line]
      continue
    }

    if (current.length === 0) {
      current = [line]
    } else {
      current.push(line)
    }
  }

  if (current.length > 0) hunks.push(current.join('\n'))
  return hunks
}

export function buildChunksFromHunks(hunks: string[], maxChars: number): string[] {
  const chunks: string[] = []
  let bucket: string[] = []
  let bucketLen = 0
  let pendingHeader = ''

  const normalizedHunks = [...hunks]
  if (normalizedHunks.length > 0 && !normalizedHunks[0].startsWith('@@ ')) {
    pendingHeader = normalizedHunks.shift() ?? ''
  }

  for (const hunk of normalizedHunks) {
    const mergedHunk = pendingHeader ? `${pendingHeader}\n${hunk}` : hunk

    if (mergedHunk.length > maxChars) {
      if (bucket.length > 0) {
        chunks.push(bucket.join('\n'))
        bucket = []
        bucketLen = 0
      }
      const subChunks = splitLargeHunk(hunk, maxChars, pendingHeader)
      chunks.push(...subChunks)
      pendingHeader = ''
      continue
    }

    if (bucketLen + mergedHunk.length > maxChars && bucket.length > 0) {
      chunks.push(bucket.join('\n'))
      bucket = [mergedHunk]
      bucketLen = mergedHunk.length
    } else {
      bucket.push(mergedHunk)
      bucketLen += mergedHunk.length
    }

    pendingHeader = ''
  }

  if (pendingHeader) {
    if (bucket.length > 0) {
      const lastChunk = bucket[bucket.length - 1]
      if (lastChunk.length + pendingHeader.length + 1 <= maxChars) {
        bucket[bucket.length - 1] = `${pendingHeader}\n${lastChunk}`
      } else {
        chunks.push(bucket.join('\n'))
        bucket = [pendingHeader]
      }
    } else {
      bucket = [pendingHeader]
    }
  }

  if (bucket.length > 0) chunks.push(bucket.join('\n'))
  return chunks
}

export function splitLargeHunk(hunk: string, maxChars: number, prefixText = ''): string[] {
  const lines = hunk.split('\n')
  const header = lines[0] ?? ''
  const codeLines = lines.slice(1)
  const availableLineChars = Math.max(maxChars - header.length - 1, 1)
  const prefixLines = prefixText ? prefixText.split('\n') : []

  const subChunks: string[] = []
  let currentLines = [...prefixLines, header]
  let currentLen =
    currentLines.length === 0
      ? 0
      : currentLines.reduce((sum, line) => sum + line.length, 0) + (currentLines.length - 1)

  for (const line of codeLines) {
    if (currentLen + line.length + 1 > maxChars && currentLines.length > 1) {
      subChunks.push(currentLines.join('\n'))
      currentLines = [header]
      currentLen = header.length
    }

    if (line.length > availableLineChars) {
      const subLines = splitLongLine(line, availableLineChars)
      for (const subLine of subLines) {
        if (currentLen + subLine.length + 1 > maxChars && currentLines.length > 1) {
          subChunks.push(currentLines.join('\n'))
          currentLines = [header]
          currentLen = header.length
        }
        currentLines.push(subLine)
        currentLen += subLine.length + 1
      }
    } else {
      currentLines.push(line)
      currentLen += line.length + 1
    }
  }

  if (currentLines.length > 1) {
    subChunks.push(currentLines.join('\n'))
  }

  return subChunks
}

export function splitLongLine(line: string, maxLen: number): string[] {
  if (line.length <= maxLen) return [line]

  const result: string[] = []
  let remaining = line

  while (remaining.length > maxLen) {
    let splitPos = -1
    const statementEndChars = [';', ',', '{', '}', ')', ']']
    for (let i = maxLen - 1; i >= Math.floor(maxLen * 0.5); i--) {
      if (statementEndChars.includes(remaining[i] ?? '')) {
        splitPos = i + 1
        break
      }
    }

    if (splitPos === -1) {
      const operators = ['+', '-', '*', '/', '=', '&', '|', '?', ':', '!']
      for (let i = maxLen - 1; i >= Math.floor(maxLen * 0.5); i--) {
        if (operators.includes(remaining[i] ?? '')) {
          splitPos = i
          break
        }
      }
    }

    if (splitPos === -1) {
      for (let i = maxLen - 1; i >= Math.floor(maxLen * 0.5); i--) {
        if (remaining[i] === ' ' || remaining[i] === '\t') {
          splitPos = i + 1
          break
        }
      }
    }

    if (splitPos === -1) splitPos = maxLen
    result.push(remaining.substring(0, splitPos).trimEnd())
    remaining = remaining.substring(splitPos).trimStart()
  }

  if (remaining.length > 0) result.push(remaining)
  return result
}
