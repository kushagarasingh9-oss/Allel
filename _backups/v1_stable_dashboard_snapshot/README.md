# V1 Stable Dashboard & AI Agent UI Backup Snapshot

This directory contains a complete, working snapshot of the Allel dashboard UI, AI chat feed with stop-button support, integration tools, and agent runtime before the dashboard UI overhaul.

## Snapshot Date
- **Timestamp:** August 29, 2026

## Included Components
- **`ui/`**: Complete Next.js React UI (Chat provider, HomeAgentPanel, AgentFeed, animated input with stop button, timeline nodes, workspace layout, themes).
- **`agent/`**: Complete agent runtime, tools, memory, and persona definitions with SVG branding.
- **`integrations/`**: Complete integration clients (Gmail, Google Calendar, Stripe, PostHog, Slack, Linear, Sentry, Notion, HubSpot, Intercom).

## Instant 1-Command Restore
To restore this snapshot back into `platform/src`:
```bash
cp -r _backups/v1_stable_dashboard_snapshot/ui/* platform/src/ui/
cp -r _backups/v1_stable_dashboard_snapshot/agent/* platform/src/agent/
cp -r _backups/v1_stable_dashboard_snapshot/integrations/* platform/src/integrations/
```
