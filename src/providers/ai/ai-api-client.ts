import { getRuntimeConfig } from '../../config/runtime-config.js'
import { buildSystemPrompt } from '../../context/prompt/index.js'
import { logError } from '../../shared/logger.js'

interface OpenAIMessageContent {
  content?: unknown
}

interface OpenAIChoice {
  message?: OpenAIMessageContent
}

interface OpenAIResponse {
  choices?: OpenAIChoice[]
}

export interface RawReviewResponse {
  raw: string
  dataLog: unknown
}

export async function requestReviewRaw(prompt: string, model: string): Promise<RawReviewResponse> {
  const apiKey = process.env.AI_REVIEW_API_KEY || process.env.API_KEY || process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new Error('缺少 API 密钥，请配置 AI_REVIEW_API_KEY/API_KEY/DEEPSEEK_API_KEY。')
  }

  const { fullUrl, temperature, maxTokens } = getRuntimeConfig()
  const systemPrompt = buildSystemPrompt()
  const response = await fetch(fullUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      thinking: {
        type: 'disabled'
      },
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}\n\n${prompt}`
        }
      ]
    })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`接口请求失败（HTTP ${response.status}）：${text}`)
  }

  const data = (await response.json()) as OpenAIResponse
  const content = data?.choices?.[0]?.message?.content

  if (!content || typeof content !== 'string') {
    logError(content)
    throw new Error('AI 响应内容格式无效。')
  }

  return {
    raw: content.trim(),
    dataLog: data
  }
}
