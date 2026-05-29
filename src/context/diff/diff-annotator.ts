interface HunkHeader {
  oldLine: number
  newLine: number
}

function parseHunkHeader(line: string): HunkHeader | null {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
  if (!match) return null
  return {
    oldLine: Number.parseInt(match[1], 10),
    newLine: Number.parseInt(match[2], 10)
  }
}

function formatLineNumber(value: number | null): string {
  return value == null ? ' ' : String(value)
}

function formatDiffBodyLine(oldLine: number | null, newLine: number | null, line: string): string {
  return `(${formatLineNumber(oldLine)}, ${formatLineNumber(newLine)}) ${line}`
}

export function annotateDiffWithLineNumbers(diff: string): string {
  if (!diff || !diff.trim()) return diff

  const lines = diff.split('\n')
  const annotated: string[] = []
  let currentOldLine: number | null = null
  let currentNewLine: number | null = null
  let inHunk = false

  for (const line of lines) {
    if (line.startsWith('@@ ')) {
      const header = parseHunkHeader(line)
      if (header) {
        currentOldLine = header.oldLine
        currentNewLine = header.newLine
        inHunk = true
      } else {
        inHunk = false
        currentOldLine = null
        currentNewLine = null
      }
      annotated.push(line)
      continue
    }

    if (!inHunk || !line || line.startsWith('\\ No newline at end of file')) {
      annotated.push(line)
      continue
    }

    const marker = line[0]
    if (marker === '+' && currentNewLine != null) {
      annotated.push(formatDiffBodyLine(null, currentNewLine, line))
      currentNewLine += 1
      continue
    }

    if (marker === '-' && currentOldLine != null) {
      annotated.push(formatDiffBodyLine(currentOldLine, null, line))
      currentOldLine += 1
      continue
    }

    if (marker === ' ' && currentOldLine != null && currentNewLine != null) {
      annotated.push(formatDiffBodyLine(currentOldLine, currentNewLine, line))
      currentOldLine += 1
      currentNewLine += 1
      continue
    }

    annotated.push(line)
  }

  return annotated.join('\n')
}
