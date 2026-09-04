/**
 * Vercel AI SDK client — OpenAI GPT-4o mini
 *
 * Central AI configuration. All AI calls go through here
 * for consistent error handling, retries, and cost tracking.
 */

import { generateText as aiGenerateText, generateObject as aiGenerateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { AsyncLocalStorage } from 'async_hooks'
import type { ZodSchema } from 'zod'

export type StreamRetryListener = (info: { attempt: number; waitSeconds: number }) => void
export const retryContextStorage = new AsyncLocalStorage<StreamRetryListener>()

export const DEFAULT_AZURE_ENDPOINT =
  'https://kushagarasingh175-1097-resource.services.ai.azure.com'
export const DEFAULT_MODEL_ID = 'Kimi-K2.6'

const MODEL_ID = process.env.OPENAI_MODEL_ID || DEFAULT_MODEL_ID

/** Resolve the model via the unified router so Azure/GitHub Models deployments work. */
function resolvedModel() {
  const modelId = process.env.OPENAI_MODEL_ID || DEFAULT_MODEL_ID
  return getLanguageModel(modelId)
}

/**
 * Fetch wrapper that transparently retries 429 (rate-limit), 503/502/504
 * (transient upstream), and peak-load surge capacity rejections using
 * exponential backoff + jitter.
 *
 * For Azure Kimi-K2.6 at 100k TPM: instead of crashing the agent turn,
 * a TPM spike or peak-load capacity surge will silently pause for up to ~15s
 * and retry up to 4 times.
 */
async function fetchWithBackoff(
  url: RequestInfo | URL,
  options?: RequestInit,
  maxRetries = 10
): Promise<Response> {
  let attempt = 0
  let delay = 3000 // ms — first back-off window

  while (true) {
    const response = await fetch(url, options)

    const isRetryableStatus =
      response.status === 429 ||
      response.status === 500 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504

    let shouldRetry = isRetryableStatus
    let isPeakLoadSurge = false

    // Check if 400 or any non-200 status is an Azure peak-load capacity rejection or temporary server error
    if (!shouldRetry && attempt < maxRetries && !response.ok) {
      try {
        const cloned = response.clone()
        const text = await cloned.text()
        if (
          text.includes('Provisioned Throughput') ||
          text.includes('exceeds the maximum usage size allowed during peak load') ||
          text.includes('high demand') ||
          text.includes('Rate limit') ||
          text.includes('rate_limit') ||
          text.includes('Azure support request') ||
          text.includes('The server had an error processing your request')
        ) {
          shouldRetry = true
          isPeakLoadSurge = true
        }
      } catch {
        // Ignore clone errors
      }
    }

function transformReasoningSSEStream(rawStream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = rawStream.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  let inReasoning = false

  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          if (inReasoning) {
            controller.enqueue(encoder.encode('data: {"choices":[{"index":0,"delta":{"content":"</think>"}}]}\n\n'))
            inReasoning = false
          }
          controller.close()
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (let line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const json = JSON.parse(line.slice(6))
              const delta = json.choices?.[0]?.delta
              if (delta?.reasoning_content) {
                let content = delta.reasoning_content
                if (!inReasoning) {
                  content = '<think>' + content
                  inReasoning = true
                }
                delta.content = content
                line = 'data: ' + JSON.stringify(json)
              } else if (inReasoning && (delta?.content || delta?.tool_calls)) {
                const prefix = '</think>'
                inReasoning = false
                if (delta?.content) {
                  delta.content = prefix + delta.content
                  line = 'data: ' + JSON.stringify(json)
                } else {
                  // Tool call chunk — inject closing </think> chunk with valid choice index
                  const closingChunk = {
                    choices: [{ index: 0, delta: { content: prefix } }]
                  }
                  controller.enqueue(encoder.encode('data: ' + JSON.stringify(closingChunk) + '\n\n'))
                }
              }
            } catch {
              // Ignore JSON parse errors for non-JSON lines
            }
          }
          controller.enqueue(encoder.encode(line + '\n'))
        }
        break
      }
    }
  })
}

    if (!shouldRetry || attempt >= maxRetries) {
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('text/event-stream') && response.body) {
        const transformed = transformReasoningSSEStream(response.body)
        return new Response(transformed, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
      }

      if (contentType.includes('application/json')) {
        try {
          const clone = response.clone()
          const json = await clone.json()
          const choice = json.choices?.[0]
          if (choice?.message?.reasoning_content) {
            const reasoning = choice.message.reasoning_content
            choice.message.content = `<think>${reasoning}</think>\n\n${choice.message.content || ''}`
            return new Response(JSON.stringify(json), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            })
          }
        } catch {
          // Ignore JSON clone errors
        }
      }

      return response
    }

    // Peak load surges on Azure need at least 4.0s to clear the token queue
    if (isPeakLoadSurge && delay < 4000) {
      delay = 4000
    }

    // Parse Azure OpenAI & OpenAI standard rate-limit reset headers
    const retryAfterHeader = response.headers.get('retry-after')
    const retryAfterMsHeader = response.headers.get('retry-after-ms')
    const resetTokensHeader = response.headers.get('x-ratelimit-reset-tokens')
    const resetRequestsHeader = response.headers.get('x-ratelimit-reset-requests')

    let serverWaitMs: number | null = null
    if (retryAfterMsHeader) {
      const parsed = parseInt(retryAfterMsHeader, 10)
      if (!isNaN(parsed) && parsed > 0) serverWaitMs = parsed
    } else if (retryAfterHeader) {
      const parsed = parseInt(retryAfterHeader, 10)
      if (!isNaN(parsed) && parsed > 0) serverWaitMs = parsed * 1000
    } else if (resetTokensHeader) {
      // Azure format: "24s" or "24" or "12.5s"
      const seconds = parseFloat(resetTokensHeader.replace(/[^0-9.]/g, ''))
      if (!isNaN(seconds) && seconds > 0) serverWaitMs = Math.ceil(seconds * 1000)
    } else if (resetRequestsHeader) {
      const seconds = parseFloat(resetRequestsHeader.replace(/[^0-9.]/g, ''))
      if (!isNaN(seconds) && seconds > 0) serverWaitMs = Math.ceil(seconds * 1000)
    }

    const waitMs = serverWaitMs !== null
      ? Math.min(serverWaitMs + Math.floor(Math.random() * 400), 45_000) // add slight jitter
      : Math.min(delay + Math.floor(Math.random() * 600), 30_000)

    const waitSeconds = Math.ceil(waitMs / 1000)

    console.warn(
      `[Azure AI fetch] ${response.status} (attempt ${attempt + 1}/${maxRetries}). ` +
      `Rate limit hit. Waiting ${waitMs}ms before retry...`
    )

    try {
      const listener = retryContextStorage.getStore()
      if (listener) {
        listener({ attempt: attempt + 1, waitSeconds })
      }
    } catch {
      // Ignore listener error
    }

    // Tick every 1 second to keep SSE streaming socket alive and provide countdown updates
    let remainingMs = waitMs
    const listener = retryContextStorage.getStore()
    while (remainingMs > 0) {
      const tick = Math.min(1000, remainingMs)
      await new Promise((res) => setTimeout(res, tick))
      remainingMs -= tick
      const remainingSec = Math.ceil(remainingMs / 1000)
      if (remainingSec > 0 && remainingSec % 2 === 0 && listener) {
        try {
          listener({ attempt: attempt + 1, waitSeconds: remainingSec })
        } catch {
          // Ignore listener closure
        }
      }
    }

    delay = Math.min(delay * 2, 16_000) // double delay each retry, cap at 16s
    attempt++
  }
}

