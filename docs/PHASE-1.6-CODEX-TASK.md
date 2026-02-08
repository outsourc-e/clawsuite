# Phase 1.6 Codex Task — Gateway Debug Console

## Context
OpenClaw Studio at `~/.openclaw/workspace/webclaw-ui/` (Vite + React + TanStack Router).
Gateway connection status is already tracked. Activity events stream exists (`src/server/activity-events.ts`, `src/server/activity-stream.ts`).
The app already has a sidebar layout pattern — check `src/routes/__root.tsx` and existing screens.

## Task
Build a Debug Console panel inside Studio that helps users diagnose and fix Gateway issues.

## Requirements

### 1. Debug Console UI Component
Create `src/screens/debug/debug-console-screen.tsx`:
- Full-page screen accessible at `/debug` route
- Shows three sections:

**Section 1: Connection Status**
- Current Gateway connection state (connected/disconnected/connecting)
- Gateway URL (mask any tokens — show only host:port)
- Uptime or time since last disconnect
- Reconnect button (triggers a reconnect attempt)

**Section 2: Recent Errors & Events**
- Reuse the activity events hook (`src/screens/activity/use-activity-events.ts`)
- Filter to show only `error` and `warn` level events
- Show last 20 error/warn events
- Each entry shows timestamp, type, title, and expandable detail

**Section 3: LLM Troubleshooter (Safe Mode)**
- A read-only "assistant" that analyzes the current errors and suggests fixes
- **Implementation**: Pre-built suggestion map (NOT a live LLM call). Map common error patterns to fix suggestions:
  - "Gateway connection closed" → "Check if OpenClaw Gateway is running: `openclaw gateway status`"
  - "Gateway connection refused" → "Start the Gateway: `openclaw gateway start`"
  - "Authentication failed" / "401" → "Verify your Gateway token in openclaw.json"
  - "ECONNREFUSED" → "Gateway may not be running. Try: `openclaw gateway restart`"
  - "timeout" → "Gateway may be overloaded. Check system resources."
  - Default/unknown → "Run `openclaw status` for diagnostics"
- Each suggestion includes a terminal command that can be **copied** (click-to-copy button), NOT executed
- Clear disclaimer text: "⚠️ Suggestions only — commands are not executed automatically"
- Link to OpenClaw docs: `https://docs.openclaw.ai`

### 2. Route
Create `src/routes/debug.tsx`:
- Route at `/debug`
- Use `usePageTitle('Debug Console')`
- Follow same pattern as `src/routes/cron.tsx`

### 3. Auto-activation
- In the existing sidebar/nav (check `src/routes/__root.tsx` or layout), add a "Debug" nav item
- Show a red dot indicator on the Debug nav item when there are recent errors (last 5 minutes)
- The debug console should also be accessible via the system status widget on dashboard

### 4. Safety Rules (CRITICAL)
- LLM troubleshooter does NOT make any API calls — it's a static pattern matcher
- Commands are COPY ONLY — no execute functionality
- No secrets, tokens, or API keys are ever shown in the debug console
- Gateway URL display must mask tokens: show `ws://localhost:3578` not the full auth URL
- Error payloads must be sanitized (reuse the sanitizer from `src/server/activity-stream.ts`)

### 5. Docs
Create `docs/DEBUG_CONSOLE.md`:
- Feature overview
- Safety guardrails explained
- How to extend the suggestion map
- Error pattern → suggestion mapping reference

## Files to study first
- `src/routes/__root.tsx` — App layout, sidebar/nav structure
- `src/routes/cron.tsx` — Route pattern to follow
- `src/screens/activity/use-activity-events.ts` — Reuse for error feed
- `src/screens/activity/components/activity-event-row.tsx` — Event row component
- `src/server/activity-stream.ts` — Sanitizer to reuse
- `src/server/gateway.ts` — Gateway config (for connection status)
- `src/screens/dashboard/components/system-status-widget.tsx` — Current status display

## Styling
- Use existing Tailwind classes and design patterns
- Glass card style for sections (use `DashboardGlassCard` or similar)
- Consistent with the rest of Studio's dark/light theme
- Terminal-style monospace font for suggested commands

## Final checks
1. `npm run build` must succeed
2. No secrets/tokens in any browser-facing output
3. No `console.log` in production code
4. Git add all new files
