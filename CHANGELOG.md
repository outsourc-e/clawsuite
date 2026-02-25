# Changelog

## v3.0.0 — Mission Control (2026-02-25)

This is a major release. ClawSuite v3.0 transforms from a dashboard + chat tool into a full multi-agent mission control platform. 227 commits since v2.2.0.

---

### 🤖 Agent Hub — Mission Control (New)

The flagship feature of v3.0. A complete multi-agent orchestration system built from scratch.

- **Mission lifecycle** — Spawn, pause, resume, abort multi-agent missions from a single control panel
- **New Mission Wizard** — Multi-step wizard: set goal, pick team, configure budget and process type, launch
- **Quick Launch Bar** — Type a goal and hit Launch directly from the Overview — no tab switching required
- **Mission reports** — Auto-generated after each mission: goal, agent outputs, task completion rate, token count, cost estimate, artifacts
- **Mission history** — Clickable mission log with full report viewer
- **Warden controls** — Per-agent pause/resume/steer from the Live Activity panel
- **Real-time task board** — Kanban-style task view with live agent status per task
- **Agent output streaming** — Terminal-style live output panel per agent: dark background, monospace, timestamps, per-agent tabs
- **Mission completion flow** — Automatic report generation on completion, status transitions, and elapsed time tracking
- **Exec approval prompts** — When the gateway triggers an exec approval event, ClawSuite surfaces a modal for human approve/deny — human-in-the-loop for sensitive commands
- **@mention autocomplete in wizard** — Type `@agentname` in the mission goal field for cursor-tracked agent autocomplete with arrow key navigation
- **Checkpoint restore** — Saves mission state so you can restore and re-launch from where you left off
- **Mission maximize panel** — Full-screen mission detail view: steer, pause, view output, all from one modal
- **Drag-and-drop kanban** — Task board with drag-and-drop columns and list/kanban toggle view
- **Rich report modal** — Completion reports with markdown rendering, artifact list, and download button
- **History tab overhaul** — Filters by status, redesigned mission cards, "View Report" wired to report modal
- **Soft pause** — Steer-based pause/resume replaces broken gateway RPC for reliable agent pausing
- **Desktop output panel** — Slides in from the right when an agent is selected; persists output history on close/reopen
- **Kill agent + retry spawn** — Kill a running agent or retry a failed spawn directly from the mission view
- **Archive missions** — Archive completed missions from the review view to keep history clean
- **Re-run missions** — Re-run button on completed missions reopens wizard with pre-filled goal
- **Error boundary** — `AgentHubErrorBoundary` wraps the entire hub to prevent render crashes from breaking the app
- **External sub-agents** — Chat sub-agents from other sessions appear in the office view
- **PC1 model presets** — Distilled model presets (pc1-planner, pc1-coder, pc1-critic) + loop team template built in

---

### 🏢 ClawSuite Office — Isometric View (New)

A visual representation of your agent team in real time.

- **Isometric pixel office** — Agents move between desks and social spots based on their status (active, idle, paused)
- **Live status indicators** — Color-coded per agent: green (active/working), amber (idle), blue (paused), red (error)
- **3 layout templates** — Grid, Roundtable, War Room — saved to localStorage
- **Remote sessions** — Connected remote agents show in the office alongside local ones
- **Mobile fallback** — On mobile, the office switches to a compact card list view with status badges

---

### 💬 Chat — Live Token Streaming (Upgraded)

- **Real-time SSE streaming** — Tokens stream to the chat bubble as they arrive — no waiting for full response
- **Telegram-style animation** — Bouncing dots while thinking, pulsing cursor during stream, smooth text transition
- **Immediate processing indicator** — Shows elapsed timer from the moment you send — zero dead air
- **Live tool call pills** — Tool calls render inline as the agent works during multi-step responses
- **Tool result collapse** — Tool results collapse cleanly so the conversation stays readable
- **Nonce-based message dedup** — Optimistic messages replaced correctly on SSE match; no duplicates on reconnect
- **Compaction banner** — Amber "compaction in progress" banner shown inline during context summarization
- **Inline session rename** — Click the session name in the header to rename it on the spot
- **File attachments** — `.md`, `.txt`, images — content injected into message body, images auto-compressed before send
- **Hover actions bar** — Copy, retry, and additional actions appear on hover per message
- **Exec approval banner** — When gateway triggers an exec approval, a banner appears inline in chat
- **Activity EventSource** — Connects on mount so tool pill activity has zero latency gap
- **Double-send fixes** — `submittingRef` guard + `type=button` on send button prevents form double-fire
- **Chat input theme** — Input box border and background match the active theme

---

### 🎨 3-Theme System (New)