export function normalizeAzureModelBaseUrl(azureEndpoint: string) {
  let baseURL = azureEndpoint
    .replace(/\/chat\/completions\/?$/, '')
    .replace(/\/responses\/?$/, '')
    .replace(/\/+$/, '')

  // Microsoft Foundry model-inference resources expose the OpenAI-compatible
  // contract at /models/chat/completions. Azure OpenAI resources use /openai/v1.
  if (/\.services\.ai\.azure\.com(?:\/|$)/i.test(baseURL)) {
    return baseURL.endsWith('/models') ? baseURL : `${baseURL}/models`
  }

  if (!baseURL.endsWith('/openai/v1') && !baseURL.endsWith('/v1')) {
    baseURL = baseURL.replace(/\/openai\/?$/, '') + '/openai/v1'
  }
  return baseURL
}

export function getLanguageModel(modelIdOverride?: string) {
  const apiKey =
    process.env.AZURE_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ''

  const modelId =
    modelIdOverride ||
    process.env.OPENAI_MODEL_ID ||
    process.env.AGENT_CHAT_MODEL_ID ||
    process.env.AGENT_MODEL_ID ||
    DEFAULT_MODEL_ID

  const azureEndpoint =
    process.env.AZURE_OPENAI_ENDPOINT ||
    process.env.AZURE_OPENAI_BASE_URL ||
    (apiKey && !apiKey.startsWith('sk-') ? DEFAULT_AZURE_ENDPOINT : undefined)

  if (azureEndpoint) {
    const baseURL = normalizeAzureModelBaseUrl(azureEndpoint)
    const azureOpenAI = createOpenAI({
      apiKey,
      baseURL,
      // Inject the backoff-aware fetch for all calls to this Azure deployment.
      // This prevents 429 TPM spikes from surfacing as hard errors to the agent.
      fetch: fetchWithBackoff,
    })
    return azureOpenAI.chat(modelId)
  }

  if (apiKey && apiKey.startsWith('1ss')) {
    const githubModels = createOpenAI({
      apiKey,
      baseURL: 'https://models.inference.ai.azure.com',
      fetch: fetchWithBackoff,
    })
    return githubModels.chat(modelId)
  }

  const standardOpenAI = createOpenAI({
    apiKey,
    fetch: fetchWithBackoff,
  })
  return standardOpenAI.chat(modelId)
}

