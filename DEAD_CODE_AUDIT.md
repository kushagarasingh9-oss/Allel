# Dead Code & Repository Hygiene Audit

Read-only inventory. Nothing was deleted, moved, or edited. Every row below is backed by a grep or file read performed during the audit.

## Summary

- **282 files audited** on disk (excluding `node_modules`, `.next`, `.git`, `.kiro`); **266 tracked by git**.
- **48 removal candidates** identified: 25 unreferenced source modules, 17 unreachable files under `components/ui/`, 20 unreferenced public assets, 1 duplicated migration, plus scratch directories and doc contradictions.
- **Headline finding:** the repository is ~80 MB tracked, and **~62 MB of that is `web/public/` image and video files that no code references** (`image1.png` alone is 21 MB). A second, independent finding: `web/src/app/page.tsx` serves the landing hero video from `/1.mp4`, but root `.gitignore:45` (`*.mp4`) excludes `web/public/1.mp4` from git — so a fresh clone or CI build ships that `<video>` with only a `.mov` fallback that Chrome and Firefox will not play.
- Secondary finding: `components/ui/` has 21 files but only **4** are reachable from any app entry point (`tooltip`, `dotm-square-12`, `animated-ai-input`, `theme-toggle`). The other 17 form a self-contained island that nothing outside `ui/` imports.
- All 15 test files are live and healthy: `npm test` in `web/` ran **76 tests, 76 passing, 0 failing**. No test is recommended for removal.

Method used for reachability: extracted all 400 `from '...'` / `import('...')` / `require('...')` specifiers across `web/src` and `web/scripts` into a single list, then checked each module's basename against it, and separately grepped every exported symbol name. Dynamic imports were enumerated explicitly (`grep "await import("`) and treated as real references — this is how `@/lib/ai/draft-generator`, `@/lib/integrations/gmail`, and `@/lib/integrations/connection-guard` were cleared. No template-literal or variable import paths exist in this codebase (`grep "import(\`"` returned zero).

---

## 1. Confidently unreferenced source modules

Nothing in `web/src`, `web/scripts`, `frontend/`, or the config files imports these, by path or by any exported symbol.

| File | Why unnecessary | Evidence | Confidence | Risk if removed |
|---|---|---|---|---|
| `web/src/components/dashboard/flows-page.tsx` (782 lines) | Full run-history UI that no route mounts. `app/dashboard/flows/page.tsx` is a 7-line placeholder rendering an empty div with the comment `{/* Empty workflows view */}`. | `grep -rIn "flows-page\|FlowsPage" web/src` → only the definition at line 547 | High | Loses the only written implementation of the flows screen. Docs claim this ships — see §5. Keep unless the flows screen is being rebuilt from scratch. |
| `web/src/components/agent-feed/generative-cards.tsx` (391 lines) | 19 exported card components, all consumed only by `mock-message.tsx`, which is itself unreferenced. Dead pair. | Per-symbol grep of all 19 exports: every hit is inside `generative-cards.tsx` or `mock-message.tsx` | High | None to runtime. Loses a design reference for tool-result card styling. |
| `web/src/components/AgentChat.tsx` (301 lines) | Standalone `useChat` + `DefaultChatTransport` widget superseded by the `ChatProvider` / `AgentFeed` / `AgentPane` stack. | `grep -rIn "AgentChat" web/src` → only `AgentChatMessage`, `buildAgentChatId`, `AgentChatScope` (unrelated identifiers in `api/agent/route.ts` and `chat-session.ts`); zero imports of the component | High | None. See §2 for the surviving implementation. |
| `web/src/lib/engine/compound-signals.ts` (227 lines) | Churn pattern detector (`detectCompoundSignals`) never called. | `grep -rIn -w detectCompoundSignals web/src` → definition only, line 193 | High | Loses the accelerating-decline / chronic-risk detection logic. It is the only consumer of `score-history.ts` (next row). |
| `web/src/components/agent-feed/mock-message.tsx` (209 lines) | Static mock transcript for design iteration. Not mounted. | `grep -rIn -w MockAgentMessage web/src` → the only external hit is a string literal inside `generative-cards.tsx:187` (fake error text), not an import | High | None. |
| `web/src/lib/engine/score-history.ts` (185 lines) | `recordScoreSnapshot`, `calculateScoreVelocity`, `getScoreHistory` are never called. Its only importer is `compound-signals.ts`, and that is a type-only import of `ScoreSnapshot`. | Per-symbol grep of all three functions returned zero hits outside the file. `grep -rIn score_snapshots web/src` → only lines 61/107/172 in this file | High | The `score_snapshots` table from `20260711_score_history.sql` becomes fully orphaned. Removing both files leaves the table write-only-by-nobody. |
| `web/src/components/dashboard/main-workspace-canvas.tsx` (141 lines) | Canvas shell not mounted by any route or layout. | `grep -rIn -w MainWorkspaceCanvas web/src` → definition only, line 16 | High | None. |
| `web/src/components/DashboardSidebar.tsx` (131 lines) | Superseded by `app-sidebar.tsx`. See §2. | `grep -rIn -w DashboardSidebar web/src` → definition only, line 58 | High | None. |
| `web/src/components/agent-feed/planning-card.tsx` (89 lines) | `GenerativePlanningCard` never rendered. | `grep -rIn -w GenerativePlanningCard web/src` → definition only, line 19 | High | None. |
| `web/src/components/ActionTaskCard.tsx` (76 lines) | Renders `ActionTask` from `mock-data`. No route imports it. | `grep -rIn -w ActionTaskCard web/src` → definition only, line 32 | High | None. |
| `web/src/components/BriefCard.tsx` (68 lines) | Not imported. It is the only reason `EvidencePill.tsx` still has an importer. | `grep -rIn -w BriefCard web/src` → definition only, line 5 | High | Would orphan `EvidencePill.tsx` (its sole importer is `BriefCard.tsx:3`). |
| `web/src/lib/ai/risk-explainer.ts` (47 lines) | `explainRisk` never called. | `grep -rIn -w explainRisk web/src` → definition only, line 19 | High | `buildRiskExplanationPrompt` in `lib/ai/prompts.ts` becomes unused, though `prompts.ts` stays live via `draft-generator.ts`. |
| `web/src/components/dashboard/welcome-canvas.tsx` (38 lines) | Not mounted. | `grep -rIn -w WelcomeCanvas web/src` → definition only, line 5 | High | None. |
| `web/src/components/SignalFeedItem.tsx` (27 lines) | Not imported. | `grep -rIn -w SignalFeedItem web/src` → definition only, line 3 | High | None. |
| `web/src/components/MetricCard.tsx` (24 lines) | Not imported. | `grep -rIn -w MetricCard web/src` → definition only, line 3 | High | None. |
| `web/src/hooks/use-mobile.ts` (19 lines) | shadcn's `useIsMobile` hook. Normally consumed by shadcn's sidebar, but this repo's `components/ui/sidebar.tsx` is a bespoke `motion/react` + Tabler implementation that does not use it — and that file is itself unreachable. | `grep -rIn -w useIsMobile web/src` → definition only, line 5. `grep -rIn "from \"" web/src/components/ui/sidebar.tsx` shows imports of `cn`, `react`, `motion/react`, `@tabler/icons-react` only | High | None. This is the only file in `web/src/hooks/`. |
| `web/scripts/pricing.html` (128 KB) | Framer export artifact. `app/pricing/page.tsx` inlines its own `RAW_PRICING_HTML` string instead of reading this file. | `grep -rIn "pricing.html\|scripts/pricing" web/src web/package.json web/next.config.ts *.md` → zero hits | High | None. |
| `web/test-icons.mjs` (321 bytes) | One-off console probe checking that seven `@icons-pack/react-simple-icons` exports resolve. Not in `package.json` scripts. | File read; `grep -n scripts web/package.json` shows `dev`/`build`/`start`/`lint`/`test` only, none referencing it | High | None. |
| `web/scripts/framer-update-logo.mjs` (1.4 KB) | One-off Framer canvas automation via `framer-api`; requires `FRAMER_PROJECT_URL` + `FRAMER_API_KEY`, neither of which is in `.env.example`. Not wired to any npm script. | File read (lines 1-25); it is the sole importer of the `framer-api` and `dotenv` dependencies | Medium | Loses the only code companion to `framer.md`. Keep if the Framer publish flow is still in use. |

