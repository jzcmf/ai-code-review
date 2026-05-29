import process, { stdout as output } from 'node:process'

export const ANSI_COLORS = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  orange: '\x1b[38;5;208m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
} as const

type AnsiColor = (typeof ANSI_COLORS)[keyof typeof ANSI_COLORS]

export function colorize(text: string | number, color?: AnsiColor): string {
  const canUseColor = Boolean(output.isTTY || process.stderr.isTTY)
  if (!canUseColor || !color) return String(text)
  return `${color}${text}${ANSI_COLORS.reset}`
}

export function logInfo(message: string): void {
  console.log(`[paykka-ai-review] ${message}`)
}

export function logInfoWithoutPrefix(message: string): void {
  console.log(`${message}`)
}

export function logSuccess(message: string): void {
  console.log(
    `${colorize('[paykka-ai-review] ✅️ 成功', ANSI_COLORS.green)} ${colorize(message, ANSI_COLORS.green)}`
  )
}

export function logWarning(message: string): void {
  console.warn(
    `${colorize('[paykka-ai-review] ⚠️ 警告', ANSI_COLORS.yellow)} ${colorize(message, ANSI_COLORS.yellow)}`
  )
}

export function logError(message: unknown): void {
  const text = message instanceof Error ? message.message : String(message)
  console.error(`${colorize('[paykka-ai-review] ❌️ 错误', ANSI_COLORS.red)} ${colorize(text, ANSI_COLORS.red)}`)
}
