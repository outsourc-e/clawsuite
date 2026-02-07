# OpenClaw Studio — Security & Sanity Audit
**Date:** 2026-02-07 00:30 EST
**Auditor:** Aurora (AI COO)
**Repo:** github.com/outsourc-e/openclaw-studio (PUBLIC)

---

## A) Executive Risk Summary (ranked by severity)

1. **🔴 `.env.example` still says "WebClaw"** — Minor branding leak, easy fix
2. **🟡 Demo data NOT labeled in UI** — Usage Meter, Cost Tracker, Active Agents, Agent Swarm sidebar all show fake data without any "Demo" indicator. Users could think this is real.
3. **🟡 File system API has no auth beyond Gateway token** — Anyone with the Gateway token can read/write any file under `~/.openclaw/workspace/`. Path traversal IS blocked but scope is broad.
4. **🟡 Terminal has no sandboxing** — PTY access = full shell. This is intentional for power users but should be documented.
5. **🟡 Model switcher dropdown doesn't actually work** — Selecting a model has zero effect. Misleading UX.
6. **🟢 No secrets found in current tree or git history** — Scanned for: API keys (sk-*, ghp_*, github_pat_*, AKIA*), Gateway tokens, passwords. Only partial reference found: `ghp_pg7R...` (truncated, in a deleted doc).
7. **🟢 Architecture is sound** — All Gateway access through singleton server-side WebSocket. No browser→Gateway direct connections. Token never in client bundles.
8. **🟢 Files API has path traversal protection** — `ensureWorkspacePath()` validates all paths stay within `WORKSPACE_ROOT`.
9. **🟢 Gateway reconnect works** — Singleton with exponential backoff, heartbeat, request queuing.
10. **🟢 Git history is clean** — No full tokens/keys ever committed. Removed docs only had partial PAT references.

---

## B) Sensitive Info Audit

### Current Tree Findings

| File | Risk | Fix |
|------|------|-----|
| `.env.example` line 1 | Says "WebClaw" | Change to "OpenClaw Studio" |
| `src/routes/connect.tsx:29` | Shows `ws://127.0.0.1:18789` example with `YOUR_TOKEN_HERE` | ✅ Safe — placeholder only |
| `src/screens/chat/utils.ts:171` | Error message mentions `CLAWDBOT_GATEWAY_TOKEN` | ✅ Safe — env var name, not value |
| `DEVELOPMENT-STATUS.md` | Contains architecture details | ✅ Intentional — public repo documentation |

### Git History Risk

| Pattern Scanned | Found | Risk |
|----------------|-------|------|
| `sk-*`, `sk-ant-*` (API keys) | None | ✅ |
| `ghp_*` (full GitHub PAT) | None | ✅ |
| `github_pat_*` (fine-grained PAT) | None | ✅ |
| `71f53df545*` (Gateway token) | None | ✅ |
| `ghp_pg7R...` (partial PAT ref) | Found in deleted `OVERNIGHT-SHIP-REPORT.md` | 🟢 Low — truncated, only first 8 chars |
| `AKIA*` (AWS keys) | None | ✅ |
| Hardcoded URLs with auth | None in tracked files | ✅ |

**Recommendation:** No history rewrite needed. Run `gitleaks` as CI check for ongoing protection.

---

## C) Security Posture Findings

### Architecture Strengths
- ✅ **Proxy-only architecture** — Browser never talks to Gateway directly
- ✅ **Singleton WebSocket** — Single connection with auth, reconnect, heartbeat
- ✅ **Token in server-side only** — `process.env.CLAWDBOT_GATEWAY_TOKEN` read only in `src/server/` and `src/routes/api/`
- ✅ **Path traversal blocked** — Files API validates all paths within workspace root
- ✅ **No client-side secrets** — Token env vars never in React bundles

### Vulnerabilities / Footguns

1. **Terminal = full shell access** — The PTY terminal gives full system access to anyone with the Gateway token. This is by design for a local dev tool, but:
   - **Mitigation:** Document that Studio should only run on trusted machines. Terminal access = root-equivalent.
   
2. **Files API scope = entire workspace** — Read/write to any file under `~/.openclaw/workspace/`. Path traversal blocked but workspace contains MEMORY.md, secrets notes, etc.
   - **Mitigation:** Document scope. Consider optional read-only mode for sensitive paths.