Partial dead code (export-level, file stays):

| Symbol | Why unnecessary | Evidence | Confidence | Risk if removed |
|---|---|---|---|---|
| `actionTasks` in `web/src/lib/dashboard/mock-data.ts:278` | Sole remaining unused mock constant. Every other export in the file is live (`getRiskClasses` → `RiskBadge.tsx`, `getDraftStatusClasses` + `getIntegrationStatusClasses` → `StatusBadge.tsx`, and 11 types → `data.ts` and the card components). | `grep -rIn -w actionTasks web/src` → definition only | High | None. Do **not** remove `mock-data.ts` itself. |

---

## 2. Superseded or duplicated code

| File | Why unnecessary | Evidence | Confidence | Risk if removed |
|---|---|---|---|---|
| `web/src/components/DashboardSidebar.tsx` | Superseded by **`web/src/components/app-sidebar.tsx`**, which exports `AppSidebarContainer`. | `app/dashboard/layout.tsx:3` imports `AppSidebarContainer`; it wraps `{children}` at line 27. `DashboardSidebar` has zero importers. | High | None. |
| `web/src/components/AgentChat.tsx` | Superseded by **`web/src/components/agent-feed/agent-pane.tsx`** + `agent-feed.tsx` + `chat-provider.tsx`. Both talk to `/api/agent`; only the newer stack is mounted. | `app/dashboard/inbox/page.tsx:5` imports `AgentPane`; `dashboard/home-agent-panel.tsx:5` imports `AgentFeed`; `chat-provider` has 4 importers | High | None. |
| `web/src/components/dashboard/flows-page.tsx` | Superseded (functionally replaced by nothing) by **`web/src/app/dashboard/flows/page.tsx`**, a deliberate empty placeholder. | Placeholder file read in full: 7 lines, renders an empty centred div | High | The surviving file renders nothing, so this is a regression-in-place rather than a clean replacement. Verify intent before removing. |
| `web/src/components/agent-feed/mock-message.tsx` + `generative-cards.tsx` | Design-time mock pair superseded by **`web/src/components/agent-feed/timeline-nodes.tsx`** (476 lines), which is the live renderer. | `agent-feed.tsx:28` imports from `./timeline-nodes`; `mock-message.tsx:2` also imports from it, confirming `timeline-nodes` is the shared/surviving primitive | High | None. |
| `web/public/logos/stripe (1).svg` | Byte-identical duplicate of **`web/public/logos/stripe.svg`**. Browser-download artifact. | `diff` reports IDENTICAL; both 521 bytes. `grep -rIn "stripe (1)\|stripe%20(1)"` → zero references | High | None. |
| `frontend/1.mov` + `frontend/1.mp4` | Byte-identical duplicates of **`web/public/1.mov`** and **`web/public/1.mp4`**. `frontend/1.mov` is the single largest tracked file at 14,130,678 bytes. | `cmp` reports IDENTICAL for both pairs | High | None — but delete the `frontend/` copies, not the `web/public/` ones. `page.tsx` serves from `/1.mp4` and `/1.mov`. |
| `supabase/migrations/20260422_backend_completeness.sql` | The entire migration is one `CREATE UNIQUE INDEX idx_integration_tokens_unique ON public.integration_tokens (workspace_id, provider, token_type)` — the same table and same column tuple already covered by `idx_integration_tokens_workspace_provider_type_unique`, created in **`supabase/migrations/20260407_backend_reliability.sql:21`**. Two identical unique indexes now exist under different names. | Both statements read in full; columns match exactly | High | **Do not delete the migration file** if it has been applied — that breaks migration history. The redundant *index* can be dropped in a new forward migration. |
| `supabase/migrations/20260408_expand_integration_catalog.sql` | Provably superseded by **`supabase/migrations/20260422_fix_integration_provider_constraints.sql`**: both drop and re-add `integration_connections_provider_check`, and the later constraint is a strict superset (adds `airtable`, `notion`, `supabase`, `google_docs`, `google_drive`, `github`). | Both files read in full; provider lists compared | High | Same caveat: keep the file for history. Noted here so nobody edits the obsolete constraint by mistake. |

