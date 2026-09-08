# Allel Component Library & Design Reference

This directory (`/components`) serves as the permanent, authoritative reference library of Allel's dashboard, chat, feed, shell, buttons, and primitive UI components.

> **Purpose:** Preserve exact component implementations, layout structures, and design tokens to prevent UI regressions, button distortions, and design hallucinations across development cycles.

---

## Directory Structure

```
components/
├── README.md                           # This manifest and usage guide
├── styles/
│   └── design-tokens.md                # Palette (#0d0d0f), Typography, Shimmers, Button tokens, Invariants
├── buttons/
│   ├── index.ts                        # Barrel export for all canonical button components
│   └── buttons.tsx                     # 13 canonical button variants, tokens, and interactive showcase
├── chat/
│   ├── agent-feed.tsx                  # Live streaming agent feed, thoughts, tools, approvals
│   ├── agent-pane.tsx                  # Right pane container integrating feed and prompt input
│   ├── chat-provider.tsx               # Chat context, thread management, and streaming state
│   ├── pinned-todo-panel.tsx           # Pinned action items checklist and task planner
│   ├── tasks-dropdown.tsx              # Expandable "To do today" interactive dropdown & proceed action
│   ├── timeline-nodes.tsx              # All timeline nodes, tool calls, and connect pills
│   └── unified-customer-scan-tree.tsx  # Customer 360 diagnosis scan tree visualization
├── dashboard/
│   ├── account-detail-view.tsx         # Deep customer account timeline, health, and risk view
│   ├── accounts-view.tsx               # Customer accounts ranked by risk tab
│   ├── allel-command-center.tsx        # Central command center & chat viewport
│   ├── automations-view.tsx            # Automations & Flows tab (cases, filters, drawer tabs, replays)
│   ├── brief-view.tsx                  # Minimal editorial typography Daily Brief tab (Zero cards)
│   ├── connections-view.tsx            # Integrations & connections grid and modal management
│   ├── drafts-view.tsx                 # Follow-up drafts queue tab with approvals
│   ├── home-agent-panel.tsx            # Live streaming agent panel with tabs, resize, history, thoughts
│   ├── left-pane.tsx                   # Left overview pane with accounts, tasks, metrics
│   ├── settings-view.tsx               # Integrations & settings management tab
│   └── workspace-layout.tsx            # Main workspace split-pane layout wrapper
├── primitives/
│   ├── animated-ai-input.tsx           # Floating glass AI prompt input with auto-resize
│   ├── devin-chat-box.tsx              # Fixed bottom omnibar chatbox with mode popover
│   ├── dotm-square-12.tsx              # Vector dot matrix graphic primitive
│   ├── otp-input.tsx                   # 6-digit verification code input
│   ├── theme-toggle.tsx                # Theme switcher pill
│   └── tooltip.tsx                     # Tooltip primitive
├── shell/
│   ├── app-sidebar.tsx                 # Main sidebar (New task, Brief, Automations, Connections, etc.)
│   ├── legal-shell.tsx                 # Legal and auth layout shell
│   └── theme-provider.tsx              # Theme context provider
└── cards/
    ├── AccountRow.tsx                  # Customer account row styling
    ├── DirectConnectModal.tsx          # Direct API key connection modal
    ├── DraftCard.tsx                   # Email recovery draft card with action buttons
    ├── RiskBadge.tsx                   # High / Medium / Low risk badge
    └── StatusBadge.tsx                 # Recovery case status badge
```

---

## Canonical Button Design System (`components/buttons/`)

Allel employs a strictly defined button vocabulary matching dark-mode minimalism:

| Button Component | Styling & Token | Typical Usage |
|---|---|---|
| `ConnectIntegrationPill` | `bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700/80 rounded-lg` | Rendered directly below agent messages for disconnected tools. Includes official SVG logo + ChevronRight. |
| `PrimaryButton` | `bg-white text-zinc-950 font-medium hover:bg-zinc-200 rounded-lg shadow-xs` | Primary call to action (Run Scan, Connect, Save, Dispatch). |
| `SecondaryButton` / `GhostButton` | `bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.08] rounded-lg` | Secondary actions, drawer dismissals, timeline toggles. |
| `ApproveButton` | `bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-md shadow-xs` | Human-In-The-Loop approval for recovery drafts and automated actions. |
| `RejectButton` | `bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-md` (or `bg-rose-500/10 text-rose-400 border border-rose-500/20`) | Reject action, disconnect confirmation, cancel modal. |
| `CircularSendButton` | `w-8 h-8 rounded-full bg-white text-black hover:bg-zinc-200` (disabled: `bg-[#5a5a5a] text-[#1c1c1c]`) | Omnibar submit button (turns to square stop button while streaming). |
| `VoiceMicButton` | `p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]` | Voice dictation toggle inside chat input. |
| `FilterPillButton` | `px-2.5 py-1 rounded-md text-xs font-medium` (`bg-white/10 text-white` vs `text-zinc-400`) | Tab filters in Automations, Case lists, and Settings. |
| `ModeSelectorPill` | `flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200` + `bg-[#333333] text-white px-2 py-0.5 rounded-md` | Agent execution mode switcher (Normal, Fusion, Ultra, Lite). |
| `ProceedWithTasksButton` | `text-[#0055FF] hover:text-[#3377FF] bg-[#0055FF]/10 hover:bg-[#0055FF]/20 px-2.5 py-1 rounded-md` | Radiant task dispatch trigger in TasksDropdown. |
| `RefreshIconButton` | `bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.06] rounded-md` | Data refresh button with spinning state animation. |
| `DirectOAuthConnectButton` | `bg-[#121214] hover:bg-[#18181b] border border-white/[0.08] rounded-xl p-3.5` | Rich integration connection card in modal / settings. |
| `SidebarNavButton` | `px-3 py-2 rounded-lg text-xs font-medium` (`bg-white/10 text-white` vs `text-neutral-400`) | Left sidebar navigation items. |

---

## Core Guidelines & Non-Negotiables

1. **Brief Page (`brief-view.tsx`):**
   - Pure editorial typography (`max-w-[760px]`, `text-[14.5px] leading-relaxed text-zinc-300`).
   - Silver shimmer greeting: `<span className="silver-shimmer-text">Hey {userName}</span>, {greeting}.`
   - Shimmer Brief title: `<span className="brief-shimmer-text">Brief</span>`
   - **NO CARDS**: Never add boxed cards, bordered panels, or multi-column grids to the brief page. Use `<InlineTool>` badges and clickable text.

2. **Timeline Nodes (`timeline-nodes.tsx` & `agent-feed.tsx`):**
   - When tools run or check connections: keep status lines **unboxed**.
   - Do NOT wrap "No integrations connected yet" inside a bordered card box inside the timeline node.
   - Below the agent speech block: render clean, targeted connect buttons (`Connect Stripe >`, `Connect Gmail >`) with their official SVG logos.

3. **Bottom Omnibar (`devin-chat-box.tsx`):**
   - Fixed at the bottom with a 70% fade gradient mask (`bg-gradient-to-t from-[#0d0d0f] from-70% via-[#0d0d0f]/90 to-transparent`).
   - Clean micro-interactions, pill toggles, and status indicators.

4. **Automations & Workflows Tab (`automations-view.tsx`):**
   - Retains full drawer mechanics (Features, Timeline, Drafts, Jobs).
   - Real-time case filters (`all`, `active`, `engaged`, `recovered`, `failed`).
   - Replay / Dispatch actions for founder-in-the-loop workflows.

5. **Integration Routes:**
   - Always route users to `/dashboard/connections`.
   - Never reference deprecated "Settings -> Integrations" paths.
