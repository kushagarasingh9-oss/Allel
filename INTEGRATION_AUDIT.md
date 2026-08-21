# Integration System Audit

> Started: 2026-08-06  
> Last Verified: 2026-08-22  
> **Status:** Active Reference & Remediation Audit.  
> **Recent Fixes Landed:**  
> - **Fabrication Removed:** `getSlackCredentials` no longer invents `direct_token_*` synthetic credentials.
> - **Live Integration Guard Shipped:** `wrapToolWithLiveIntegrationGuard` wraps all 136 tools in `agent.ts`, preventing fake mock data when credentials or tokens fail.
> - **Google Calendar OAuth**: Verified Calendar OAuth flow with complete scope; manual insecure app-password path disabled for private user calendar data.
> - **Sync Status Agreement:** Unified connection status checking between `connection-guard.ts` and `dashboard/data.ts`.

## Audit Objective

Trace every provider through:

`Connection → Authentication → Data Fetch → Storage → Agent Tool/Context → Response → Real-time Update`

The audit distinguishes three architectures that the product currently mixes:

1. **Synced providers** — provider data is normalized into Supabase on connect/cron/webhook.
2. **Tool-only providers** — no local copy exists; the agent must deliberately call a live provider tool.
3. **Planned providers** — visible in the catalog but intentionally unavailable.

This distinction is essential: a green “connected” badge does not itself mean content is synchronized, injected into every prompt, or monitored in real time.

---

## Step 1 — Connection, Authentication, and Token Flow

### Scope inspected

- `web/src/lib/integrations/catalog.ts`
- `web/src/lib/integrations/provider-tokens.ts`
- `web/src/lib/integrations/connection-guard.ts`
- `web/src/lib/integrations/gmail.ts`
- `web/src/lib/integrations/google-calendar.ts`
- `web/src/lib/integrations/slack.ts`
- provider credential validators
- `web/src/app/api/integrations/gmail/callback/route.ts`
- `web/src/app/dashboard/settings/actions.ts`
- `web/src/components/DirectConnectModal.tsx`

### Verified architecture

- Gmail and Google Calendar share the only implemented OAuth initiation/callback route.
- Pipedream connection actions were removed. Non-Google providers use manually supplied API keys, personal access tokens, private-app tokens, or Slack bot tokens.
- Gmail and Calendar independently store encrypted `oauth_access` and `oauth_refresh` rows.
- Only Google providers implement expiring access-token refresh.
- Other supported providers use long-lived provider tokens and therefore do not currently have refresh-token flows.
- `requireIntegrationConnected()` blocks missing, disconnected, unhealthy, and known legacy-demo connection rows before token use.

### Root cause 1 — Google Calendar can be marked connected with a credential that cannot call Calendar APIs

`connectGoogleCalendarDirect()` accepts any non-empty string, stores it as an `api_key`, and immediately marks the integration `connected`. It performs no Calendar API validation.

`getCalendarAccessToken()` later treats that stored `api_key` as an OAuth bearer access token. Google Calendar private user data cannot be accessed using a Gmail app password or ordinary API key as a bearer token.

The UI reinforces the invalid path:

- Calendar is described as “uses Gmail OAuth,” although the implementation creates a separate Calendar OAuth grant.
- The manual field invites an “App Password / Key.”
- Submitting it calls `connectGoogleCalendarDirect()` and reports success without a provider read.

Result: the settings page can truthfully contain a `connected` row while every Calendar content request fails with authorization errors.

### Root cause 2 — Slack credential validation accepts unverified or invalid tokens

`validateSlackBotToken()` returns `true` solely from common token prefixes (`xoxb-`, `xoxp-`, `xoxe-`, `xapp-`) without calling `auth.test`. For unknown formats it also returns `true` when Slack returns a non-2xx response or when the validation request throws.

Result: malformed, revoked, network-unverified, app-level, or wrong-kind tokens can be persisted and marked connected.

A Slack app-level `xapp-` token is not a substitute for the bot/user OAuth token required by Web API methods such as `conversations.history` and `chat.postMessage`.

### Root cause 3 — Slack silently fabricates credentials after token-access failure

