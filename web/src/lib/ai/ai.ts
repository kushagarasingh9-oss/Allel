/**
 * Vercel AI SDK client — OpenAI GPT-4o mini
 *
 * Central AI configuration. All AI calls go through here
 * for consistent error handling, retries, and cost tracking.
 */

import { generateText as aiGenerateText, generateObject as aiGenerateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import type { ZodSchema } from 'zod'

const MODEL_ID = process.env.OPENAI_MODEL_ID || 'gpt-5.5'

export function isAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY)
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
    model: openai(MODEL_ID),
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
    model: openai(MODEL_ID),
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

