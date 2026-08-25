/**
 * Vercel AI SDK client — OpenAI GPT-4o mini
 *
 * Central AI configuration. All AI calls go through here
 * for consistent error handling, retries, and cost tracking.
 */

import { generateText as aiGenerateText, generateObject as aiGenerateObject } from 'ai'
import { openai, createOpenAI } from '@ai-sdk/openai'
import { createAzure } from '@ai-sdk/azure'
import type { ZodSchema } from 'zod'

const MODEL_ID = process.env.OPENAI_MODEL_ID || 'gpt-4o'

/** Resolve the model via the unified router so Azure/GitHub Models deployments work. */
function resolvedModel() {
  return getLanguageModel(MODEL_ID)
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
  maxRetries = 8
): Promise<Response> {
  let attempt = 0
  let delay = 2500 // ms — first back-off window

  while (true) {
    const response = await fetch(url, options)

    const isRetryableStatus =
      response.status === 429 ||
      response.status === 503 ||
      response.status === 502 ||
      response.status === 504

    let shouldRetry = isRetryableStatus
    let isPeakLoadSurge = false

    // Check if 400/other status is an Azure peak-load capacity rejection
    if (!shouldRetry && (response.status === 400 || response.status === 429) && attempt < maxRetries) {
      try {
        const cloned = response.clone()
        const text = await cloned.text()
        if (
          text.includes('Provisioned Throughput') ||
          text.includes('exceeds the maximum usage size allowed during peak load') ||
          text.includes('high demand') ||
          text.includes('Rate limit') ||
          text.includes('rate_limit')
        ) {
          shouldRetry = true
          isPeakLoadSurge = true
        }
      } catch {
        // Ignore clone errors
      }
    }

    if (!shouldRetry || attempt >= maxRetries) {
      return response
    }

    // Peak load surges on Azure need at least 3.5s to clear the token queue
    if (isPeakLoadSurge && delay < 3500) {
      delay = 3500
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

    console.warn(
      `[Azure AI fetch] ${response.status} (attempt ${attempt + 1}/${maxRetries}). ` +
      `Rate limit hit. Waiting ${waitMs}ms before retry...`
    )

    await new Promise((res) => setTimeout(res, waitMs))
    delay = Math.min(delay * 2, 16_000) // double delay each retry, cap at 16s
    attempt++
  }
}

export function getLanguageModel(modelIdOverride?: string) {
  const modelId = modelIdOverride || process.env.OPENAI_MODEL_ID || 'gpt-4o'
  const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY || ''
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || process.env.AZURE_OPENAI_BASE_URL

  if (azureEndpoint) {
    let baseURL = azureEndpoint
      .replace(/\/chat\/completions\/?$/, '')
      .replace(/\/responses\/?$/, '')
      .replace(/\/+$/, '')
    if (!baseURL.endsWith('/openai/v1') && !baseURL.endsWith('/v1')) {
      baseURL = baseURL.replace(/\/openai\/?$/, '') + '/openai/v1'
    }
    const azureOpenAI = createOpenAI({
      apiKey,
      baseURL,
      // Inject the backoff-aware fetch for all calls to this Azure deployment.
      // This prevents 429 TPM spikes from surfacing as hard errors to the agent.
      fetch: fetchWithBackoff,
    })
    return azureOpenAI(modelId)
  }

  if (apiKey && apiKey.startsWith('1ss')) {
    const githubModels = createOpenAI({
      apiKey,
      baseURL: 'https://models.inference.ai.azure.com',
      fetch: fetchWithBackoff,
    })
    return githubModels(modelId)
  }

  const standardOpenAI = createOpenAI({
    apiKey,
    fetch: fetchWithBackoff,
  })
  return standardOpenAI(modelId)
}

export function isAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY)
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

