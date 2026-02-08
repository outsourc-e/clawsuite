# Phase 1.5 Codex Task — Activity Log & Event Stream

## Context
OpenClaw Studio at `~/. openclaw/workspace/webclaw-ui/` (Vite + React + TanStack Router).
Gateway WebSocket stream already exists at `src/server/gateway-stream.ts` — emits `agent`, `chat`, and `other` events.
Dashboard is at `src/screens/dashboard/dashboard-screen.tsx` with widget components in `src/screens/dashboard/components/`.

## Task
Build an Activity Log panel that shows real Gateway and Studio events in a chronological, read-only feed.

## Requirements

### 1. Backend: `/api/events` SSE endpoint
Create `src/routes/api/events.ts`:
- Use Server-Sent Events (SSE) to stream events to the browser
- Connect to Gateway WebSocket stream (use `createGatewayStreamConnection` from `src/server/gateway-stream.ts`)
- Normalize all events into a unified format:
```ts
type ActivityEvent = {
  id: string          // uuid
  timestamp: number   // Date.now()
  type: 'gateway' | 'model' | 'usage' | 'cron' | 'tool' | 'error' | 'session'
  title: string       // Human-readable title
  detail?: string     // Optional detail text
  level: 'info' | 'warn' | 'error'
}
```
- Map Gateway events:
  - WebSocket open → `{ type: 'gateway', title: 'Gateway connected', level: 'info' }`
  - WebSocket close → `{ type: 'gateway', title: 'Gateway disconnected', level: 'error' }`
  - `agent` events with model info → `{ type: 'model', title: 'Model switched to X' }`
  - `chat` events → `{ type: 'session', title: 'Session activity' }`
  - Any error → `{ type: 'error', title: error.message, level: 'error' }`
- **SECURITY**: Strip any fields containing `apiKey`, `token`, `secret`, `password`, `refresh` from event payloads before sending to browser. Use a recursive sanitizer.
- Include a `GET /api/events/recent` endpoint that returns the last 50 events as JSON (for initial load)

### 2. Event buffer (server-side)
Create `src/server/activity-events.ts`:
- Ring buffer of last 100 events
- `pushEvent(event: ActivityEvent)` — adds to buffer
- `getRecentEvents(count?: number)` — returns last N events
- `onEvent(callback)` / `offEvent(callback)` — for SSE subscription
- EventEmitter-based

### 3. Dashboard Widget: `ActivityLogWidget`
Create `src/screens/dashboard/components/activity-log-widget.tsx`:
- Renders inside the dashboard grid (add it to `dashboard-screen.tsx`)
- Shows last 20 events on initial load (fetch from `/api/events/recent`)
- Subscribes to `/api/events` SSE for live updates
- Each event row shows:
  - Colored dot (green=info, yellow=warn, red=error)
  - Timestamp (relative, e.g., "2m ago")
  - Type icon (use HugeIcons — pick appropriate ones)
  - Title text
  - Optional expandable detail
- Auto-scroll to newest events
- Max height with scroll overflow
- Use existing glass card style (`DashboardGlassCard` from `dashboard-glass-card.tsx`)
- Widget title: "Activity Log" with a pulse dot when live-connected

### 4. Full-page Activity Log screen (optional but preferred)
Create `src/screens/activity/activity-screen.tsx` and route at `/activity`:
- Same event feed but full-page, shows all 100 buffered events
- Future: filterable by type (just add the UI skeleton, filters don't need to work yet)

### 5. Docs
Create `docs/ACTIVITY_LOGS.md`:
- Architecture overview
- Event types and their sources
- Security: what gets stripped
- How to extend with new event types

## Constraints
- NO demo/fake/hardcoded events — only real Gateway data
- If Gateway is disconnected, show a "Disconnected" state, don't crash
- All new files must pass `npx tsc --noEmit` without NEW errors (pre-existing errors are OK)
- Must pass `npm run build` cleanly
- Use existing patterns from the codebase (look at how `stream.ts`, `send-stream.ts` do SSE)
- Use TanStack Router for the new route (follow existing route patterns in `src/routes/`)
- Keep styling consistent with existing dashboard widgets

## Files to study first
- `src/server/gateway-stream.ts` — Gateway WebSocket connection
- `src/server/gateway.ts` — Gateway config + RPC
- `src/routes/api/stream.ts` — existing SSE pattern
- `src/screens/dashboard/dashboard-screen.tsx` — dashboard layout
- `src/screens/dashboard/components/dashboard-glass-card.tsx` — card styling
- `src/screens/dashboard/components/notifications-widget.tsx` — similar list widget

## Final checks before committing
1. `npm run build` must succeed
2. No sensitive keywords in any browser-facing response
3. No `console.log` left in production code (use `console.error` for errors only)
4. Git add all new files
