/**
 * Detects a turn that promised an action and did not perform it.
 *
 * Two failure shapes, both observed in production:
 *  - the reply says "Let me check your inbox now" and the turn ends with zero
 *    tool calls
 *  - the reply announces one provider and the turn calls a different one, so the
 *    founder is answered about the wrong system
 *
 * Pure and dependency-free on purpose. The caller injects the text-to-provider
 * resolver (`resolveDomainProvidersFromText` in `agent.ts`) so the domain keyword
 * list stays in exactly one place, and so this stays unit-testable without
 * loading the tool registry.
 */

export type AnnouncedActionMismatch =
  | { mismatch: false }
  | {
      mismatch: true
      reason: 'no_tool_calls' | 'wrong_domain'
      announcedProviders: string[]
      calledProviders: string[]
    }

/**
 * Phrases that commit the agent to doing something in this turn.
 *
 * First person future and imperative-on-self forms only. A question ("should I
 * check your inbox?") is not a commitment and must not match.
 */
const ANNOUNCEMENT_PATTERN =
  /\b(let me (check|see|look|pull|grab|fetch|read|take a look)|checking your|check your \w+ now|let's see|i'?ll (check|look|pull|grab|fetch|read|see|take a look)|i will (check|look|pull|grab|fetch|read|see)|i'?m going to (check|look|pull|grab|fetch|read)|i am going to (check|look|pull|grab|fetch|read)|fetching|reading your|pulling your|looking at your|one moment|give me a (second|sec|moment)|hold on)\b/i

export function textAnnouncesAction(outputText: string): boolean {
  if (!outputText) return false
  return ANNOUNCEMENT_PATTERN.test(outputText)
}

export function detectAnnouncedActionMismatch(input: {
  outputText: string
  toolNames: readonly string[]
  /** Maps a tool name to its integration provider, or null when unmapped. */
  resolveToolProvider: (toolName: string) => string | null
  /** Maps free text to the providers it is about. */
  resolveTextProviders: (text: string) => string[]
}): AnnouncedActionMismatch {
  const { outputText, toolNames, resolveToolProvider, resolveTextProviders } = input

  if (!textAnnouncesAction(outputText)) {
    return { mismatch: false }
  }

  const announcedProviders = resolveTextProviders(outputText)

  if (toolNames.length === 0) {
    return {
      mismatch: true,
      reason: 'no_tool_calls',
      announcedProviders,
      calledProviders: [],
    }
  }

  const calledProviders = [
    ...new Set(
      toolNames
        .map((toolName) => resolveToolProvider(toolName))
        .filter((provider): provider is string => provider !== null)
    ),
  ]

  // Only a claim about a specific provider can be contradicted. If the reply
  // named no provider, or the turn called only unmapped tools (account lookups,
  // web research), there is nothing to contradict.
  if (announcedProviders.length === 0 || calledProviders.length === 0) {
    return { mismatch: false }
  }

  const servedAnnouncedProvider = announcedProviders.some((provider) =>
    calledProviders.includes(provider)
  )

  if (servedAnnouncedProvider) {
    return { mismatch: false }
  }

  return {
    mismatch: true,
    reason: 'wrong_domain',
    announcedProviders,
    calledProviders,
  }
}
