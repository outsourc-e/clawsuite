# Changelog

All notable changes to ClawSuite are documented here.

---

## [4.1.0] — 2026-04-21 (feat/v4.1.0-instant-chat)

### ⚡ Performance

- **Hot-lane RPC priority (`server/gateway.ts`)**: `chat.send` / `chat.abort` / `session.create` now bypass the shared request queue and are sent to the gateway ahead of any background polls (`sessions.usage`, `usage.analytics`, `sessions.costs`, `runs.list`). Eliminates multi-minute stalls where a user’s message was blocked behind analytics traffic on the shared WebSocket.
- **Idempotent retry on `chat.send` (`routes/api/send-stream.ts`)**: Transient transport failures (RPC timeout, circuit-breaker trip, connection drop) now retry once automatically with the same idempotency key. The gateway dedupes server-side, so a real double-send is impossible, and a transient gateway hiccup no longer surfaces as a user-visible failure.

### 👁️ UX

- **Smart gateway banner (`components/gateway-connection-banner.tsx`)**: The "Gateway offline" red banner is now suppressed while chat is demonstrably healthy. If a chat send completed in the last 60 s, a flapping `/api/ping` probe no longer raises a false alarm. Chat is the thing users notice — the banner now reflects that, not the state of the polling lane.

### 🧠 Why this release

For the last few weeks chat sometimes took 30 s–5 min to reach the gateway, even though the gateway itself was fine. Root cause: every user send and every background poll (costs, usage, sessions) shared a single WebSocket request queue. A parse-stall or slow poll on the gateway side would block everything behind it, including your next message. v4.1.0 splits the lanes so interactive traffic can never be queued behind background traffic, retries transient failures invisibly, and stops the banner from lying about connection health.

---

## [3.0.0] — 2026-02-25 (feat/clean-sprint)

### 🚀 New Features

#### Agent Hub
- **Mission dispatch fix (BUG-1)**: Wired agent dispatch to `/api/agent-dispatch` (gateway RPC lane: subagent) — was incorrectly calling `sessions/send` (chat) causing missions to not actually run
- **Exec approval modal (BUG-3)**: Full SSE-driven approval UI — stacked queue, 30s countdown timer, risk badges, auto-deny on timeout, approve/deny with loading states
- **Pause/steer fix**: Pause now sends real steer signal via `chat.send` fallback — was no-op before
- **Live output panel**: Redesigned with compact agent info, colored status badges, better progress bar
- **Overview restored**: Office view fills full height with internal stats row, secondary widgets below

#### Dashboard
- **Cost tracking analytics (BUG-2)**: Full `/costs` page with real SQLite data — hero KPIs (MTD, projected EOM, budget %), per-agent breakdown, daily trend chart (30 days), per-model usage table
- **Dashboard revamp B/C/D (FEAT-6)**: Full dark mode consistency across all surfaces, hardcoded `localhost:3000` WebSocket origin replaced with dynamic derivation, widget edit controls moved out of header

#### New Screens
- **Memory Browser (FEAT-2)**: View, search, and edit `MEMORY.md` + `memory/*.md` in-app — grouped file list, full-text search with line jump, edit mode, unsaved changes indicator, markdown preview toggle
- **Workspace File Browser (FEAT-3)**: Split-panel file tree navigator — expandable folders, file icons by type, markdown preview, syntax highlighting for TS/JS/JSON, image preview, edit + save
- **Cost Analytics page**: `/costs` route with real usage data, per-agent and per-model breakdowns

#### Settings & Infrastructure
- **Provider restart UX (FEAT-4)**: Adding/removing a provider now shows confirm dialog → full-screen gateway restart overlay → health polling → auto-dismiss on recovery. 30s timeout with manual retry.
- **System metrics footer (FEAT-1)**: Persistent CPU/RAM/disk/gateway/uptime bar — **off by default**, toggle in Settings
- **Session status fix (FEAT-7)**: `/api/sessions/:key/status` now does real `sessions.list` gateway lookup with proper 404/401/500 handling — was hardcoded `active` before