export function isAIConfigured() {
  return true
}

export type AIResult = {
  text: string
  model: string
  tokensUsed: number
  costCents: number
  durationMs: number
}

export type AIObjectResult<T> = {
  object: T
  model: string
  tokensUsed: number
  costCents: number
  durationMs: number
}

// GPT-4o mini pricing (per million tokens)
const INPUT_COST_PER_M = 0.15
const OUTPUT_COST_PER_M = 0.60

function estimateCostCents(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_M * 100
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_M * 100
  return Math.round(inputCost + outputCost)
}

export async function generateText(params: {
  system: string
  prompt: string
  maxOutputTokens?: number
  temperature?: number
}): Promise<AIResult> {
  if (!isAIConfigured()) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const start = Date.now()

  const result = await aiGenerateText({
    model: resolvedModel(),
    system: params.system,
    prompt: params.prompt,
    maxOutputTokens: params.maxOutputTokens ?? 1024,
    temperature: params.temperature ?? 0.3,
  })

  const durationMs = Date.now() - start
  const inputTokens = result.usage?.inputTokens ?? 0
  const outputTokens = result.usage?.outputTokens ?? 0

  return {
    text: result.text,
    model: MODEL_ID,
    tokensUsed: inputTokens + outputTokens,
    costCents: estimateCostCents(inputTokens, outputTokens),
    durationMs,
  }
}

/**
 * Generate a structured object using OpenAI's JSON schema mode.
 * Guarantees valid output matching the provided Zod schema —
 * no regex parsing or JSON.parse fallbacks needed.
 */
export async function generateObject<T>(params: {
  system: string
  prompt: string
  schema: ZodSchema<T>
  schemaName: string
  schemaDescription?: string
  maxOutputTokens?: number
  temperature?: number
}): Promise<AIObjectResult<T>> {
  if (!isAIConfigured()) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const start = Date.now()

  const result = await aiGenerateObject({
    model: resolvedModel(),
    system: params.system,
    prompt: params.prompt,
    schema: params.schema,
    schemaName: params.schemaName,
    schemaDescription: params.schemaDescription,
    maxOutputTokens: params.maxOutputTokens ?? 1024,
    temperature: params.temperature ?? 0.3,
  })

  const durationMs = Date.now() - start
  const inputTokens = result.usage?.inputTokens ?? 0
  const outputTokens = result.usage?.outputTokens ?? 0

  return {
    object: result.object,
    model: MODEL_ID,
    tokensUsed: inputTokens + outputTokens,
    costCents: estimateCostCents(inputTokens, outputTokens),
    durationMs,
  }
}