---

## 3. Scratch and experimental directories

**The shipped Next.js app does not depend on any of these.** `web/tsconfig.json` sets `include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]` rooted at `web/`, so nothing outside `web/` is compiled. `grep -rIn "frontend/\|landing.css\|landing_page_ast\|LandingPage" web/src web/scripts web/next.config.ts web/package.json web/vercel.json` returns exactly one hit — `web/src/app/page.tsx:8`, which is a locally-declared `export default function LandingPage()`, not an import.

| File | Why unnecessary | Evidence | Confidence | Risk if removed |
|---|---|---|---|---|
| `frontend/1.mov` (14,130,678 B) | Duplicate of `web/public/1.mov`; largest tracked file in the repo. | `cmp` IDENTICAL | High | None. |
| `frontend/1.mp4` (3,058,814 B) | Duplicate of `web/public/1.mp4`. Gitignored by root `.gitignore:45`, so local-disk only. | `cmp` IDENTICAL | High | None. |
| `frontend/landing_page_ast.json` (518,124 B) | Framer AST dump. Zero importers. | Reference grep above | High | None. |
| `frontend/index.html` (327,454 B) | Raw Framer export. Superseded by the `RAW_LANDING_HTML` string inlined in `web/src/app/page.tsx`. | Reference grep above; `page.tsx:5` holds the inlined copy | High | Loses the only readable copy of the export — the shipped version is a single escaped string literal. |
| `frontend/landing.css` (184,961 B) | Framer stylesheet. Not imported; `web/src/app/globals.css` (206 KB) is the live stylesheet, pulled in only by `layout.tsx:3`. | `grep -rIn "globals.css" web/src` → `layout.tsx:3` only | High | None. |
| `frontend/LandingPage.tsx` (154,585 B) | Framer-generated component. Zero importers. | Reference grep above | High | None. |
| `frontend/tsconfig.json` | Standalone config whose `paths` reach sideways into `../web/node_modules/react`. Exists only to type-check `LandingPage.tsx`. | File read in full | High | None. |
| `scratch_playwright/record.js`, `record2.js` | Playwright hover-animation recorders pointed at third-party Framer demo sites (`premiumanimatedbutton.framer.website`). Unrelated to Allel. `record2.js` is a near-copy of `record.js` differing only in selector, scroll, and timeout — `diff` shows 6 changed hunks. | Both files read; `diff` run | High | None. |
| `scratch_playwright/package.json`, `package-lock.json` | Second, isolated npm project (`playwright ^1.61.1`) unrelated to `web/`. | File read | High | None. |
| `scratch_playwright/node_modules/` (17 MB) | Installed dependency tree. Correctly gitignored (root `.gitignore:41`), present on local disk only. | `du -sh`, `git check-ignore` | High | None. |
| `scratch_playwright/videos/page@bb9372639ad53b28a18085c2ce56ca0e.webm` (161 KB) | Recording output. Gitignored (root `.gitignore:40`, `.gitignore:44`). Local only. | `git check-ignore -v` confirms both rules match | High | None. |

---

## 4. Unused public assets

`grep` of each basename across `web/src`, `frontend/`, and `web/scripts`. Cross-checked against the complete set of asset paths the code actually requests: `grep -rIhoE "/[A-Za-z0-9_ ()-]+\.(png|jpg|jpeg|mp4|mov|svg|webp|ico)" web/src frontend web/scripts` yields only `/1.mov`, `/1.mp4`, `/user-avatar.svg`, the 12 `/logos/*.svg` names, and Framer-CDN hashes such as `/XO8Prz3joYUDWRS6rjeeroN0k8.png` that resolve remotely, not from `public/`.

| File | Why unnecessary | Evidence | Confidence | Risk if removed |
|---|---|---|---|---|
| `web/public/image1.png` | 21,383,137 B, zero references. Largest file in `web/public/`. | basename grep → 0 hits | High | None. |
| `web/public/1.png` | 8,704,357 B. Referenced only by `frontend/index.html`, itself a dead scratch file (§3). | basename grep → 1 hit, in `frontend/index.html` | High | None once `frontend/` goes. |
| `web/public/ascii-magic-2.png` | 4,709,988 B, zero references. | basename grep → 0 hits | High | None. |
| `web/public/sarah.png` | 2,234,496 B, zero references. Persona images are not rendered anywhere — `personas.ts` carries only `id`, prompts, and tool lists, no avatar paths. | basename grep → 0 hits; `grep -rIn "alex\|henry\|sarah" web/src/lib/agent/personas.ts` shows only IDs and instruction imports | High | None. |
| `web/public/henry.png` | 2,162,951 B, zero references. | as above | High | None. |
| `web/public/alex.png` | 2,097,559 B, zero references. | as above | High | None. |
| `web/public/3.png` | 1,992,538 B, zero references. | basename grep → 0 hits | High | None. |
| `web/public/2.jpg` | 1,654,897 B, zero references. | basename grep → 0 hits | High | None. |
| `web/public/hero-bg.png` | 1,093,001 B, zero references. Landing hero is Framer-rendered from CDN assets. | basename grep → 0 hits | High | None. |
| `web/public/hero_landscape.png` | 1,055,040 B, zero references. | basename grep → 0 hits | High | None. |
| `web/public/6k.png` | 191,839 B, zero references. | basename grep → 0 hits | High | None. |
| `web/public/sarah_perfect.png` | 67,441 B, zero references. | basename grep → 0 hits | High | None. |
| `web/public/henry_perfect.png` | 45,912 B, zero references. | basename grep → 0 hits | High | None. |
| `web/public/sarah_clean.png` | 42,792 B, zero references. | basename grep → 0 hits | High | None. |
| `web/public/alex_perfect.png` | 40,000 B, zero references. | basename grep → 0 hits | High | None. |
| `web/public/henry_clean.png` | 38,295 B, zero references. | basename grep → 0 hits | High | None. |
| `web/public/alex_clean.png` | 33,107 B, zero references. | basename grep → 0 hits | High | None. |
| `web/public/sarah_thumb.png` | 21,835 B, zero references. | basename grep → 0 hits | High | None. |
| `web/public/henry_thumb.png` | 15,292 B, zero references. | basename grep → 0 hits | High | None. |
| `web/public/alex_thumb.png` | 14,642 B, zero references. | basename grep → 0 hits | High | None. |
| `web/public/next.svg` | 1,375 B. `create-next-app` boilerplate. | basename grep → 0 hits | High | None. |
| `web/public/globe.svg` | 1,035 B. Boilerplate. | basename grep → 0 hits | High | None. |
| `web/public/logos/stripe (1).svg` | 521 B, byte-identical to `stripe.svg`. See §2. | `diff` IDENTICAL | High | None. |
| `web/public/file.svg` | 391 B. Boilerplate. | basename grep → 0 hits | High | None. |
| `web/public/window.svg` | 385 B. Boilerplate. | basename grep → 0 hits | High | None. |
| `web/public/vercel.svg` | 128 B. Boilerplate. | basename grep → 0 hits | High | None. |
| `web/public/ascii-animation.mp4` | 12,906,108 B, zero references. Local disk only — gitignored by root `.gitignore:45` (`*.mp4`). | basename grep → 0 hits; `git ls-files web/public` does not list it | High | None. |

