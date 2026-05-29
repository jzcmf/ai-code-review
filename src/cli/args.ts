import type { ReviewMode } from '../shared/types.js'

export type Command = 'review' | 'test-api' | 'print-config'

export function resolveCommandFromArgs(argv = process.argv.slice(2)): Command {
  const firstArg = argv.find((item) => !item.startsWith('--'))
  if (!firstArg) return 'review'
  if (firstArg === 'test-api' || firstArg === 'print-config' || firstArg === 'review') {
    return firstArg
  }
  return 'review'
}

export function resolveReviewModeFromArgs(argv = process.argv.slice(2)): ReviewMode | null {
  if (argv.includes('--diff-w')) return 'diff-w'
  if (argv.includes('--diff-only')) return 'diff-only'
  if (argv.includes('--diff-ast')) return 'diff-ast'
  return null
}
