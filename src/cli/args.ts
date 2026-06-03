import type { ReviewMode } from '../shared/types.js'

export type Command = 'review' | 'test-api' | 'print-config' | 'mcp-list' | 'init'

export function resolveCommandFromArgs(argv = process.argv.slice(2)): Command {
  const firstArg = argv.find((item) => !item.startsWith('--'))
  if (!firstArg) return 'review'
  const valid: Command[] = ['review', 'test-api', 'print-config', 'mcp-list', 'init']
  if (valid.includes(firstArg as Command)) return firstArg as Command
  return 'review'
}

export function resolveReviewModeFromArgs(argv = process.argv.slice(2)): ReviewMode | null {
  if (argv.includes('--diff-w')) return 'diff-w'
  if (argv.includes('--diff-only')) return 'diff-only'
  if (argv.includes('--diff-ast')) return 'diff-ast'
  return null
}

export function resolveMcpListFilter(argv = process.argv.slice(2)): string | null {
  const idx = argv.indexOf('mcp-list')
  if (idx === -1) return null
  const filter = argv[idx + 1]
  return filter && !filter.startsWith('--') ? filter : null
}