**Unreferenced total: ~62 MB** across the 20 tracked entries above (excluding the gitignored `ascii-animation.mp4`).

Referenced and safe: `web/public/1.mov`, `web/public/1.mp4`, `web/public/user-avatar.svg` (63,824 B — `agent-feed.tsx:30` region), and the 12 real `logos/*.svg` files consumed by `settings/page.tsx`, `agent-feed.tsx`, `timeline-nodes.tsx`, `DirectConnectModal.tsx`, and `allel-instructions.ts`.

---

## 5. Stale or contradictory documentation

| File | Why unnecessary | Evidence | Confidence | Risk if removed |
|---|---|---|---|---|
| `ARCHITECTURE.md` (332 lines) | Every "Core files" path is absolute and points at a directory that no longer exists: `/Users/kushagrasingh/dev/agenticworkflow/...`. The repo is at `/Users/kushagrasingh/dev/allel/`. **28 occurrences.** Its "Primary operating tables" list also omits five tables that migrations do create: `churn_scores`, `churn_score_factors`, `draft_outcomes`, `score_snapshots`, `tool_approval_requests`. | `grep -c agenticworkflow ARCHITECTURE.md` → 28. Per-table grep: each is 0 hits in the doc, 1 migration file each | High | Rewrite rather than delete — it is the only whole-system layer map. |
| `AGENT.md` (212 lines) | Three verifiable errors. (a) Names `web/src/lib/agent/alex-instructions.ts` as a live file; it does not exist — the file is `allel-instructions.ts`, exporting `COFOUNDER_INSTRUCTIONS`. (b) Claims "`/dashboard/flows` run history screen backed by `/api/agent/runs`" is live; the page renders an empty div. (c) 18 stale `agenticworkflow` paths. Its "Live entry points" list also omits `/api/agent/approvals`, `/api/agent/history`, `/api/brief/refresh`, `/api/drafts/[id]/approve`, `/api/drafts/[id]/send`, `/api/metrics/revenue-saved`, and `/api/waitlist`, all of which exist. | `ls web/src/lib/agent/*instructions*` → `allel-`, `henry-`, `sarah-`, `instructions.ts`. `app/dashboard/flows/page.tsx` read in full. `grep -c agenticworkflow AGENT.md` → 18 | High | Rewrite. Section 5 (workflow stage decomposition) and the tool-family list still match `workflows.ts` and `tools.ts`. |
| `FRONTEND.md` (132 lines) | Section 5 "Run history surface" claims `/dashboard/flows` renders workflow history via `components/dashboard/flows-page.tsx`. Both halves are false: the route is empty and `flows-page.tsx` has zero importers. Section 1 lists `app/dashboard/page.tsx` as using `workspace-layout.tsx`; that page imports `HomeAgentPanel`, and `WorkspaceLayout` is used only by `inbox/page.tsx`. 11 stale `agenticworkflow` paths. | `app/dashboard/page.tsx` read in full (imports `ChatProvider` + `HomeAgentPanel`). `grep -rIn "workspace-layout\|WorkspaceLayout" web/src` → `inbox/page.tsx:4`, `pinned-todo-panel.tsx:5`, one comment. `grep -c agenticworkflow FRONTEND.md` → 11 | High | Rewrite. This is the doc most likely to mislead. |
| `TODO.md` (416 lines) | Line 13 states the stack is "**Tailwind-free vanilla CSS**". The project uses Tailwind 4: `postcss.config.mjs` loads `@tailwindcss/postcss`, `package.json` declares `tailwindcss ^4`, `tailwind-merge ^3.5.0`, `tw-animate-css ^1.4.0`, and `globals.css:46` does `@import "tw-animate-css"`. Directly contradicted by `REPOSITORY_RESEARCH.md:57` ("Tailwind CSS 4") and `ALLEL_COMPLETE_GUIDE.md:66,226`. Header says "Last updated: 2026-07-08". | All four files read; `grep -n "Tailwind" TODO.md ALLEL_COMPLETE_GUIDE.md REPOSITORY_RESEARCH.md` | High | Fix line 13. The rest is a live roadmap, not stale. |
| `ALLEL_COMPLETE_GUIDE.md` (282 lines) | States "React 18" at lines 66 and 226; `web/package.json:36-37` pins `react` and `react-dom` to `19.1.0`. Line 210 attributes observability to "`src/lib/agent/run-logger.ts` & `/dashboard/flows`" — the former is live (12 importers), the latter is an empty page. Also the only root doc with no git history at all, so it has never been reviewed against a commit. | `grep -n "React 18" ALLEL_COMPLETE_GUIDE.md`; `grep -n react web/package.json`; `git log -1 -- ALLEL_COMPLETE_GUIDE.md` → empty | High | Fix the version and the flows claim. Otherwise the most accurate of the architecture docs. |
| `REPOSITORY_RESEARCH.md` (771 lines) | Line 187 asserts "current model resolution always returns `gpt-4o-mini`. The configured chat/automation model constants are presently ineffective." `lib/ai/ai.ts:13` and `:16` both default to `'gpt-4o'`; `gpt-4o-mini` appears in `web/src` only as a pricing-table prefix at `agent.ts:201`. | `grep -rIn "gpt-4o-mini" web/src` → `agent.ts:201`, `agent.test.ts:18`; `grep -n "MODEL_ID" web/src/lib/ai/ai.ts` | High | Correct line 187. The remaining findings (tenant authorization, approval integrity, webhook recovery) were not re-verified in this audit and may still hold. |
| `chat.md` (121 lines) | 6 stale `agenticworkflow` paths. Overlaps `AGENT.md` §2-3 and `ARCHITECTURE.md` §6 on chat trust boundaries and memory compaction, with no unique claims found. | `grep -c agenticworkflow chat.md` → 6; content compared against `AGENT.md` sections 2 and 3 | Medium | Low. Likely foldable into `AGENT.md`. |
| `web/README.md` (80 lines) | 6 stale `agenticworkflow` paths. Lists "flows" among "Main Product Surfaces". | `grep -c agenticworkflow web/README.md` → 6 | Medium | Fix paths; this is the entry-point doc for the app directory. |
| `cover_letters.md` (79 lines) | Job-application cover letters for Toloka AI / Mindrift. No relationship to the product or codebase. Untracked by git (no commit history). | File read; `git log -1 -- cover_letters.md` → empty | High | None to the codebase. Personal document — confirm with the author. |
| `goal.md` (231 lines) | Internship-application plan with a hard deadline of "September 5, 2026" and "Days remaining: 16". Time-expired framing. No commit history. | File read; `git log -1 -- goal.md` → empty | Medium | None to the codebase. Personal planning document. |
| `NAMES.md` (147 lines) | Brand-name brainstorm vault ("100+ high-tier startup names"). The product is already named Allel and shipping at `allel.co` per `framer.md`. Decision closed. | File read; `framer.md` line 3 references the live domain | Medium | None. |
| `INTEGRATION_AUDIT.md` (213 lines) | Header reads "Status: In progress — findings are added after each verified layer." Started 2026-08-06, never closed out. | File read | Low | Do not remove — the three-architecture classification (synced / tool-only / planned) still matches `lib/integrations/catalog.ts`. |
| `ALLEL.md`, `PRODUCT_COMPLETION_PLAN.md`, `framer.md` | Checked for staleness; no contradiction against current code found. `framer.md` documents the `framer-api` flow that `web/scripts/framer-update-logo.mjs` implements. | `grep -c agenticworkflow` → 0 for all three | — | Keep. |