3. **No CSRF protection on API routes** — API routes don't check Origin header. If Studio runs on a non-localhost port, a malicious page could call the API.
   - **Mitigation:** API routes should validate `Origin: http://localhost:3000` or reject. Low risk since Gateway only binds to loopback.

4. **Skills browser loads 2,070+ skills with no vetting** — ClawdHub registry includes 341 reported malicious skills (per Feb 2026 reports).
   - **Mitigation:** Skills should show permissions (FS/Network/Browser). New skills disabled by default. Add warning banner for unvetted skills.

5. **Demo data silently presented as real** — Usage Meter shows "$143.82" and "79% used" with no "Demo" label. Users could think this is their actual usage.
   - **Mitigation:** Add visible "Demo" badge to all widgets using fallback data.

---

## D) Functional Truth Audit

### Fully Wired (Real Gateway Data)

| Feature | Evidence (code path) |
|---------|---------------------|
| Chat send/stream | `src/routes/api/send-stream.ts` → `gatewayRpc('sessions.send')` |
| Chat history | `src/routes/api/history.ts` → `gatewayRpc('sessions.history')` |
| Session list | `src/routes/api/sessions.ts` → `gatewayRpc('sessions.list')` |
| Terminal PTY | `src/server/terminal-sessions.ts` → direct WS to Gateway |
| File Explorer | `src/routes/api/files.ts` → `fs.readFile/writeFile` (local FS) |
| Skills Browser | `src/routes/api/skills.ts` → `gatewayRpc('skills.list')` |
| Cron Manager | `src/server/cron.ts` → `gatewayRpc('cron.*')` |
| Gateway Ping | `src/routes/api/ping.ts` → `gatewayRpc('ping')` |

### Partially Wired

| Feature | Real Part | Demo Part |
|---------|-----------|-----------|
| Dashboard Weather | wttr.in API (real) | Location auto-detected, no config |
| Dashboard Recent Sessions | Real session data | 2 fallback placeholders if empty |
| Dashboard System Status | Gateway connected + session count | Uptime=0, model=hardcoded |
| Agent View sidebar | Real sessions from API | Falls back to `createDemoActiveAgents()` |
| Provider Usage | API endpoint exists | Requires OPENROUTER_API_KEY / ANTHROPIC_API_KEY |

### Visual Only / Placeholder

| Feature | Code Location | Misleading? |
|---------|---------------|-------------|
| **Model Switcher** | `chat-composer.tsx` (localStorage only) | **🔴 YES** — shows dropdown but selecting does nothing |
| **Usage Meter donut** | `usage-meter-widget.tsx:24` `demoUsageData` | **🔴 YES** — shows 79% + $143.82 as if real |
| **Cost Tracker** | `cost-tracker-widget.tsx:16` `DEMO_METRICS` | **🔴 YES** — shows $143.82/$874/$3,942 |
| **Active Agents** | `agent-status-widget.tsx:24` `DEMO_AGENTS` | **🟡 YES** — shows 3 fake running agents |
| **Agent Swarm** | `use-agent-view.ts:64` `createDemoActiveAgents` | **🟡 YES** — says "Demo Mode" badge exists but still shows fake agents |
| **Tasks Kanban** | `tasks-widget.tsx` (localStorage) | **🟡 Mild** — sample tasks could confuse |
| **Voice/TTS button** | `chat-composer.tsx` mic icon | **🟡 Mild** — button exists, does nothing |
| **Utility buttons** | `chat-composer.tsx` (+, globe, flash, code) | **🟡 Mild** — icons exist, no action |
| **Activity Logs** | `logs.tsx` | **🟢 OK** — shows "No activity logs yet" |
| **Settings** | `settings.tsx` | **🟡 Mild** — UI exists, doesn't persist |
| **Reset Layout / Add Widget** | Dashboard header | **🟡 Mild** — buttons exist, no function |
| **Browser View** | `BrowserPanel.tsx` | **🟢 OK** — explains demo mode |

---

## E) Public Repo Hardening Pack

### SECURITY.md

