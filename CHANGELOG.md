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
- **Stream deduplication** — Guard against duplicate tokens from reconnect events
- **Compaction banner** — Amber "compaction in progress" banner shown inline when context is being summarized
- **Chat input theme** — Input box border and background match the active theme
- **Paste deduplication** — Fixed duplicate messages when pasting from clipboard or attaching files
- **File/image attachment** — Attach images and files inline in the chat composer

---

### 🎨 3-Theme System (New)

- **Paper Light** — Clean, minimal light theme
- **Ops Dark** — High-contrast dark theme built for long working sessions
- **Premium Dark** — Rich, deep dark theme with elevated glass surfaces
- **Theme picker** — Settings dialog → Appearance tab → choose theme live
- **Deep dark mode** — 66+ components fully wired to CSS custom properties (`--theme-bg`, `--theme-card`, `--theme-panel`, `--theme-border`, `--theme-text`, `--theme-muted`)
- **Theme persistence** — Saved preference rehydrates before first render (no flash of wrong theme)
- **Accent color** — Dynamic accent color system works across all three themes

---

### 📊 Dashboard — Revamp (Upgraded)

- **Cost analytics page** (`/costs`) — Per-agent spend breakdown (bar chart), daily cost trend (line chart), MTD total, projected EOM cost, budget % meter
- **Services health widget** — Real-time status for Mission Control API, UI, Gateway, and Ollama — UP/DOWN + latency
- **System metrics footer** — Persistent footer across all screens: CPU%, RAM used/total, Disk%, gateway connection, uptime — color-coded
- **Hero KPI cards** — Total sessions, tokens used today, active agents, cost this month
- **Agent sidebar** — Collapsible sidebar showing all live agents with session status, model, and activity state
- **Quick links section** — Pinned shortcuts to Mission Control, costs, memory, files, cron

---

### 🔴 Live Session Roster — Agent Sidebar (New)

- **Live agent list** — All configured agents shown with real-time status indicators
- **Per-agent session state** — Active, idle, paused, error — with animated pulse on active
- **Model badge** — Shows current model shortname per agent
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
- **Cron manager** — Schedule recurring tasks, view run history, manual trigger
- **Terminal** — Full PTY with cross-platform support, session persistence
- **Provider setup** — Guided onboarding wizard for adding API providers

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