Cross-doc contradiction summary — these three pairs disagree with each other, not just with the code:

1. **CSS framework.** `TODO.md:13` "Tailwind-free vanilla CSS" vs. `REPOSITORY_RESEARCH.md:57` "Tailwind CSS 4" vs. `ALLEL_COMPLETE_GUIDE.md:66,226` "Tailwind CSS". The code sides with the latter two.
2. **React version.** `ALLEL_COMPLETE_GUIDE.md:66,226` "React 18" vs. `web/package.json` `19.1.0`.
3. **`/dashboard/flows` status.** `AGENT.md`, `FRONTEND.md` §5, and `ALLEL_COMPLETE_GUIDE.md:210` all describe it as a working run-history surface. The route is an empty div and the 782-line implementation is unimported.

---

## 6. Test files worth questioning

**Recommendation: keep all 15.** `npm test` in `web/` reported `# tests 76 / # pass 76 / # fail 0` in 1.3 s. Every test file imports a module that exists and is live in production paths. Nothing here is dead.

| File | Why questioned | Evidence | Confidence | Risk if removed |
|---|---|---|---|---|
| `web/src/components/agent-feed/chat-storage.test.ts` (137 lines) | Mild scope overlap: it tests `sanitizeStoredPersonaMessages` (client storage) while `web/src/lib/agent/ui-message-utils.test.ts` tests `sanitizeClientUiMessages` (server intake). Both cover "drop untrusted assistant history". | Both files read. The functions are genuinely different — `chat-storage.ts:5-9` imports four distinct helpers from `lib/agent/chat-session`, and the storage-key/chat-id scoping tests have no counterpart elsewhere | Low | Real coverage loss. Storage-key scoping by user and workspace is tested nowhere else. **Keep.** |
| `web/src/lib/agent/agent.test.ts` (243 lines) | Mixes `import` and `require()` (lines 136, 158, 178, 188, 207, 219) in the same TS file, and several test names are spec-task labels ("Task 2.3:", "Task 9:") rather than behaviour descriptions. Cosmetic only. | File read; all 76 tests pass under `tsx --test` | Low | Real coverage loss — this is the only test for persona tool filtering, cost estimation, and error sanitisation. **Keep.** |

No test file references a deleted module. No test asserts behaviour the code no longer has. No two test files duplicate each other.

---

## 7. Unused vendored UI primitives

**Vendored UI primitives, unused but cheap to keep.** `components/ui/` holds 21 files. Only 4 are reachable from an app entry point. The remaining 17 form a closed island: `grep -rIn "@/components/ui/" web/src | grep -v "^web/src/components/ui/"` returns exactly 4 lines — `layout.tsx:5` → `tooltip`, `agent-feed.tsx:29` → `dotm-square-12`, `agent-pane.tsx:14` → `animated-ai-input`, `left-pane.tsx:7` → `theme-toggle`.