`getSlackCredentials()` catches every failure from connection/token/metadata retrieval and substitutes:

`direct_token_slack_<workspaceId>`

It then defaults the channel to `general`. `getSlackChannelHistory()` recognizes this fabricated token and returns an empty message list with a note instead of failing the integration call.

Result: disconnected, unhealthy, missing-token, decrypt, and database failures can be converted into an apparently successful but empty Slack response. This directly matches the reported symptom: “connected but effectively empty.” It also defeats the strict connection guard defined elsewhere.

### Root cause 4 — Slack channel configuration is not validated

The connect form defaults the channel value to the string `general`, while Slack APIs normally require a channel ID such as `C01234567`. `connectSlack()` stores the value without resolving or validating channel access.

`getSlackCredentials()` only auto-discovers a channel when metadata has no channel value. Because `general` is stored, discovery is skipped and later history calls can fail with `channel_not_found`.

The token validator also does not verify required scopes or whether the bot belongs to the configured channel.

### Root cause 5 — OAuth CSRF nonce is generated but never validated

Google OAuth state contains `workspaceId:nonce:provider`, but the callback explicitly ignores the nonce. Workspace membership is checked, which limits impact, but it does not provide full OAuth state/CSRF protection or bind the callback to the browser session that initiated it.

### Root cause 6 — Connection status has inconsistent meaning across providers

For Calendar manual connect, status means only “a string was stored.” For Slack, it can mean only “the token looked like a Slack prefix.” For Notion, Airtable, HubSpot, Intercom, Linear, Sentry, Stripe, and PostHog, connection functions perform at least one provider API request before publishing connected state.

This inconsistency makes the settings badge unreliable as a universal readiness signal.

### Why Gmail behaves better at the authentication layer

Gmail has a mature provider-specific path:

- dedicated OAuth scopes;
- authorization-code exchange;
- encrypted access and refresh token storage;
- expiry checks and refresh logic;
- a sync immediately after OAuth callback because Gmail is categorized as `syncable`.

Calendar has token refresh support when OAuth is used, but it is categorized as `tool_only`, so the callback performs no content sync. Its unsafe manual credential path can bypass OAuth entirely.

Slack has neither OAuth installation nor strict token/channel/scope validation. Its fallback converts token failures to empty results.

### Authentication fixes required

1. Delete or disable `connectGoogleCalendarDirect()` for private Calendar data.
2. Make Calendar OAuth the only supported Calendar connection path.
3. Validate Calendar access with a real Calendar API call before setting `connected`.
4. Persist and validate one-time OAuth state server-side.
5. Rewrite Slack validation to always call `auth.test` and reject request failures.
6. Accept only token types supported by the requested Slack operations.
7. Resolve a channel name to a channel ID and verify bot membership/access during connect.
8. Remove all fabricated `direct_token_*` credential fallbacks.
9. Make token/connection failures explicit and mark the connection `needs_attention` where appropriate.
10. Record a provider-readiness result containing identity, granted capabilities/scopes where discoverable, validation time, and actionable failure details.

---

## Step 2 — Provider Data Fetch and Storage

### Verified provider models

| Provider | Catalog mode | Fetch/storage behavior |
|---|---|---|
| Gmail | Syncable + live tools | Reads Gmail, normalizes account/contact/signal/timeline data, and exposes direct tools. |
| Stripe | Syncable + live tools | Normalizes billing/account data; Stripe webhooks add partial real-time updates. |
| PostHog | Syncable + live tools | Normalizes usage/account signals; configured action webhooks add partial real-time updates. |
| Intercom | Syncable + live tools | Polling sync normalizes contacts, open conversations, signals, and timeline entries. |
| HubSpot | Syncable + live tools | Polling sync normalizes companies and contacts. |
| Sentry | Syncable + live tools | Polling sync matches unresolved issues to known accounts and writes signals/timeline entries. |
| Linear | Syncable + live tools | Polling sync matches open issues to known accounts and writes signals/timeline entries. |
| Slack | Incorrectly labeled syncable | “Sync” only generates and posts a founder brief. It does not ingest channels, messages, files, users, or events. |
| Google Calendar | Tool-only | No storage or sync. Events are fetched only when the model chooses a Calendar tool. |
| Notion | Tool-only | No storage or sync. Content is fetched only when the model chooses a Notion tool. |
| Airtable | Tool-only | No storage or sync. Records are fetched only when the model chooses an Airtable tool. |
| Planned catalog entries | Planned | No usable data path by design. |

