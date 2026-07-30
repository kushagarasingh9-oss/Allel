/**
 * AI Risk Explainer
 *
 * Takes churn score factors → calls AI → returns plain-language 2-3 sentence explanation.
 * Used in both brief items and account detail views.
 */

import { generateText } from './ai'
import { buildRiskExplanationPrompt } from './prompts'

export type RiskExplanation = {
  explanation: string
  model: string
  tokensUsed: number
  costCents: number
  durationMs: number
}

export async function explainRisk(params: {
  accountName: string
  score: number
  riskLevel: string
  factors: Array<{ name: string; evidence: string; weightedValue: number }>
}): Promise<RiskExplanation> {
  const { system, prompt } = buildRiskExplanationPrompt(params)

  const result = await generateText({
    system,
    prompt,
    maxOutputTokens: 256,
    temperature: 0.2,
  })

  // Clean up the response — strip any wrapping quotes or markdown
  let explanation = result.text.trim()
  if (explanation.startsWith('"') && explanation.endsWith('"')) {
    explanation = explanation.slice(1, -1)
  }

  return {
    explanation,
    model: result.model,
    tokensUsed: result.tokensUsed,
    costCents: result.costCents,
    durationMs: result.durationMs,
  }
}
