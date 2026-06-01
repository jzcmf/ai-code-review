export type ReviewLevel = 'low' | 'medium' | 'high'

export type ReviewMode = 'diff-only' | 'diff-w' | 'diff-ast'

export type ReviewStatus = 'pass' | 'issues' | 'invalid'

export interface FileDiff {
  file: string
  diff: string
}

export interface ReviewIssue {
  level: ReviewLevel
  file: string
  line: number | null
  suggestion: string
  impact?: string
}

export interface ReviewSummary {
  hasHigh: boolean
  hasMedium: boolean
  hasLow: boolean
  hasMediumOrHigh: boolean
}

export interface ReviewResult {
  issues: ReviewIssue[]
  outputText: string
  summary: ReviewSummary
}

export interface ReviewUnit {
  files: string[]
  promptInput: FileDiff[]
  chunkIndex?: number
  chunkTotal?: number
}

export interface ParseErrorEntry {
  time: string
  reason: string
  text: string
}

export interface FileContentMap {
  file: string
  content: string
}

export interface ReviewPayload {
  ok: boolean
  status: ReviewStatus
  issues: unknown[]
}

export interface ParsedReviewIssues {
  ok: boolean
  status: ReviewStatus
  issues: ReviewIssue[]
}

export interface RuntimeConfig {
  baseURL: string
  fullUrl: string
  defaultModel: string | null
  allowOnError: boolean
  writeDataToFile: boolean
  writeResultToFile: boolean
  modelCandidates: string[]
  temperature: number
  maxTokens: number
  maxFileDiffChars: number
  maxTotalDiffChars: number
  customRulesFilePath: string
  customRulesContent: string
  reviewMode: ReviewMode
}

export interface ReviewDataLogEntry {
  reviewUnitIndex: number
  reviewUnitLabel: string
  files: string[]
  chunkCount: number
  diffChars: number
  promptChars: number
  promptInput: Array<{
    partIndex: number
    file: string
    diffChars: number
  }>
  response: unknown
}

export interface ReviewActionDecision {
  allow: boolean
  level: 'pass' | 'block' | 'confirm'
  message: string
}
