/**
 * AI Draft Generator
 *
 * Takes an account + risk signals → calls AI → returns structured email draft.
 * Uses OpenAI structured outputs for guaranteed valid JSON.
 */

import { generateObject } from './ai'
import { buildDraftPrompt } from './prompts'
import { z } from 'zod'

const DraftOutputSchema = z.object({
  subject: z.string().describe('Email subject line'),
  body: z.string().describe('The email body text'),
})

export type GeneratedDraft = {
  subject: string
  body: string
  model: string
  tokensUsed: number
  costCents: number
  durationMs: number
}

export async function generateDraft(params: {
  accountName: string
  contactName: string | null
  mrr: string
  riskLevel: string
  draftType: string
  signals: string[]
  context: string
}): Promise<GeneratedDraft> {
  const { system, prompt } = buildDraftPrompt(params)

  const result = await generateObject({
    system,
    prompt,
    schema: DraftOutputSchema,
    schemaName: 'email_draft',
    schemaDescription: 'A follow-up email draft with subject and body',
    maxOutputTokens: 2048,
    temperature: 0.4,
  })

  return {
    subject: result.object.subject,
    body: result.object.body,
    model: result.model,
    tokensUsed: result.tokensUsed,
    costCents: result.costCents,
    durationMs: result.durationMs,
  }
}