The internal graph is `command → {dialog, input-group}`, `input-group → {button, input, textarea}`, `dialog → button`, `sheet → button`. Because `command` and `sheet` have no external importers, everything downstream of them is unreachable too.

Standard shadcn / Base UI / Radix surface — low priority, zero runtime cost, restorable via the CLI:

| File | Why unnecessary | Evidence | Confidence | Risk if removed |
|---|---|---|---|---|
| `ui/dropdown-menu.tsx` (200) | No importers. Sole consumer of `@radix-ui/react-dropdown-menu`. | External-import grep above | High | Would make that dependency removable. |
| `ui/command.tsx` (196) | No importers. Root of the dead `command → dialog → button` chain. Sole consumer of `cmdk`. | External-import grep above | High | Removing it orphans `dialog`, `input-group`, `input`, `textarea`, `button`. |
| `ui/sidebar.tsx` (190) | No importers. Bespoke `motion/react` + Tabler sidebar, not shadcn's. Superseded by `app-sidebar.tsx`. | External-import grep; `app/dashboard/layout.tsx:3` | High | None. |
| `ui/dialog.tsx` (160) | Only importer is `command.tsx:13`, itself dead. | Internal-import grep | High | None. |
| `ui/input-group.tsx` (158) | Only importer is `command.tsx:17`, itself dead. | Internal-import grep | High | Orphans `input` and `textarea`. |
| `ui/sheet.tsx` (138) | No importers. | External-import grep | High | None. |
| `ui/avatar.tsx` (109) | No importers. | External-import grep | High | None. |
| `ui/button.tsx` (56) | Imported only by `input-group.tsx:7`, `sheet.tsx:7`, `dialog.tsx:7` — all three dead. | Internal-import grep | High | Highest-value primitive to keep; almost any new UI work will want it. |
| `ui/badge.tsx` (52) | No importers. | External-import grep | High | None. |
| `ui/separator.tsx` (25) | No importers. | External-import grep | High | None. |
| `ui/collapsible.tsx` (21) | No importers. The one apparent hit, `timeline-nodes.tsx:100`, is the word "Collapsible" inside a JSX comment. | `grep -rIn -w Collapsible web/src` | High | None. |
| `ui/input.tsx` (20) | Imported only by `input-group.tsx:8`. | Internal-import grep | High | None. |
| `ui/textarea.tsx` (18) | Imported only by `input-group.tsx:9`. | Internal-import grep | High | None. |
| `ui/skeleton.tsx` (13) | No importers. | External-import grep | High | None. |

Bespoke unused components in `ui/` — not vendored, so closer to genuine dead code:

| File | Why unnecessary | Evidence | Confidence | Risk if removed |
|---|---|---|---|---|
| `ui/feature-tools-card.tsx` (308) | Landing-page marketing component. No importers. | `grep -rIn -w FeatureToolsCard web/src` → definition (line 68) and default export (line 308) only | High | None. |
| `ui/animated-3d-button.tsx` (186) | Landing-page button experiment. No importers. | `grep -rIn -w Animated3DButton web/src` → lines 55 and 186 only | High | None. |
| `ui/doss-hero-wireframe.tsx` (67) | Hero wireframe experiment. No importers. | `grep -rIn -w DossHeroWireframe web/src` → lines 25 and 67 only | High | None. |

---

## 8. Repository hygiene

