import type { PersonaId } from '@/agent/personas/personas'

type RuntimeInstructionOptions = {
  personaId: PersonaId
  personaName: string
  channel: 'chat' | 'automation'
  runType?: string
  availableToolNames: readonly string[]
  canRequestMoreTools?: boolean
}

type TurnContextOptions = {
  channel: 'chat' | 'automation'
  runType: string
  nowIso: string
  latestUserText?: string | null
  stage?: string | null
}

const HIDDEN_HUMAN_APPROVAL_ACTIONS = [
  'approveDraft',
  'sendApprovedDraft',
  'createBriefItem',
  'updateBriefSummary',
] as const

function compactToolSurface(toolNames: readonly string[]) {
  return [...new Set(toolNames)].sort().join(', ')
}

export function buildRuntimeInstructionBlock(options: RuntimeInstructionOptions) {
  const toolSurface = compactToolSurface(options.availableToolNames)

  const expansionDirectives = options.canRequestMoreTools
    ? `
Only call tools listed above. If the task needs another integration domain, call requestMoreTools with that domain and a concrete reason. After its result, continue the task using the schemas activated on the next step. Do not tell the founder that tools were activated until an actual provider tool has run.

Tool routing is not provider readiness. requestMoreTools changes schema visibility only; it does not connect, authenticate, or verify an integration. Use inspectIntegrationConnectionsTool before claiming a provider is connected, disconnected, expired, or broken.
`.trim()
    : `
Only call tools in the available list above. If older persona docs mention a tool that is not listed here, treat that tool as unavailable.

Tool availability is not connection state. Keep these separate:
- A tool missing from this turn's list is a routing fact about this turn only. It says nothing about the founder's workspace. Never tell the founder a capability does not exist, is not connected, or is unavailable because its tool is absent from this list.
- Before stating that any provider is disconnected, broken, expired, revoked, or unavailable, call inspectIntegrationConnectionsTool and answer from what it returns. Never infer a provider's current state from an error in an earlier turn.
- If the request is outside this persona's scope, name the persona or surface that performs it and offer that path. Do not report the capability as nonexistent.
`.trim()

  return `
## Current Runtime Contract

This section is newer than older examples above and overrides any conflicting tool-routing examples.

Runtime:
- persona: ${options.personaName} (${options.personaId})
- channel: ${options.channel}
- run type: ${options.runType ?? 'agent_run'}

Tools active in this reasoning step:
${toolSurface}

${expansionDirectives}

Do not attempt hidden human-approval or deterministic-brief tools:
${HIDDEN_HUMAN_APPROVAL_ACTIONS.join(', ')}

Current approval model:
- You may create, update, or reject drafts only when those tools are exposed.
- You cannot approve or send stored follow-up drafts from the agent loop.
- Founder approval and final sending happen outside the agent tool loop through the draft review backend/UI.
- You cannot directly create founder brief items or brief summaries. Live state changes first; deterministic brief generation rebuilds the brief.

Operator loop:
1. Classify the founder's goal: answer, investigate, change state, draft asset, or coordinate follow-up.
2. If the request depends on live workspace data, use the smallest sufficient read-tool chain before answering.
3. If a write is justified, verify identifiers from read tools first, perform the write, then summarize the change and the evidence.
4. If a needed integration or record is missing, say exactly what is missing and give the next useful step.
5. If the request is simple and no live data is needed, answer directly without pretending to inspect tools.

Quality bar:
- Be concrete before being clever.
- State the strongest finding first.
- Prefer one ranked recommendation over a menu of vague options.
- Use tool evidence, not confident filler.
- Do not dump raw tool output the UI already renders.
- Adapt the format to the task. Use persona sections only when they help; do not fill rigid headings for simple answers.
`.trim()
}

export function buildTurnContextSystemPrompt(options: TurnContextOptions) {
  const lines = [
    `Current runtime timestamp: ${options.nowIso}.`,
    `Channel: ${options.channel}.`,
    `Run type: ${options.runType}.`,
  ]

  if (options.stage) {
    lines.push(`Workflow stage: ${options.stage}. Stay inside this stage's job.`)
  }

  if (options.latestUserText?.trim()) {
    lines.push(
      `Active request: "${options.latestUserText
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500)}"`
    )
    lines.push(
      'Execution guidance: Focus tool calls on fulfilling this active request. Treat earlier conversation turns as contextual history without re-executing previously finished actions.'
    )
  }

  return lines.join('\n')
}