- **Paper Light** — Clean, minimal light theme
- **Ops Dark** — High-contrast dark theme built for long working sessions
- **Premium Dark** — Rich, deep dark theme with elevated glass surfaces
- **Theme picker** — Settings dialog → Appearance tab → choose theme live
- **Deep dark mode** — 66+ components fully wired to CSS custom properties (`--theme-bg`, `--theme-card`, `--theme-panel`, `--theme-border`, `--theme-text`, `--theme-muted`)
- **Theme persistence** — Saved preference rehydrates before first render (no flash of wrong theme)
- **Accent color routing** — `orange-*` replaced with `accent-*` tokens across 13 files — accent now fully dynamic
- **Dark mode sweep** — Full dark: prefix audit across tasks widget, costs screen, metrics widget, memory browser, mission areas
- **bg-surface / text-ink overrides** — Applied across all 3 enterprise themes for consistent surface/text contrast
- **Dark mode toggle** — Syncs `data-theme` attribute correctly — prevents paper-light vars overriding dark: classes
- **Splash theme init** — Theme applied before first render to prevent flash

---

### 📊 Dashboard — Revamp (Upgraded)

- **Cost analytics page** (`/costs`) — Per-agent spend breakdown (bar chart), daily cost trend (line chart), MTD total, projected EOM cost, budget % meter
- **Services health widget** — Real-time status for Mission Control API, UI, Gateway, and Ollama — UP/DOWN + latency
- **System metrics footer** — Persistent footer across all screens: CPU%, RAM used/total, Disk%, gateway connection, uptime — color-coded
- **Hero KPI cards** — Total sessions, tokens used today, active agents, cost this month
- **Agent sidebar** — Collapsible sidebar showing all live agents with session status, model, and activity state
- **Quick links section** — Pinned shortcuts to Mission Control, costs, memory, files, cron

---

### ⚙️ Settings & Providers (Upgraded)

- **2-panel settings dialog** — Left nav + right panel layout, 6 organized tabs
- **Add Provider modal** — Popup wizard with real provider logos, custom baseUrl/apiType, dynamic model dropdown from gateway
- **Remove provider** — Delete providers with confirmation dialog
- **Model presets** — 6 new built-in presets: GPT-5, o3, Gemini Pro, DeepSeek R1, MiniMax, Grok
- **Default model persistence** — Set a default model from the provider picker, saved to gateway config
- **Team icon picker** — Choose an emoji icon for each team config
- **3-step team wizard** — Guided flow: name → add agents → activate
- **Agent inline edit** — Click any agent card to edit name, model, system prompt in place
- **Unique agent names** — Enforced automatically so sessions are always distinguishable
- **Specialty field** — Add a description/specialty to each agent for clarity in team views

---

### ⚡ Exec Approval System (New)

- **Global toast overlay** — Exec approval requests surface as a dismissable overlay on every screen — never miss one
- **Approvals bell** — Bell icon in the Agent Hub header shows pending approval count with badge
- **Gateway polling** — Polls the gateway approval queue and syncs state in real time
- **Server-side event store** — `/api/approvals` backed by a server-side event store — approvals survive UI refreshes
- **In-chat banner** — Approval requests also appear as inline banners in the active chat session

---

### 🔴 Live Session Roster — Agent Sidebar (New)

- **Live agent list** — All configured agents shown with real-time status indicators
- **Per-agent session state** — Active, idle, paused, error — with animated pulse on active
- **Model badge** — Shows current model shortname per agent
- **Usage meter** — Compact 2-bar usage display with provider rotation and set-default picker
- **Orchestrator card** — Merged orchestrator card + usage into a single seamless card at the top
- **Expand/collapse cards** — Click any agent card to expand full detail; compact by default
- **Section toggles** — Eyeball icon hides/shows History and Browser sidebar sections
- **Title tooltips** — Full agent name appears on hover when truncated in compact view
- **Collapsible sidebar** — Toggle with keyboard shortcut or sidebar button
- **No-sidebar mode** — Agent Hub runs without sidebar for maximum workspace focus

---

### 📱 Mobile — PWA (Upgraded)

- **Apple glass nav** — Frosted glass effect on the main mobile nav bar (backdrop-blur, translucent)
- **Bottom navigation** — Full tab bar with icons for all main screens
- **Mobile Agent Hub** — Card-based layout replacing the desktop office view on small screens
- **Mobile Mission Wizard** — Full new-mission flow works on mobile (tested via Tailscale)
- **Chat mobile** — Input bar pinned to bottom with safe-area insets, no bleed into nav
- **Responsive grids** — All dashboard widgets stack cleanly on mobile
- **PWA installable** — Works as a standalone app on iOS Safari, Android Chrome, and desktop Chrome/Edge

---

### 🔒 Security (Upgraded)

- **Auth middleware on all routes** — 10 previously unprotected API routes now require authentication: `/api/files`, `/api/model-switch`, `/api/update-check`, `/api/gateway-discover`, `/api/skills`, `/api/debug-analyze`, `/api/validate-provider`, `/api/cron/runs/$jobId`, `/api/config-get`, `/api/paths`
- **CORS locked** — `Access-Control-Allow-Origin: *` removed from browser proxy and screenshot stream — restricted to localhost only
- **Path traversal prevention** — Hardened on file browser and memory routes with `ensureWorkspacePath()`
- **Timing-safe auth** — Password comparison uses constant-time comparison to prevent timing attacks
- **Rate limiting** — Debug and file routes rate-limited by IP
- **Exec approval workflow** — Sensitive exec commands require explicit in-UI human approval