### 🐛 Bug Fixes
- **Mission crash fix**: Restored `sessions.send→chat.send` fallback in agent-dispatch preventing no-output on mission launch
- **Chat dedup (BUG-4)**: Fixed duplicate messages on paste/attach
- **Mission pause state (BUG-5)**: Fixed pause state not syncing across components
- **Mobile nav glass effect**: Fixed `isolate` CSS property breaking `backdrop-filter` in Safari/WebKit — frosted glass nav now works correctly
- **Mobile safe area**: Chat input properly clears tab bar with `env(safe-area-inset-bottom)` padding
- **Dashboard WebSocket origin**: Removed hardcoded `localhost:3000` — now derives origin from gateway URL dynamically

### 🔒 Security
- **SEC-1**: Auth guards added to 10 previously unprotected API routes
- **SEC-2**: Wildcard CORS removed from browser-proxy + browser-stream
- **SEC-3**: Full audit pass:
  - Auth guards on terminal, browser, debug-analyze, config-get, paths, context-usage endpoints
  - Rate limiting on high-risk endpoints: exec, gateway-restart, update-check (npm install → RCE risk)
  - `requireJsonContentType()` CSRF guard on all mutating POST routes
  - Input validation on body parameters
  - Skills `GET /api/skills` was unauthenticated — fixed
  - `SECURITY.md` updated with full audit summary

### 📱 Mobile
- **MOB-1**: Nav glass effect (Safari `isolate` fix)
- **MOB-2**: Agent Hub shows agent card grid on mobile (office hidden `< 640px`)
- **MOB-3**: Bottom nav frosted glass — `backdrop-blur-xl` direct application
- **MOB-4**: Chat input safe-area insets, clears tab bar
- **MOB-5**: Dashboard quick actions replaced with 2×2 widget card grid
- **MOB-6**: Agent Hub bottom nav icon swapped to `BotIcon`
- **MOB-7**: Glass effects on mobile overlays

### 🔍 QA Sweep (FEAT-5)
All tool tabs verified and fixed:
- **Browser tab**: Fully wired via gateway RPC ✅
- **Terminal tab**: PTY streaming (SSE) confirmed working ✅
- **Cron tab**: `nextRunAt` type field added, all CRUD verified ✅
- **File Manager**: All operations working, auth guards confirmed ✅
- **Skills tab**: Added missing auth guard on `GET /api/skills` ✅

### 🏗️ Agent Hub Style
- All headers, cards, containers now match dashboard style exactly: `rounded-xl border border-primary-200 bg-primary-50/95 shadow-sm`
- Page background unified: `bg-primary-100/45`
- Office view crop fixed — `overflow-hidden` removed, SVG fills container

---

## [2.1.0] — 2026-02-22

### Features
- Cost analytics page with per-model breakdown
- Services health widget
- System metrics footer
- Theme persistence fix
- Chat crash fix (motion.create + lazy loading)
- Mobile Agent Hub sub-tabs restored
- 38 QA bugs fixed (P0 auth, P1 streaming/mission, P2 polish)
- 25 commits on `feat/clawsuite-upgrade-sprint-feb22`

---

## [2.0.0] — 2026-02-19

### Features
- Live output streaming (Spec 2)
- Enterprise usability polish (Spec 3)
- Mission execution robustness (Spec 4-5)
- Agent Hub Specs 2-5 complete
- PC1 Mission Control parity

---

## [1.0.0] — 2026-02-17

### Initial Release
- PR #28 merged — 92 files, +6,309/-1,078
- Mobile optimization (39 commits)
- Community PRs merged (#23, #24, #26)
- Chat streaming, sidebar, exec approval, kanban, settings
- Dark mode, theme routing, UI polish

---

## [0.1.0] — 2026-02-16

### Initial Preview
- Established the first ClawSuite project baseline before the `1.0.0` release
- Added the initial chat, agent workspace, and app shell foundations
