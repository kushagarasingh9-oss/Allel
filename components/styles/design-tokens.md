# Allel Design System & UI Tokens Reference

This document defines the authoritative design tokens, typography, colors, animations, and component invariants for the Allel platform. **Use this as the source of truth to avoid design hallucinations.**

---

## 1. Core Color Palette & Backgrounds

| Token | Hex / Class | Description / Usage |
|---|---|---|
| **Canvas Background** | `#0d0d0f` | Main viewport background for the entire application, Brief, and Dashboard. |
| **Sidebar Background** | `#0a0a0c` / `bg-[#0a0a0c]` | App sidebar background, slightly darker than canvas. |
| **Card / Surface (when permitted)** | `#101012` / `bg-[#101012]` | Used in Connections grid for integration tiles. |
| **Input / Search Background** | `#0c0c0e` / `bg-[#0c0c0e]` | Omnibar and search input field fill. |
| **Subtle Border** | `border-white/[0.04]` / `border-white/[0.06]` | Hairline dividers for headers, timeline borders, and subtle rows. |
| **Medium Border** | `border-white/10` / `border-neutral-700/80` | Button outlines and active card borders. |
| **Primary Text** | `#F4F4F5` / `text-white` | Page headers, active customer names, bold emphasis. |
| **Secondary Text** | `text-zinc-300` / `text-neutral-300` | Narrative paragraphs, editorial descriptions, conversational responses. |
| **Muted Text** | `text-zinc-400` / `text-neutral-400` | Subtitles, next action suggestions, timeline details. |
| **Subtle / Meta Text** | `text-zinc-500` / `text-neutral-500` | Timestamps, step counts, pill borders. |

---

## 2. Brand Typography & Shimmers

### Shimmer Text Effects
```css
/* Silver Shimmer for Founder Greeting ("Hey Founder") */
.silver-shimmer-text {
  background: linear-gradient(
    90deg,
    #ffffff 0%,
    #a1a1aa 25%,
    #ffffff 50%,
    #a1a1aa 75%,
    #ffffff 100%
  );
  background-size: 200% auto;
  color: transparent;
  -webkit-background-clip: text;
  background-clip: text;
  animation: silverShimmer 6s linear infinite;
}

/* Brief Title Shimmer */
.brief-shimmer-text {
  background: linear-gradient(
    90deg,
    #ffffff 0%,
    #a1a1aa 35%,
    #ffffff 70%,
    #ffffff 100%
  );
  background-size: 200% auto;
  color: transparent;
  -webkit-background-clip: text;
  background-clip: text;
  animation: briefShimmer 8s linear infinite;
}
```

---

## 3. Official Vector Logos & SVGs

All integration references MUST use official SVG logos from `/logos/`. Never substitute generic emojis or coloured circle emoji balls.

| Integration | Logo Path | Dimensions |
|---|---|---|
| **Allel Dot** | `/dot.png` | `16x16` (`w-4 h-4 object-contain`) |
| **Stripe** | `/logos/stripe.svg` | `14x14` inline, `20x20` card |
| **Gmail** | `/logos/gmail.svg` | `14x14` inline, `20x20` card |
| **PostHog** | `/logos/posthog.svg` | `14x14` inline, `20x20` card |
| **Intercom** | `/logos/intercom.svg` | `14x14` inline, `20x20` card |
| **Slack** | `/logos/slack.svg` | `14x14` inline, `20x20` card |
| **Google Calendar**| `/logos/google-calendar.svg` | `14x14` inline, `20x20` card |
| **HubSpot** | `/logos/hubspot.svg` | `14x14` inline, `20x20` card |
| **Linear** | `/logos/linear.svg` | `14x14` inline, `20x20` card |
| **Sentry** | `/logos/sentry-light.svg` | `14x14` inline, `20x20` card |

### Inline Tool Badge Component
```tsx
function InlineTool({ name, icon }: { name: string; icon: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-white align-middle mx-1">
      <img
        src={icon}
        alt={name}
        className="w-3.5 h-3.5 inline-block object-contain"
        style={{ width: 14, height: 14 }}
      />
      <span>{name}</span>
    </span>
  )
}
```

---

## 4. UI Invariants & Strict Rules