```markdown
# Security Policy

## Reporting Vulnerabilities

If you discover a security issue, please email eric@buildingthefuture.io.
Do NOT open a public GitHub issue for security vulnerabilities.

## Architecture

OpenClaw Studio runs as a local desktop application. All communication with the OpenClaw Gateway happens through a server-side WebSocket proxy. No secrets are exposed to the browser.

## Secrets

- Gateway tokens are read from environment variables or `~/.openclaw/openclaw.json`
- No secrets are hardcoded in source code
- `.env` files are gitignored

## Scope

- Terminal access provides full shell access — only run on trusted machines
- File Explorer is scoped to `~/.openclaw/workspace/`
- Skills from ClawdHub registry should be reviewed before enabling
```

### README Security Notes Section

```markdown
## Security

- All Gateway communication is proxied through the server — no direct browser-to-Gateway connections
- Secrets are never included in client-side bundles
- File access is sandboxed to your OpenClaw workspace
- Terminal provides full shell access (run only on trusted machines)
- See [SECURITY.md](SECURITY.md) for vulnerability reporting
```

### .env.example (fixed)

```
# OpenClaw Studio → Gateway connection
#
# The Studio server connects to the OpenClaw Gateway via WebSocket.
# Keep secrets here (never in the browser).

CLAWDBOT_GATEWAY_URL=ws://127.0.0.1:18789
# Recommended auth method:
CLAWDBOT_GATEWAY_TOKEN=
# Alternative:
# CLAWDBOT_GATEWAY_PASSWORD=
```

### CI Suggestions

