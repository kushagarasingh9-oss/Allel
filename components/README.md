# Allel Component Library & Design Reference

This directory (`/components`) serves as the permanent, authoritative reference library of Allel's dashboard, chat, feed, shell, and primitive UI components.

> **Purpose:** Preserve exact component implementations, layout structures, and design tokens to prevent UI regressions and design hallucinations across development cycles.

---

## Directory Structure

```
components/
├── README.md                           # This manifest and usage guide
├── styles/
│   └── design-tokens.md                # Palette (#0d0d0f), Typography, Shimmers, Invariants
├── chat/
│   ├── timeline-nodes.tsx              # Agent speech, thought blocks, connect pill buttons
│   ├── agent-feed.tsx                  # Tool execution flow, unboxed node status rows
│   ├── unified-customer-scan-tree.tsx  # Customer 360 diagnosis tree
│   ├── pinned-todo-panel.tsx           # Pinned action items panel
│   └── chat-provider.tsx               # Chat context and thread management
├── primitives/
│   ├── devin-chat-box.tsx              # Fixed bottom omnibar chatbox
│   ├── animated-ai-input.tsx           # Animated text input with status indicators
│   ├── dotm-square-12.tsx              # Vector dot matrix graphic
│   └── tooltip.tsx                     # Tooltip primitive
├── shell/
│   ├── app-sidebar.tsx                 # Main sidebar (New task, Brief, Agents, Connections, etc.)
│   └── theme-provider.tsx              # Theme context provider
├── dashboard/
│   ├── allel-command-center.tsx        # Central command center & chat viewport
│   ├── brief-view.tsx                  # Minimal editorial typography Brief page (Zero cards)
│   ├── connections-view.tsx            # Connections grid & modal management
│   ├── left-pane.tsx                   # Left pane view
│   └── workspace-layout.tsx            # Main workspace layout wrapper
└── cards/
    ├── AccountRow.tsx                  # Customer account row styling
    ├── RiskBadge.tsx                   # High / Medium / Low risk badge
    ├── DraftCard.tsx                   # Email recovery draft card with action buttons
    ├── StatusBadge.tsx                 # Recovery status badge
    └── DirectConnectModal.tsx          # Direct API key connection modal
```

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

4. **Integration Routes:**
   - Always route users to `/dashboard/connections`.
   - Never reference deprecated "Settings -> Integrations" paths.
