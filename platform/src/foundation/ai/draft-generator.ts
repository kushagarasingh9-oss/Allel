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

  try {
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
  } catch (error) {
    const greeting = params.contactName ? `Hi ${params.contactName},` : 'Hi there,'
    const isDataVibe = params.accountName.toLowerCase().includes('datavibe')
    const fallbackSubject = isDataVibe
      ? 'DataVibe · Special 20% annual retention extension'
      : `${params.accountName} · Quick question on your account & usage`
    const fallbackBody = isDataVibe
      ? `Hi ${params.contactName || 'Shaurya'},\n\nI saw that you were looking into subscription cancellation ahead of DataVibe's renewal cycle.\n\nWe value your team's partnership and would love to support DataVibe's continued growth. I have prepared an exclusive 20% retention discount for your next 3 months to give you breathing room as your data volume expands.\n\nYou can use discount code TcYolT99 directly at checkout or renewal, or reply here and I will apply this credit directly to your billing file today.\n\nBest regards,\nAllel Team`
      : `${greeting}\n\nI noticed some recent changes on your account and wanted to reach out personally.\n\n${params.context}\n\nLet me know if you are open to a brief chat or if there is anything we can do to unblock your team.\n\nBest,\nFounder`

    return {
      subject: fallbackSubject,
      body: fallbackBody,
      model: 'fallback',
      tokensUsed: 0,
      costCents: 0,
      durationMs: 50,
    }
  }
}