---

### 🧠 Memory Browser (New)

- Browse, search, and edit `MEMORY.md` and `memory/*.md` files directly from the ClawSuite UI
- Full-text search across all memory files
- In-browser markdown editor with save

---

### 📁 File Browser (New)

- Navigate the OpenClaw workspace directory tree
- Preview markdown, JSON, and text files with Monaco editor
- In-browser file editing without leaving ClawSuite

---

### 📋 Activity Log & Audit Trail (New)

- Timestamped timeline of every agent action, tool call, and system event
- Filterable by agent, event type, and time range
- Exportable as JSON for external audit

---

### 🤝 Discord Integration (New)

- ClawSuite bot connected to Discord server
- Full Gateway intent support (message, reaction, presence events)
- Configurable via settings — no code change required

---

### 🛠️ Developer Tools (Upgraded)

- **Debug console** — Gateway diagnostics with connection status, error feed, pattern-based troubleshooter
- **Cron manager** — Schedule recurring tasks, view run history, manual trigger — now with schedule type + payload type selectors
- **Terminal** — Full PTY with cross-platform support, session persistence; SSE event names fixed
- **Browser** — Multi-method fallback, proper navigate route, no demo mode stubs, correct error states
- **Provider setup** — Guided onboarding wizard for adding API providers

---

### 🎯 UI / Layout Polish (Upgraded)

- **Page container normalization** — All screens unified: `min-h-full bg-surface px-4 md:px-6 pt-5 md:pt-8`, `max-w-[1200px] mx-auto` inner content
- **Agent Hub container** — Unified `max-w-[1600px]` across header, tab bar, and all content sections
- **Dashboard header cards** — All 9 sub-pages get dashboard-style header cards for visual consistency
- **Logo fix** — Gradient ID collision fixed with `useId` per instance (prevented broken logos in React)
- **Tab nav** — `px-4 md:px-6` padding matches header margins; tabs fill full width evenly
- **Agent status labels** — Unified across all components: Ready→Idle, Stopped→Idle, Spawning→Starting
- **Widget contrast** — Dashboard card contrast improved across light and dark modes
- **GlanceCard** — Removed backdrop-blur bleed, unified widget controls to ghost button style

---

### 🐛 Bug Fixes

- Agent dispatch now correctly targets `/api/agent-dispatch` with `lane: subagent` — agents run as true background processes instead of interactive sessions
- Mission pause UI state syncs correctly after async settle (previously showed "paused" even when pause failed)
- Chat deduplication on clipboard paste and file attachment
- Agent Hub header width consistent (`max-w-[1600px]`) across header, tab bar, and card section
- New Mission button on Overview opens wizard inline — no tab switching
- Orange accent bar constrained to match card width
- Theme rehydration loads saved preference before first render (no flash)
- SSE stream dedup guard prevents duplicate tokens on reconnect
- Sidebar collapsible state persists across navigation
- Gateway token handling fixed (no double-prefix on auth header)
- Chat hydration error on SSR resolved

---

### ⚠️ Breaking Changes

- **API auth required** — Routes previously accessible without credentials now require authentication. Update any direct API integrations or scripts.
- **Agent dispatch endpoint** — The correct endpoint for launching subagent missions is `/api/agent-dispatch` (not `/api/sessions/send`).
- **CORS** — If you have external tooling hitting the browser proxy or screenshot endpoints, update to use authenticated requests from localhost only.

---

## v2.2.0

- Mobile optimization sprint — 39 commits on `feat/mobile-optimization`
- Community PRs merged: #23 (SSR hydration), #24 (theme default), #26 (auth check)
- PR #28 squash-merged — 92 files, +6,309/-1,078

## v2.1.2

- ClawSuite QA bug fixes: auth middleware on write APIs, agent-pause rewired to correct RPC, Warden controls overflow fixed, TypeScript build clean

## v2.1.0

- Chat: live token streaming via SSE (foundation)
- Activity log: real-time event stream, dashboard widget + full-page view at `/activity`

## v2.0.0

### Features

- **Model Switcher**: Switch AI models via Gateway RPC from the chat composer, with 10s undo toast, streaming confirmation, premium model detection, failure-safe rollback
- **Usage & Cost Parity**: Real Gateway usage/cost data via `sessions.usage`, `usage.status`, `usage.cost` RPC
- **Debug Console**: Gateway diagnostics at `/debug` with connection status, error feed, pattern-based troubleshooter
- **Provider Setup Wizard**: Guided provider onboarding at `/settings/providers`

### Security

- Sensitive field stripping on all API responses (apiKey, token, secret, password, refresh)
- Provider names read from config keys only — secrets never accessed by Studio
- Gateway URL masking in debug console

## v0.1.0-alpha

- Initial ClawSuite release
