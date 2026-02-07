# OpenClaw Studio — Current Status & Next Steps
**Updated:** 2026-02-06 22:40 EST

## Quick Context
- **Project:** `/Users/aurora/.openclaw/workspace/webclaw-ui`
- **Stack:** React + TanStack Router/Start + Tailwind + Framer Motion + Vite
- **Dev server:** `npm run dev` → localhost:3000
- **Gateway:** ws://127.0.0.1:18789 (OpenClaw Gateway, always running)
- **All coding:** Use Codex CLI (`codex exec --full-auto "task"`) — FREE via ChatGPT Pro

## What's Built (Phase 1+2 Complete)
✅ 10 routes: /dashboard, /chat, /skills, /browser, /terminal, /logs, /cron, /files, /memory, /settings  
✅ 0 ESLint errors, build passes clean  
✅ Keyboard shortcuts modal (press ?), gateway status indicator, page titles  
✅ Tauri initialized (src-tauri/) but .dmg build fails due to macOS RAM pressure  

## API Endpoints (all working)
- `/api/ping` → `{ok: true}`
- `/api/sessions` → real sessions from Gateway
- `/api/history?sessionKey=main` → real chat messages
- `/api/cron/list` → 8 real cron jobs
- `/api/files?path=*.md` → 46 real files
- `/api/skills?tab=installed` → 14 real skills
- `/api/provider-usage` → 2 real providers
- `/api/browser/tabs` → returns tabs but demoMode=true (needs fix)
- `/api/session-status` → returns ok=false (needs fix)

## What Needs Fixing (Priority Order)

### 1. Dashboard Real Data (~3 hours)
**File:** `src/screens/dashboard/dashboard-screen.tsx`
- `mockSystemStatus` (line 81) — hardcoded CPU/memory/uptime → wire to `/api/ping` + `/api/session-status`
- `mockCostDays` (line 91) — hardcoded cost data → wire to `/api/provider-usage`
- `fallbackRecentSessions` (line 101) — already has real session fallback, just needs cleanup

### 2. Activity Logs Real Data (~3 hours)
**File:** `src/routes/logs.tsx`
- Currently generates fake entries on a 1.4s timer (`appendMockEntry`)
- Need to connect to Gateway event stream (SSE or WebSocket)
- The chat already uses `/api/stream` for SSE — logs should tap into same stream
- Filter for system events, agent events, errors

### 3. Browser View Demo Mode Fix (~2 hours)
**File:** `src/server/browser-monitor.ts`
- Tries RPC methods: `browser.tabs`, `browser.list_tabs`, `browser.get_tabs`
- All fail → falls back to demo mode
- Need to check what the actual OpenClaw Gateway browser RPC method names are
- Same issue for screenshots: `browser.screenshot`, `browser.capture`, `browser.take_screenshot`

### 4. Session Status Fix (~1 hour)
**File:** `src/routes/api/session-status.ts`
- Returns `ok: false` — likely wrong Gateway RPC method name
- Check what OpenClaw exposes for session status

### 5. Tauri Desktop Build (~when RAM available)
- `npx tauri build` gets ~70% through Rust compilation then SIGKILL
- Config ready at `src-tauri/tauri.conf.json`
- Alternative: set up GitHub Actions CI to build (has 7GB RAM)

## Architecture Docs
- `docs/PHASE-3-ACTION-PLAN.md` — full roadmap with Phase 3+4
- `docs/OPENCLAW-STUDIO-ARCHITECTURE.md` — system design
- `docs/OPENCLAW-STUDIO-ROADMAP.md` — original build plan
- `docs/specs/SPEC-001 through 011` — individual feature specs
- `docs/TAURI-PACKAGING-PLAN.md` — desktop packaging plan

## Key Files
- `src/server/gateway.ts` — WebSocket connection to Gateway (core)
- `src/server/gateway-stream.ts` — SSE streaming bridge
- `src/server/browser-monitor.ts` — browser RPC calls
- `src/server/cron.ts` — cron RPC calls
- `src/screens/dashboard/dashboard-screen.tsx` — dashboard with mock data
- `src/routes/logs.tsx` — activity logs with mock data
- `src/screens/chat/components/chat-sidebar.tsx` — sidebar nav

## Codex Agent Commands (copy-paste ready)
```bash
# Fix 1: Dashboard real data
codex exec --full-auto "In webclaw-ui, fix src/screens/dashboard/dashboard-screen.tsx to replace mockSystemStatus and mockCostDays with real data from /api/ping, /api/session-status, and /api/provider-usage. The endpoints already exist and return real data. Keep the existing widget components, just wire them to real API responses. Run npm run build after."

# Fix 2: Activity logs  
codex exec --full-auto "In webclaw-ui, fix src/routes/logs.tsx to replace the mock appendMockEntry timer with real Gateway events. Use fetch('/api/stream') SSE or poll '/api/sessions' for recent activity. Remove the fake data generation. Run npm run build after."

# Fix 3: Browser view
codex exec --full-auto "In webclaw-ui, fix src/server/browser-monitor.ts. The browser RPC methods (browser.tabs, browser.screenshot) return errors causing demo mode. Read src/server/gateway.ts to understand the RPC pattern, then check what methods the OpenClaw Gateway actually supports for browser control. Update method names to match. Run npm run build after."

# Fix 4: Session status
codex exec --full-auto "In webclaw-ui, fix src/routes/api/session-status.ts which returns ok=false. Debug why the Gateway RPC call fails — likely wrong method name. Check src/server/gateway.ts for the RPC pattern and find the correct method. Run npm run build after."
```

## Git Status
- Latest commit: `8fca7af` — UI polish (keyboard shortcuts, gateway indicator, page titles)
- Branch: `main`
- No remote configured yet (needs push to `outsourc-e/openclaw-studio`)