### Root cause 7 — Slack “sync” does not synchronize Slack data

`syncSlackWorkspace()` generates the product’s own founder brief and posts it to Slack. It never calls channel history, search, file, user, or event APIs and never writes inbound Slack content to normalized storage.

The success message says “Slack delivered the brief,” confirming that this runner is an outbound delivery operation rather than an inbound data synchronization job.

Result: cron/manual sync cannot make Slack messages available to the agent. The only possible inbound Slack path is an on-demand live tool call.

### Root cause 8 — Slack delivery failures are swallowed and reported as successful

`syncSlackWorkspace()` catches `postSlackMessage()` errors, logs a warning, and continues. It then:

- upserts the connection as `connected`;
- sets `last_synced_at`;
- writes coverage claiming the daily brief was delivered;
- logs a completed integration run;
- returns `delivered: true`.

Result: invalid Slack credentials, channel IDs, missing scopes, or membership errors can produce a green successful sync even when Slack rejected the operation.

### Root cause 9 — Slack history tool fabricates content and connected status on failure

`getSlackHistory` has two masking behaviors:

1. A successful API response with zero messages is replaced by a synthetic “Slack channel connected” message.
2. Every thrown exception is caught without inspecting the error and replaced by a synthetic “Monitoring active team channels” message with `status: connected`.

This is a direct correctness defect. The model receives invented provider content and cannot distinguish an empty channel from invalid authentication, missing scopes, a wrong channel, provider downtime, or a database/decryption failure.

### Root cause 10 — Tool-only data is not agent context until the model calls a tool

Calendar, Notion, and Airtable content is not synchronized, indexed, cached, or preloaded into the conversation. Their “sync” operation merely sets metadata to `available` and returns a message that data will be read live.

This architecture can provide fresh data, but only if all of the following happen:

- authentication is valid;
- the corresponding tool is exposed to the active agent;
- the model recognizes that it must call that tool;
- the model supplies valid parameters;
- the live request succeeds;
- the tool error is not masked.

A connected badge alone therefore cannot make this data automatically visible to the model.

### Root cause 11 — “Real time” exists only as request-time reads for tool-only providers

Google Calendar, Notion, and Airtable have no webhook, polling, subscription, index, or local event pipeline. Their data can be current at the instant an explicit tool call is made, but the agent cannot proactively react to new events and cannot reason over those providers unless it invokes the tool during that turn.

### Synced-provider limitation

Intercom, HubSpot, Sentry, and Linear are polling-based. Their normalized content is only as fresh as the most recent successful connect/manual/daily sync. No provider event receiver was found for them.

Sentry and Linear also only normalize issues that can be matched to existing account names or contact emails. Unmatched provider records remain inaccessible through normalized account context, even though direct live tools may still retrieve them.

### Data-pipeline fixes required

1. Split Slack into two explicit capabilities: inbound Slack intelligence and outbound brief delivery.
2. Implement Slack ingestion for channels/messages/files needed by the product, or clearly retain a live-tool-only model.
3. Never mark Slack delivery successful after `postSlackMessage()` fails.
4. Remove every synthetic success/message fallback from Slack tools.
5. Return structured errors with provider, operation, HTTP/API code, required scope, and remediation.
6. Expose freshness and coverage separately: authenticated, readable, writable, last verified, last inbound sync, and last outbound delivery.
7. Decide per provider whether the product promises request-time access, periodic indexing, or event-driven updates; do not call all three “connected.”
8. Add incremental cursors and durable ingestion jobs for providers that need searchable historical context.

---

## Next Step

Step 3 traces tool registration, persona/stage filtering, workspace binding, prompt construction, and whether the active chat agent is instructed and able to call each provider tool.
