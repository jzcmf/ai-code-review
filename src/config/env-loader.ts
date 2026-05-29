import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { stdin as input, stdout as output } from 'node:process'
import { getGitRootSafe } from '../providers/git/git-provider.js'
import { ANSI_COLORS, colorize, logSuccess, logWarning } from '../shared/logger.js'
import { ENV_FILE_NAME } from './constants.js'
import { DEFAULT_ENV_TEMPLATE } from './env-template.js'

interface ParsedEnvLine {
  key: string
  value: string
}

interface EnvLoadState {
  loadedFileCount: number
  loadedFilePaths: string[]
}

let envLoadState: EnvLoadState = {
  loadedFileCount: 0,
  loadedFilePaths: []
}

function parseEnvLine(line: string): ParsedEnvLine | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const eqIndex = trimmed.indexOf('=')
  if (eqIndex <= 0) return null

  const key = trimmed.slice(0, eqIndex).trim()
  let value = trimmed.slice(eqIndex + 1).trim()

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }

  return { key, value }
}

function getEnvSearchDirs(): string[] {
  const dirs = [process.cwd(), getGitRootSafe()].filter(Boolean)
  return Array.from(new Set(dirs.map((dir) => path.resolve(dir))))
}

function getPrimaryEnvPath(): string {
  const repoRoot = getGitRootSafe() || process.cwd()
  return path.resolve(repoRoot, ENV_FILE_NAME)
}

async function askInitEnvFile(): Promise<boolean> {
  const rl = readline.createInterface({ input, output, terminal: true })
  return new Promise((resolve) => {
    rl.question(`未找到 ${ENV_FILE_NAME}，\n${colorize('是否初始化该文件？(y/N): ', ANSI_COLORS.blue)}`, (answer) => {
      rl.close()
      resolve(['y', 'yes'].includes(String(answer).trim().toLowerCase()))
    })
  })
}

async function ensurePrimaryEnvFile(): Promise<{ exists: boolean; path: string }> {
  const envPath = getPrimaryEnvPath()
  if (fs.existsSync(envPath)) {
    return { exists: true, path: envPath }
  }

  logWarning(`未找到环境文件：${envPath}`)
  if (!process.stdin.isTTY) {
    return { exists: false, path: envPath }
  }

  const shouldInit = await askInitEnvFile()
  if (!shouldInit) {
    return { exists: false, path: envPath }
  }

  fs.writeFileSync(envPath, DEFAULT_ENV_TEMPLATE, 'utf8')
  logSuccess(`已初始化环境文件：${envPath}，请根据提示填写配置。`)
  return { exists: false, path: envPath }
}

function loadEnvFile(envPath: string): void {
  const content = fs.readFileSync(envPath, 'utf8')
  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    const parsed = parseEnvLine(line)
    if (!parsed) continue
    if (process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value
    }
  }
}

export function getEnvLoadState(): EnvLoadState {
  return envLoadState
}

export async function loadLocalEnvFiles(): Promise<boolean> {
  envLoadState = { loadedFileCount: 0, loadedFilePaths: [] }
  const { exists, path: primaryEnvPath } = await ensurePrimaryEnvFile()
  if (!exists) {
    return false
  }

  const searchDirs = getEnvSearchDirs()
  const candidates = [ENV_FILE_NAME, '.env', '.env.local', '.env.hook']
  const visited = new Set<string>()

  loadEnvFile(primaryEnvPath)
  envLoadState.loadedFileCount += 1
  envLoadState.loadedFilePaths.push(primaryEnvPath)
  visited.add(primaryEnvPath)

  for (const dir of searchDirs) {
    for (const file of candidates) {
      const envPath = path.resolve(dir, file)
      if (visited.has(envPath)) continue
      visited.add(envPath)
      if (!fs.existsSync(envPath)) continue

      loadEnvFile(envPath)
      envLoadState.loadedFileCount += 1
      envLoadState.loadedFilePaths.push(envPath)
    }
  }

  return true
}