| File | Why unnecessary | Evidence | Confidence | Risk if removed |
|---|---|---|---|---|
| `web/.env.example` — **not reaching clones** | The file exists on disk but is **not tracked by git**: `web/.gitignore:34` is `.env*`, which matches `.env.example` too. A fresh clone gets no example env file. It is also missing 9 variables the code reads: `AGENT_HISTORY_SIGNING_SECRET` (this one gates trusted assistant history in `ui-message-utils.ts`), `POSTHOG_WEBHOOK_SECRET`, `OPENAI_MODEL_ID`, `AGENT_MODEL_ID`, `AGENT_CHAT_MODEL_ID`, `AGENT_AUTOMATION_MODEL_ID`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`/`BASE_URL`, `RESEND_FROM_EMAIL`. Conversely it documents 4 keys no code reads: `PIPEDREAM_CLIENT_ID`, `PIPEDREAM_CLIENT_SECRET`, `PIPEDREAM_ENVIRONMENT`, `PIPEDREAM_PROJECT_ID`. | `git ls-files --error-unmatch web/.env.example` → NOT TRACKED; `git check-ignore -v` → `web/.gitignore:34:.env*`. Env sets compared via `grep -oE "^[A-Z_0-9]+" web/.env.example` vs `grep -rIhoE "process\.env\.[A-Z_0-9]+" web/src web/scripts` | High | Fix, don't remove. Needs a `!.env.example` negation in `web/.gitignore` plus the missing keys. |
| `web/public/1.mp4` — **needed but gitignored** | `web/src/app/page.tsx` serves `<source src="/1.mp4" type="video/mp4">` with `<source src="/1.mov" type="video/quicktime">` as fallback. Root `.gitignore:45` (`*.mp4`) excludes `1.mp4` from the repo, so `git ls-files web/public` lists only `1.mov`. A clean clone or CI build has just the QuickTime source, which Chrome and Firefox will not decode. | `git check-ignore -v web/public/1.mp4` → `.gitignore:45:*.mp4`; `git ls-files web/public/ \| grep -E "mp4\|mov"` → `web/public/1.mov` only; `<video>` element read out of `page.tsx` | High | Not a removal — a build-correctness bug. Either negate `!web/public/1.mp4` or move the asset to a CDN. |
| `web/.env.local` (2,640 B) | Real local secrets file. **Correctly ignored** — `git check-ignore` matches `web/.gitignore:34`. Not tracked, so this is not a git secret-exposure incident. Contents were not read or echoed. | `git ls-files --error-unmatch web/.env.local` → pathspec not known to git | High | Leave it alone. |
| `web/tsconfig.tsbuildinfo` (918,245 B) | TypeScript incremental build cache. Gitignored (`web/.gitignore:38`, root `.gitignore:34`). Local disk only. | `stat`, `.gitignore` read | High | Regenerates on next `tsc`. |
| `.DS_Store` × 4 — `./` (10,244 B), `web/` (8,196 B), `supabase/` (6,148 B), `scratch_playwright/` (6,148 B) | macOS Finder metadata. All ignored by root `.gitignore:31` and `web/.gitignore:22`, none tracked. Local clutter only. | `find . -name .DS_Store`; `git ls-files \| grep DS_Store` → empty | High | None. |
| `scratch_playwright/package-lock.json` (1,710 B) | Second lockfile for the isolated scratch project. Not a duplication of `web/package-lock.json` (478,523 B) — different dependency sets, no overlap. Goes away with `scratch_playwright/` (§3). | Both files read | High | None. |
| `@pipedream/sdk` in `web/package.json:16` | Declared dependency, never imported. Pipedream appears in the codebase only as `metadata.pipedream_account_id` string handling in `provider-tokens.ts` and two test fixtures — no SDK calls. | `grep -rIn "@pipedream/sdk" web/src web/scripts` → 0 hits | High | Confirm the Pipedream OAuth path is fully server-side first; `INTEGRATION_AUDIT.md` and `FRONTEND.md` both describe a "Pipedream-backed OAuth path". |
| `@tavily/ai-sdk` in `web/package.json:22` | Declared but unused. The live code uses `@tavily/core`: `web-research.ts:10` does `import { tavily } from '@tavily/core'`. | `grep -rIn "@tavily" web/src` → `web-research.ts:10` only | High | None. |
| `shadcn` in `web/package.json:39` | The shadcn CLI declared as a runtime `dependency`, not a devDependency. Never imported. It ships into the production bundle install for no benefit. | `grep -rIn "shadcn" web/src web/scripts` → 0 hits | Medium | Move to `devDependencies` rather than removing, if the CLI is still used to add components. |
| No committed `node_modules` | Checked and clean. Both trees are gitignored and `git ls-files scratch_playwright` returns only the 4 source files. | `git ls-files \| grep node_modules` → empty | High | — |

---

## Do not remove

Files I suspected during the audit and then cleared, each with the reference that cleared it.

Next.js framework convention files (loaded by the framework, never imported — 17 `route.ts`, 9 `page.tsx`, 2 `layout.tsx`, 1 `middleware.ts`):

| File | Cleared by |
|---|---|
| `web/src/middleware.ts` | Next.js root middleware convention. Read in full: calls `updateSession` and exports a `config.matcher`. |
| `web/src/lib/supabase/middleware.ts` | `web/src/middleware.ts:2` — `import { updateSession } from '@/lib/supabase/middleware'`. |
| `web/src/app/dashboard/flows/page.tsx` | App Router route file. Empty by design, but the framework mounts it. |
| `web/src/app/globals.css` (206 KB) | `web/src/app/layout.tsx:3` — `import "./globals.css"`. Guarded convention. |
| `web/next-env.d.ts` | Generated ambient declaration; listed first in `tsconfig.json` `include`. |
| `web/src/app/favicon.ico` | App Router `icon` convention. |
| all 17 `web/src/app/api/**/route.ts` | Route handler convention. `/api/agent/approvals`, `/api/agent/history`, and `/api/metrics/revenue-saved` are live despite being absent from `AGENT.md`. |

Modules reached only through dynamic `await import(...)`:

| File | Cleared by |
|---|---|
| `web/src/lib/ai/draft-generator.ts` | `lib/agent/tools.ts:743` — `const { generateDraft } = await import('@/lib/ai/draft-generator')`. |
| `web/src/lib/integrations/gmail.ts` | `tools.ts:2127`, `:2170`, `:2218` and `settings/actions.ts:815`, all `await import('@/lib/integrations/gmail')`, plus 5 static imports. |
| `web/src/lib/integrations/connection-guard.ts` | `tools.ts:2036` — `await import('@/lib/integrations/connection-guard')`, plus 4 static imports. |
| `web/src/lib/ai/prompts.ts` | `draft-generator.ts:9` — `import { buildDraftPrompt } from './prompts'`. Stays live even if `risk-explainer.ts` goes. |

Modules whose only importers are themselves live:

| File | Cleared by |
|---|---|
| `web/src/lib/dashboard/mock-data.ts` | 8 live importers of its *types* and class helpers, e.g. `RiskBadge.tsx:1`, `StatusBadge.tsx:2-3`, `AccountRow.tsx:2`, `DraftCard.tsx:4`, and `lib/dashboard/data.ts:16`. Only the `actionTasks` constant is dead. |
| `web/src/lib/agent/instructions.ts` (52 KB) | `agent.ts:13` imports `AGENT_INSTRUCTIONS`, composed at `agent.ts:1084-1085`. Not redundant with the persona files — it is the shared base prompt they suffix. |
| `web/src/lib/agent/allel-instructions.ts` | `personas.ts:19` → `COFOUNDER_INSTRUCTIONS`, wired at `personas.ts:55`. |
| `web/src/lib/agent/henry-instructions.ts` | `personas.ts:20`, wired at `personas.ts:69`. |
| `web/src/lib/agent/sarah-instructions.ts` | `personas.ts:21`, wired at `personas.ts:122`. |
| `web/src/components/agent-feed/timeline-nodes.tsx` | `agent-feed.tsx:28`. The live renderer, not part of the mock pair. |
| `web/src/components/agent-feed/pinned-todo-panel.tsx` | Imports `useWorkspace` from `workspace-layout` at line 5 and is itself imported by a live pane. |
| `web/src/components/dashboard/workspace-layout.tsx` | `app/dashboard/inbox/page.tsx:4`. |
| `web/src/components/dashboard/home-agent-panel.tsx` | `app/dashboard/page.tsx:4`, rendered at line 29. |
| `web/src/components/dashboard/left-pane.tsx` | `app/dashboard/inbox/page.tsx:6`. |
| `web/src/components/app-sidebar.tsx` | `app/dashboard/layout.tsx:3`, wraps children at line 27. |
| `web/src/components/agent-feed/agent-pane.tsx` | `app/dashboard/inbox/page.tsx:5`. |
| `web/src/components/agent-feed/agent-feed.tsx` | `agent-pane.tsx:13` and `home-agent-panel.tsx:5`. |
| `web/src/components/agent-feed/chat-provider.tsx` | 4 importers including `app/dashboard/page.tsx:3`. |
| `web/src/components/agent-feed/tasks-dropdown.tsx` | Imported by a live pane; `grep` shows one `@/components/agent-feed/tasks-dropdown` import. |
| `web/src/components/theme-provider.tsx` | `app/layout.tsx:6` — `import { ThemeProvider }`. |
| `web/src/components/DirectConnectModal.tsx` | `app/dashboard/settings/page.tsx:31`, rendered at line 285. |
| `web/src/components/AccountRow.tsx`, `DraftCard.tsx`, `RiskBadge.tsx`, `StatusBadge.tsx`, `EvidencePill.tsx` | Chain from live pages: `accounts/page.tsx` → `AccountRow` → `RiskBadge`; `drafts/page.tsx` → `DraftCard` → `StatusBadge`. `EvidencePill` is reached only via `BriefCard.tsx:3` — it becomes orphaned if `BriefCard` is removed. |
| `web/src/lib/emoji-palette.ts` | `agent-feed.tsx:30` (`USER_EMOJI_PALETTE`) and `ui/animated-ai-input.tsx:7` (`EMOJI_LIST`), both live. |
| `web/src/lib/drafts/send-draft.ts` | `draft-workflows.ts:10`. |
| `web/src/lib/drafts/outcome-tracker.ts` | `api/metrics/revenue-saved/route.ts`, `api/cron/daily-run/route.ts`, `send-draft.ts`. |
| `web/src/lib/engine/action-selector.ts` | `gmail-sync.ts:3` — `import { selectAction }`. |
| `web/src/lib/engine/score-engine.ts` | 4 importers, plus `score-history.ts:14` type import. Live independently of the dead history/compound pair. |
| `web/src/lib/agent/approval-store.ts` | `api/agent/approvals/route.ts` and `agent.ts:28`. Backs the `tool_approval_requests` table. |
| `web/src/lib/agent/error-classifier.ts` | `api/agent/route.ts`. |
| `web/src/lib/agent/run-inspection.ts` | `api/agent/runs/route.ts` and `api/agent/runs/[workflowId]/route.ts`. |
| `web/src/lib/agent/external-content.ts` | `tools.ts:25` and `web-research.ts`. |
| `web/src/lib/agent/runtime-context.ts` | `api/agent/route.ts` and `agent.ts:17`. |
| `web/src/lib/integrations/web-research.ts` | `agent.ts:182`. |
| `web/src/lib/notifications/notify-founder.ts` | `api/webhooks/posthog/route.ts` and `api/webhooks/stripe/route.ts`. |
| `web/src/lib/briefs/deliver-brief-email.ts` | `api/brief/refresh/route.ts` and `api/cron/daily-run/route.ts`. |
| `web/src/lib/integrations/gmail-bootstrap.ts` | `gmail-sync.ts:16`. |
| all 8 `web/src/lib/integrations/*-sync.ts` | Each has 2+ importers via `connection-state.ts:9-16`, `api/cron/daily-run/route.ts:32-39`, and `tools.ts:31-38`. |
| `web/src/components/ui/tooltip.tsx`, `dotm-square-12.tsx`, `animated-ai-input.tsx`, `theme-toggle.tsx` | The only 4 reachable files in `components/ui/`: `layout.tsx:5`, `agent-feed.tsx:29`, `agent-pane.tsx:14`, `left-pane.tsx:7`. |

Config, migrations, and assets:

| File | Cleared by |
|---|---|
| `web/next.config.ts` | Read in full: sets `outputFileTracingRoot`, Turbopack root, and 6 security headers including HSTS and `Cross-Origin-Opener-Policy: same-origin-allow-popups` for the Pipedream OAuth popup. |
| `web/eslint.config.mjs` | Read in full; backs `npm run lint`. |
| `web/postcss.config.mjs` | Read in full; loads `@tailwindcss/postcss`, which the entire Tailwind pipeline depends on. |
| `web/components.json` | shadcn CLI config; `aliases` match the real `tsconfig.json` `paths` mapping of `@/*` → `./src/*`. |
| `web/tsconfig.json` | Read in full; `paths` back every `@/` import in the codebase. |
| `web/.npmrc` | Single line `legacy-peer-deps=true`. Removing it will likely break `npm install` given React 19 with mixed Radix and Base UI peers. |
| `web/vercel.json` | Read in full: declares the `30 4 * * *` cron that invokes `/api/cron/daily-run`. Production scheduling depends on it. |
| 14 of 16 `supabase/migrations/*.sql` | Applied against the database. Only `20260422_backend_completeness.sql` and `20260408_expand_integration_catalog.sql` were flagged (§2), and both should be *kept as files* — the redundancy should be resolved in a new forward migration. |
| `web/public/1.mov`, `web/public/1.mp4` | `page.tsx` `<video>` sources `/1.mp4` and `/1.mov`. See §8 for the gitignore issue on the `.mp4`. |
| `web/public/user-avatar.svg` (63,824 B) | Referenced by `agent-feed.tsx`. |
| `web/public/logos/{airtable,gmail,google-calendar,hubspot,intercom,linear,linkedin,notion,posthog,sentry-light,slack,stripe,supabase}.svg` | 2-7 importers each across `settings/page.tsx`, `agent-feed.tsx`, `timeline-nodes.tsx`, `generative-cards.tsx`, `DirectConnectModal.tsx`, `api/agent/route.ts`, and `allel-instructions.ts`. Only the duplicate `stripe (1).svg` is dead. |
| all 15 `web/src/**/*.test.ts` | `npm test` → 76 tests, 76 passing. |