### Rule A: Brief Page is Pure Editorial Typography (Zero Cards)
- **Container**: `w-full max-w-[760px] mx-auto px-6 h-full flex flex-col relative min-h-0`
- **Text Styling**: `text-[14.5px] leading-relaxed text-zinc-300 space-y-4`
- **Greeting**: `<h2 className="text-[17px] font-medium tracking-tight text-white"><span className="silver-shimmer-text">Hey {userName}</span>, {greeting}.</h2>`
- **STRICT PROHIBITION**: NEVER add bordered card containers, badge cards, or multi-column grids to the Brief page. Everything is pure editorial narrative copy with `<InlineTool>` badges and clickable underlined text.

### Rule B: Timeline Nodes are Clean & Unboxed
- When an integration is disconnected or checked:
  - **CORRECT**: Pure, unboxed text row with a small status dot:
    ```tsx
    <div className="text-[12px] text-neutral-400 py-1 flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 shrink-0" />
      <span>No integrations connected across your workspace. Head over to <a href="/dashboard/connections" className="text-neutral-200 underline underline-offset-2 hover:text-white transition-colors">Connections</a>.</span>
    </div>
    ```
  - **STRICT PROHIBITION**: NEVER wrap node status in `bg-neutral-900/60 border border-neutral-800 rounded-lg` card boxes or add bordered button elements inside the timeline node.

### Rule C: Connect Buttons Below Agent Chat
- Below the agent speech block in `AgentSpeechBlock`, surface clean, targeted pill buttons for the relevant tools:
  ```tsx
  <a
    href="/dashboard/connections"
    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-neutral-200 hover:text-white bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700/80 hover:border-neutral-500 rounded-lg transition-all duration-150 shadow-sm"
  >
    <img src={item.logoUrl} alt={item.name} className="w-3.5 h-3.5 object-contain shrink-0" />
    <span>Connect {item.name}</span>
    <ChevronRight className="w-3 h-3 text-neutral-400" />
  </a>
  ```

### Rule D: Omnibar Bottom Chatbox Positioning
- Fixed bottom container with gradient fading mask:
  ```tsx
  <div className="absolute bottom-0 left-0 right-0 w-full z-30 px-6 pb-5 pt-8 bg-gradient-to-t from-[#0d0d0f] from-70% via-[#0d0d0f]/90 to-transparent flex justify-center pointer-events-none [&>*]:pointer-events-auto">
    <DevinChatBox ... />
  </div>
  ```

---

## 5. Canonical Button Tokens & Non-Negotiable Rules

Allel adheres to strict button design rules to keep visual noise minimal:

1. **Connect Integration Pill (`ConnectIntegrationPill`):**
   - **Background & Border:** `bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700/80 hover:border-neutral-600`
   - **Border Radius:** `rounded-lg` (`8px`)
   - **Layout:** `group/btn flex items-center gap-2 px-2.5 py-1.5 transition-all text-left`
   - **Icon:** Official monochrome or brand SVG from `/logos/` at `14x14` (`w-3.5 h-3.5 object-contain shrink-0`)
   - **Chevron:** `<ChevronRight className="w-3 h-3 text-neutral-500 group-hover/btn:text-neutral-300 ml-auto transition-colors shrink-0" />`
   - **Invariant:** Must be placed as an inline or pill element **below** the agent chat speech block. Never nest inside card wrappers, timeline status nodes, or multi-column grids.

2. **Primary White Button (`PrimaryButton`):**
   - **Token:** `bg-white text-zinc-950 font-medium hover:bg-zinc-200 active:scale-[0.98] transition-all rounded-lg shadow-xs`
   - **Disabled State:** `disabled:opacity-40 disabled:pointer-events-none disabled:active:scale-100`

3. **Secondary Ghost Button (`SecondaryButton`):**
   - **Token:** `bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white border border-white/[0.08] hover:border-white/15 active:scale-[0.98] transition-all rounded-lg`

4. **Approval Button (`ApproveButton`):**
   - **Token:** `bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-medium transition-all rounded-md shadow-xs`

5. **Circular Chat Send Button (`CircularSendButton`):**
   - **Active:** `w-8 h-8 rounded-full bg-white text-black hover:bg-zinc-200 shadow-md active:scale-95`
   - **Disabled:** `bg-[#5a5a5a] text-[#1c1c1c] cursor-not-allowed opacity-90`
   - **Streaming/Stop:** Displays `<Square className="w-3.5 h-3.5 fill-current" />`