```yaml
# .github/workflows/security.yml
name: Security Scan
on: [push, pull_request]
jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## F) Phased Roadmap with Tickets

### Phase 0 — Stabilization & Truth

#### TICKET P0-001: Add Demo Mode Labels to All Visual-Only Widgets
- **Phase:** 0
- **Files:** `usage-meter-widget.tsx`, `cost-tracker-widget.tsx`, `agent-status-widget.tsx`, `tasks-widget.tsx`, `use-agent-view.ts`
- **Steps:**
  1. Add a "Demo" badge (small amber pill) to each widget header when using demo/fallback data
  2. Badge text: "Demo" with `bg-amber-100 text-amber-700 text-xs rounded-full px-2`
  3. Usage Meter: show "Demo" when `usageQuery.data` is null
  4. Cost Tracker: show "Demo" when `days.length === 0`
  5. Active Agents: show "Demo" when using `DEMO_AGENTS`
  6. Tasks: show "Sample Data" label since it's localStorage-only
- **Acceptance:** No widget shows fake numbers without a visible demo indicator
- **Security:** Prevents users from making decisions based on fake data

#### TICKET P0-002: Fix .env.example Branding
- **Phase:** 0
- **Files:** `.env.example`
- **Steps:** Change "WebClaw" to "OpenClaw Studio"
- **Acceptance:** `grep -i webclaw .env.example` returns nothing

#### TICKET P0-003: Create SECURITY.md
- **Phase:** 0
- **Files:** `SECURITY.md` (new)
- **Steps:** Add security policy with reporting instructions, architecture summary, scope docs
- **Acceptance:** File exists at repo root, covers: reporting, architecture, secrets, scope

#### TICKET P0-004: Secrets Scan + CI
- **Phase:** 0
- **Files:** `.github/workflows/security.yml` (new)
- **Steps:**
  1. Run gitleaks on full history locally
  2. Create CI workflow for ongoing scans
  3. Document scan results in `docs/security/scan-report.md`
- **Acceptance:** Scan passes clean, CI blocks PRs with secrets
- **Security Note:** PAT lacks `workflow` scope — Eric must add via GitHub web UI

#### TICKET P0-005: Disable Model Switcher Until Wired
- **Phase:** 0
- **Files:** `chat-composer.tsx`
- **Steps:** Either (a) remove the model dropdown until Phase 1 wiring, or (b) add a "Not connected" label showing it's visual-only
- **Acceptance:** User cannot believe they've switched models when they haven't

#### TICKET P0-006: Disable Non-Functional Utility Buttons
- **Phase:** 0
- **Files:** `chat-composer.tsx`
- **Steps:** Add `disabled` state + tooltip "Coming soon" to +, globe, flash, code, mic buttons
- **Acceptance:** Clicking non-functional buttons shows they're not yet active

### Phase 1 — Gateway Parity

#### TICKET P1-001: Wire Model Switcher to Gateway RPC
- **Phase:** 1
- **Files:** `chat-composer.tsx`, `src/routes/api/` (new endpoint), `src/server/gateway.ts`
- **Steps:**
  1. Create `/api/model-switch` endpoint that calls `gatewayRpc('session.setModel', { model })` or equivalent
  2. Wire composer dropdown to call this endpoint on selection
  3. Persist selection per session key
  4. Show current model in chat header (execution context bar)
- **Acceptance:** Selecting "opus 4.6" actually changes the model for the next message
- **Security:** Model changes should only apply to the user's session

#### TICKET P1-002: Gateway Token Auto-Discovery for Desktop App
- **Phase:** 1
- **Files:** `src/server/gateway.ts`, `src-tauri/` config
- **Steps:**
  1. If `CLAWDBOT_GATEWAY_TOKEN` env var is empty, read from `~/.openclaw/openclaw.json` → `gateway.auth.token`
  2. If both empty, show connect page with instructions
  3. Tauri app should NOT require .env file
- **Acceptance:** Fresh Tauri install auto-connects to running Gateway without config
- **Security:** Token read from filesystem at startup only, never exposed to renderer

#### TICKET P1-003: Settings Persistence
- **Phase:** 1
- **Files:** `src/routes/settings.tsx`, new API endpoints
- **Steps:**
  1. Read current Gateway config via RPC
  2. Display in Settings UI
  3. Allow changes (model, agent config, channel config)
  4. Write changes back via Gateway RPC
- **Acceptance:** Settings changes survive Studio restart
- **Security:** Validate all config changes before applying

#### TICKET P1-004: Execution Context Bar
- **Phase:** 1
- **Files:** `src/screens/chat/` (header area)
- **Steps:**
  1. Show current agent ID, active model, and loaded skills count in chat header
  2. Pull from session-status API
  3. Update on model switch or session change
- **Acceptance:** User always knows what agent/model is active

### Phase 2 — Operational Confidence

#### TICKET P2-001: Real Provider Usage Data
- **Phase:** 2
- **Files:** `usage-meter-widget.tsx`, `provider-usage.ts`
- **Steps:**
  1. Enhance provider-usage API to aggregate real token counts from Gateway session data
  2. Wire Usage Meter donut to real data
  3. Remove demo data fallback (show "No data" instead)
- **Acceptance:** Usage Meter shows real numbers or explicitly says "No usage data"

#### TICKET P2-002: Gateway Event Stream for Activity Logs
- **Phase:** 2
- **Files:** `src/routes/api/stream.ts`, `logs.tsx`, `use-activity-log.ts`
- **Steps:**
  1. Subscribe to Gateway event stream via singleton WS
  2. Forward events to UI via SSE
  3. Display in Activity Logs with timestamps, categories, filtering
- **Acceptance:** Real-time log of agent actions, session events, cron runs

#### TICKET P2-003: Real Agent Sidebar
- **Phase:** 2
- **Files:** `use-agent-view.ts`, `agent-view-panel.tsx`
- **Steps:**
  1. Replace demo agents with real session data enriched with model/status
  2. Show actual running agents, their models, and elapsed time
  3. Remove all `createDemo*` functions when real data is available
- **Acceptance:** Agent View shows only real data when Gateway is connected

### Phase 3 — UX Polish

#### TICKET P3-001: Voice Input (Browser SpeechRecognition)
- **Phase:** 3
- **Files:** `chat-composer.tsx`
- **Steps:**
  1. Wire mic button to `webkitSpeechRecognition` / `SpeechRecognition` API
  2. Transcribe speech to text in composer
  3. Show recording indicator when active
- **Acceptance:** Click mic → speak → text appears in composer (Chrome only is OK)

#### TICKET P3-002: Dashboard Drag-and-Drop
- **Phase:** 3
- **Files:** `dashboard-screen.tsx`, `package.json` (add react-grid-layout)
- **Steps:**
  1. Install react-grid-layout
  2. Wrap widgets in grid layout
  3. Persist layout to localStorage
  4. Wire "Reset Layout" button to restore default
  5. Wire "+ Add Widget" to widget picker modal
- **Acceptance:** Users can drag widgets and layout persists across reloads
