import { execSync } from 'node:child_process'
import { CODE_EXTENSIONS, IGNORED_PATH_PARTS } from '../../config/constants.js'
import { annotateDiffWithLineNumbers } from '../../context/diff/diff-annotator.js'
import { logError } from '../../shared/logger.js'
import { getErrorMessage } from '../../shared/errors.js'

function runGit(command: string): string {
  return execSync(command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

export function getStagedFiles(): string[] {
  try {
    const raw = runGit('git diff --cached --name-only')
    if (!raw) return []
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch (error) {
    logError(`获取暂存文件列表失败：${getErrorMessage(error)}`)
    return []
  }
}

export function isRelevantFile(file: string): boolean {
  const hasExt = CODE_EXTENSIONS.some((ext) => file.endsWith(ext))
  const isIgnored = IGNORED_PATH_PARTS.some((part) => file.includes(part))
  return hasExt && !isIgnored
}

export function getFileDiff(file: string, diffMode: 'diff' | 'diff-w' = 'diff-w'): string {
  try {
    const flag = diffMode === 'diff-w' ? '-W ' : ''
    const diff = execSync(`git diff ${flag}--cached -- "${file}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return annotateDiffWithLineNumbers(diff)
  } catch {
    return ''
  }
}

export function getFileContentAtCommit(file: string, ref = 'HEAD'): string {
  try {
    return execSync(`git show ${ref}:"${file}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
  } catch {
    return ''
  }
}

export function getGitRootSafe(): string {
  try {
    return runGit('git rev-parse --show-toplevel')
  } catch {
    return ''
  }
}
