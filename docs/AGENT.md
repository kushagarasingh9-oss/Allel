# Allel Agent Runtime

> Current specialized reference. Last source audit: **2026-09-05**.
> Start with the repository [`README.md`](../README.md). Technical context: [`ALLEL.md`](ALLEL.md). Routing details: [`tool_calling.md`](tool_calling.md).

## Runtime

`platform/src/agent/runtime/agent.ts` builds AI SDK `ToolLoopAgent` instances over the tool registry in `platform/src/agent/tools/tools.ts`.

Current limits and behavior:

- Up to 25 reasoning/tool steps
- 4,096 output tokens
- Temperature `0.3`
- Up to 10 SDK retries for transient upstream failures
- Optional `AGENT_FALLBACK_MODEL_ID`
- Per-channel chat/automation model overrides
- Run telemetry for model, steps, tools, tokens, cost estimate, duration, workflow metadata, and action-completion checks

The runtime supports Azure OpenAI/Foundry-style configuration and standard OpenAI-compatible configuration. Model selection is environment-driven with a code fallback.

## Personas

| Internal ID | Display name | Role | Tool policy |
|---|---|---|---|
| `alex` | Allel | AI Co-founder | Eligible for every registered tool |
| `henry` | Henry | Head of Growth | Curated growth, research, context, draft, and collaboration tools |
| `sarah` | Sarah | Head of Retention | Curated billing, usage, account, recovery, outreach, and calendar tools |

The `alex` identifier remains for backward compatibility; UI and prompts call the persona Allel.

## Tools and routing

There are **164** keys in `ALL_TOOLS` at the audit date. This count is volatile and should be measured from source rather than hard-coded into product claims.

For chat, persona eligibility and current activation are different concepts:

1. Persona configuration defines the maximum eligible set.
2. Prompt/domain matching selects a smaller initial active set.
3. `requestMoreTools` can activate another eligible domain on the next step.
4. `prepareStep` updates active tools and runtime instructions.
5. Connection guards prevent provider tools from fabricating success when live credentials are missing or unhealthy.

Automation runs use their workflow-specific tool scope rather than the chat expansion path.

## Memory and trust

### Conversation memory

`platform/src/agent/memory/chat-memory.ts` persists conversation state scoped by:

- user
- workspace
- persona
- session

It deduplicates turns, bounds retained history, compacts older context, and tracks summaries, goals, commitments, and referenced accounts. Session operations live in `chat-session.ts`.

Assistant metadata is signed by `AGENT_HISTORY_SIGNING_SECRET` and sanitized in `platform/src/agent/tools/ui-message-utils.ts`. Production requires a dedicated signing secret; local development may fall back to `OPENAI_API_KEY`.

### Account memory

`account-memory.ts` builds deterministic account context from persisted account facts, signals, timeline events, and unsent drafts. Refresh requests can be queued durably. This memory is application data, not free-form model recollection.

## Workflows

Legacy agent workflow helpers define `detect → analyze → draft → verify` stages and stage allowlists. The current revenue-recovery pipeline is more deterministic: provider ingestion, identity, feature projection, scoring, policy, case transitions, approval, sending, and attribution are handled by application code and durable job handlers under `platform/src/jobs` and `platform/src/recovery`.

The daily cron intentionally uses deterministic reconciliation and the recovery queue instead of asking a free-form agent to sweep every account.

## Approval boundaries

Two approval mechanisms must not be conflated:

1. **Recovery draft approval is active.** It binds approval to an expected content hash and queues durable sending.
2. **Generic chat tool approval is scaffolded but not enabled.** `tool_approval_requests` and `/api/agent/approvals` exist, but `MANUAL_APPROVAL_REQUIRED_TOOL_NAMES` is currently empty.

Therefore, do not claim that every external write initiated in chat is automatically intercepted for founder approval. Persona allowlists, prompts, provider APIs, and runtime guards still constrain behavior, but they are not equivalent to a universal approval gate.

## Observability

`run-logger.ts` persists agent runs. `run-inspection.ts` groups stage runs into workflow views exposed through:

- `GET /api/agent/runs`
- `GET /api/agent/runs/[workflowId]`

Announced-action checks identify turns that promised tool work but completed no tool call. The UI exposes session history, while recovery workflow inspection is surfaced primarily through `/dashboard/flows`.

## Relevant source

```text
platform/src/agent/memory/
platform/src/agent/personas/
platform/src/agent/runtime/
platform/src/agent/tools/
platform/src/agent/workflows/
platform/src/app/api/agent/
platform/src/ui/chat/
```

## Validation

On **2026-09-05**, the full suite passed 439 tests and the production build passed. Agent-specific coverage includes routing, individual tools, external-content handling, trusted message metadata, memory/session behavior, runtime context, run inspection, workflows, and announced actions.
