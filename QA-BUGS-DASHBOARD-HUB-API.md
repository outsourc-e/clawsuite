# ClawSuite Frontend + API QA Review (Dashboard / Agent Hub / API)

Date: 2026-02-22
Scope: `src/screens/dashboard/`, `src/screens/gateway/`, `src/routes/api/`

## Severity Scale
- `P0`: Critical security/data-loss issue; immediate fix
- `P1`: High severity functional bug / race / broken workflow
- `P2`: Medium severity reliability/UX correctness issue
- `P3`: Low severity polish/edge-case issue

## Findings

### 1. P0 - Unauthenticated privileged endpoints allow remote mission dispatch, gateway reconfiguration, and update execution
- **Files / lines**
  - `src/routes/api/sessions/send.ts:51` (POST handler starts at `:54`, no auth guard)
  - `src/routes/api/gateway-config.ts:24` (POST handler starts at `:25`, no auth guard)
  - `src/routes/api/openclaw-update.ts:127` (POST handler starts at `:127`, no auth guard)
- **Issue**
  - These endpoints perform high-impact actions (send agent messages, write `.env` gateway credentials, trigger gateway update/restart) without `isAuthenticated(request)` checks.
  - In the current frontend, Agent Hub mission dispatch uses `/api/sessions/send`, so this is directly exploitable if the UI is reachable.
- **Impact**
  - Unauthorized users can dispatch prompts/tools to agents, change gateway endpoint/token, or trigger update/restart.
- **Suggested fix**
  - Add a consistent auth guard at the top of each mutating handler:
    - `if (!isAuthenticated(request)) return json({ ok:false, error:'Unauthorized' }, { status: 401 })`
  - Consider CSRF protection for cookie-based auth.
  - Add integration tests for unauthenticated `POST` returning `401`.

### 2. P1 - Additional monitoring/control APIs are unauthenticated and leak internal state/screenshots
- **Files / lines**
  - `src/routes/api/browser/tabs.ts:5`
  - `src/routes/api/browser/screenshot.ts:5`
  - `src/routes/api/browser/status.ts:105`
  - `src/routes/api/gateway/status.ts:5`
  - `src/routes/api/gateway/agents.ts:5`
  - `src/routes/api/gateway/sessions.ts:5`
  - `src/routes/api/gateway/channels.ts:5`
  - `src/routes/api/gateway/nodes.ts:5`
  - `src/routes/api/gateway/usage.ts:5`
- **Issue**
  - These endpoints expose gateway topology/session/channel data and browser screenshots without auth checks.
- **Impact**
  - Information disclosure (sessions/agents/nodes) and screenshot leakage.
- **Suggested fix**
  - Add `isAuthenticated` guards to all internal gateway/browser endpoints (even read-only).
  - If some must remain public, explicitly whitelist and document them.

### 3. P1 - Agent Hub mission dispatch can overlap/race with an already-running mission
- **Files / lines**
  - `src/screens/gateway/agent-hub-layout.tsx:2412`
  - `src/screens/gateway/agent-hub-layout.tsx:2429`
  - `src/screens/gateway/agent-hub-layout.tsx:2481`
  - `src/screens/gateway/agent-hub-layout.tsx:2483`
- **Issue**
  - `dispatchingRef.current` only blocks concurrent launch during the dispatch phase.
  - It is reset in `executeMission(...).finally(...)`, but the mission may still be active/running afterward.
  - There is no `missionActive`/mission-id guard preventing a second launch from replacing local state while prior agent runs continue.
- **Impact**
  - Cross-mission state corruption (`missionTasks`, selected output agent, feed events, approvals) and mixed agent output.
- **Suggested fix**
  - Block `handleCreateMission` when `missionActive` is true unless explicitly “Restart/Replace mission”.
  - Add a mission execution token/cancellation check (compare `missionIdRef.current` before applying async updates).
  - Clear/ignore stale async callbacks after mission stop.

### 4. P2 - Dashboard query functions swallow failures, causing stale/zero data to render as success
- **Files / lines**
  - `src/screens/dashboard/hooks/use-dashboard-data.ts:130`
  - `src/screens/dashboard/hooks/use-dashboard-data.ts:146`
  - `src/screens/dashboard/hooks/use-dashboard-data.ts:347`
- **Issue**
  - `fetchSessionStatus()` returns `{}` on fetch error and `fetchCostTimeseries()` returns `[]` on error instead of throwing.
  - React Query treats these as successful responses, so `isError` remains false.
  - Downstream dashboard status/metrics can show “ready” with empty values rather than error state/retry affordances.
- **Impact**
  - False healthy dashboard state and stale/incorrect metrics.
- **Suggested fix**
  - Throw on network/HTTP failures and let React Query mark the query as error.
  - If fallback data is desired, return typed fallback plus explicit `sourceError` flag and surface it in `DashboardData`.

### 5. P2 - Dashboard connection status shows connected before first health check completes
- **Files / lines**
  - `src/screens/dashboard/hooks/use-dashboard-data.ts:347`
- **Issue**
  - `connected = gatewayStatusQuery.data?.ok ?? !gatewayStatusQuery.isError` defaults to `true` while query is still loading (`data` undefined, `isError` false).
- **Impact**
  - Initial render can incorrectly show connected/healthy state for several seconds.
- **Suggested fix**
  - Gate on loading explicitly, e.g. default `false` (or `unknown`) until first response:
    - `const connected = gatewayStatusQuery.data?.ok === true`
  - Add an `unknown` connection state in UI.

### 6. P2 - Mobile dashboard ignores dismissed alert chip state
- **Files / lines**
  - `src/screens/dashboard/dashboard-screen.tsx:231`
  - `src/screens/dashboard/dashboard-screen.tsx:743`
  - `src/screens/dashboard/dashboard-screen.tsx:819`
- **Issue**
  - `visibleAlerts` correctly filters dismissed chips, but mobile rendering uses `dashboardData.alerts` directly while desktop uses `visibleAlerts`.
- **Impact**
  - Dismissed alerts reappear on mobile, causing inconsistent state across breakpoints.
- **Suggested fix**
  - Use `visibleAlerts` in the mobile branch as well.
  - Optionally add mobile dismiss buttons for parity.

### 7. P2 - Mobile pull-to-refresh uses stale state in touchend and rebinds listeners on every drag frame
- **Files / lines**
  - `src/screens/dashboard/dashboard-screen.tsx:72`
  - `src/screens/dashboard/dashboard-screen.tsx:93`
  - `src/screens/dashboard/dashboard-screen.tsx:113`
- **Issue**
  - `onTouchEnd()` reads `pullDistance` from React state, which may lag the last `touchmove`.
  - The effect depends on `pullDistance`, so listeners are torn down/re-added repeatedly during dragging.
- **Impact**
  - Intermittent missed refresh trigger near threshold and avoidable touch listener churn.
- **Suggested fix**
  - Track pull distance in a ref (`pullDistanceRef`) for touch event logic.
  - Remove `pullDistance` from the effect dependency array.

### 8. P3 - Dashboard micro chart shows non-zero bars for zero-only datasets (misleading scale)
- **Files / lines**
  - `src/screens/dashboard/components/metrics-widget.tsx:109`
  - `src/screens/dashboard/components/metrics-widget.tsx:114`
- **Issue**
  - `Math.max(2, ...)` forces a visible bar even when `point.value === 0`.
- **Impact**
  - Empty/zero periods look like activity.
- **Suggested fix**
  - Render zero-height bars (or 1px faint baseline) for zero values.
  - Add explicit “No activity” state if all values are zero.

### 9. P2 - Mobile `SystemGlance` compact row can overflow with long model names
- **Files / lines**
  - `src/screens/dashboard/components/system-glance.tsx:33`
  - `src/screens/dashboard/components/system-glance.tsx:58`
- **Issue**
  - The model pill has no `max-w-*`/`truncate` and sits in a single row with multiple stats.
- **Impact**
  - Horizontal compression/overflow on smaller mobile widths or long model labels.
- **Suggested fix**
  - Add `max-w-* truncate` to the model badge and/or hide it below a breakpoint.
  - Consider moving model text to a second row in compact mode.

### 10. P2 - Agent Hub "auto-switch to Mission tab" logic switches to the Office tab instead
- **Files / lines**
  - `src/screens/gateway/agent-hub-layout.tsx:2471`
  - `src/screens/gateway/agent-hub-layout.tsx:2472`
- **Issue**
  - Comment says auto-switch to Mission tab, but code executes `setActiveTab('office')`.
- **Impact**
  - Users land on the wrong tab after launch and may think mission dispatch failed / output is missing.
- **Suggested fix**
  - Change to `setActiveTab('mission')` (or update comment/UX intentionally if office is desired).

### 11. P2 - Tab switching unmounts views and resets local tab/pin state in Live Activity panel
- **Files / lines**
  - `src/screens/gateway/agent-hub-layout.tsx:2831`
  - `src/screens/gateway/agent-hub-layout.tsx:2847`
  - `src/screens/gateway/components/live-activity-panel.tsx:269`
  - `src/screens/gateway/components/live-activity-panel.tsx:270`
- **Issue**
  - Main tab content uses conditional rendering (`activeTab === ... ? ... : null`), which unmounts inactive tab trees.
  - `LiveActivityPanel` keeps `tab` and `pinnedOutput` in local state, so switching away/back resets to defaults.
- **Impact**
  - State loss when switching tabs (selected sub-tab, pin preference, scroll position in panel subtree).
- **Suggested fix**
  - Preserve tab panels in DOM and hide with CSS, or lift panel state to `agent-hub-layout`.
  - Persist critical UI state (`tab`, `pinnedOutput`) in parent/store.

### 12. P2 - Live Activity overflow menu is clipped by scroll container
- **Files / lines**
  - `src/screens/gateway/components/live-activity-panel.tsx:179`
  - `src/screens/gateway/components/live-activity-panel.tsx:370`
- **Issue**
  - Agent card menu dropdown is `absolute` inside a list that lives in an `overflow-y-auto` container.
  - Menus near the bottom of the panel can be clipped.
- **Impact**
  - Warden actions (pause/steer/kill) become partially inaccessible.
- **Suggested fix**
  - Render menu in a portal (`document.body`) with anchored positioning.
  - Or allow visible overflow on the container and manage z-index carefully.

### 13. P2 - Keyboard Space shortcut conflicts with focused buttons/interactive controls
- **Files / lines**
  - `src/screens/gateway/agent-hub-layout.tsx:1469`
  - `src/screens/gateway/agent-hub-layout.tsx:1475`
  - `src/screens/gateway/agent-hub-layout.tsx:1489`
- **Issue**
  - Space toggles mission pause/resume globally unless target is `INPUT`, `TEXTAREA`, or contentEditable.
  - Native keyboard activation on focused `BUTTON`, `SELECT`, etc. can be hijacked.
- **Impact**
  - Keyboard navigation triggers unintended pause/resume instead of activating the focused control.
- **Suggested fix**
  - Exclude all interactive targets (`button`, `select`, `a`, `[role=button]`, etc.) using `closest(...)`.
  - Consider scoping shortcut handling to the Mission view.

### 14. P2 - Agent activity SSE stream pruner can drop quiet active streams prematurely
- **Files / lines**
  - `src/screens/gateway/agent-hub-layout.tsx:1391`
  - `src/screens/gateway/agent-hub-layout.tsx:1406`
  - `src/screens/gateway/agent-hub-layout.tsx:1429`
  - `src/screens/gateway/agent-hub-layout.tsx:1441`
- **Issue**
  - `lastAt` is only refreshed on `chunk` and `tool` events.
  - Streams are force-closed after 30s of no activity, even if the agent is still running but quiet (or only emits other event types).
- **Impact**
  - Live activity text can stop updating / flap during long-running tasks.
- **Suggested fix**
  - Refresh `lastAt` on `message`, `done`, and `open/error` transitions.
  - Prefer explicit stream health from SSE `error`/reconnect logic over silence-based pruning.

### 15. P3 - Agent output SSE client has no error handler / reconnect UI state
- **Files / lines**
  - `src/screens/gateway/components/agent-output-panel.tsx:166`
  - `src/screens/gateway/components/agent-output-panel.tsx:254`
- **Issue**
  - The panel opens an `EventSource` but does not listen for `error` events or surface disconnect/reconnect state.
- **Impact**
  - Output pane can silently stall with no visible indication.
- **Suggested fix**
  - Add `source.onerror` handling to set connection state and optionally retry/backoff.
  - Show a compact “stream disconnected / retrying” banner in the panel.

### 16. P2 - Browser helper routes lack try/catch and can return framework 500 instead of stable JSON
- **Files / lines**
  - `src/routes/api/browser/tabs.ts:8`
  - `src/routes/api/browser/screenshot.ts:8`
- **Issue**
  - Both handlers await server calls without wrapping in `try/catch`.
- **Impact**
  - Errors can escape as framework/default error responses, breaking frontend parsing and response shape expectations.
- **Suggested fix**
  - Wrap handler bodies in `try/catch` and return a consistent JSON error shape (`{ ok:false, error }`).

### 17. P2 - API response formats are inconsistent across related gateway/browser endpoints
- **Files / lines**
  - `src/routes/api/gateway/agents.ts:14` (`{ ok, data }`)
  - `src/routes/api/gateway/status.ts:13` (`{ connected, ok, ...data }`)
  - `src/routes/api/browser/tabs.ts:10` (raw payload passthrough)
  - `src/routes/api/browser/status.ts:111` (normalized payload without `ok`)
- **Issue**
  - Related endpoints return different success/error envelopes and field conventions.
- **Impact**
  - Frontend code requires ad hoc parsing; increases null handling bugs and inconsistent UI error behavior.
- **Suggested fix**
  - Standardize on one envelope (`{ ok, data, error }`) for all JSON API routes.
  - Keep legacy compatibility via additive fields during migration.

### 18. P2 - Several gateway/browser API routes lack explicit timeout handling for `gatewayRpc` calls
- **Files / lines**
  - `src/routes/api/gateway/status.ts:10`
  - `src/routes/api/gateway/agents.ts:10`
  - `src/routes/api/gateway/sessions.ts:10`
  - `src/routes/api/gateway/channels.ts:10`
  - `src/routes/api/gateway/nodes.ts:10`
  - `src/routes/api/gateway/usage.ts:11`
  - `src/routes/api/gateway/usage.ts:15`
  - `src/routes/api/browser/status.ts:110`
- **Issue**
  - These calls rely on implicit/default `gatewayRpc` behavior and do not pass request-specific timeouts.
- **Impact**
  - Hung gateway RPCs can stall API requests and frontend refresh loops.
- **Suggested fix**
  - Pass route-appropriate `timeoutMs` for all `gatewayRpc` calls.
  - Return `504`/timeout-specific JSON errors to support retry UI.

### 19. P1 - `gateway-config` POST has request validation gaps and `.env` injection/corruption risk
- **Files / lines**
  - `src/routes/api/gateway-config.ts:27`
  - `src/routes/api/gateway-config.ts:47`
  - `src/routes/api/gateway-config.ts:61`
- **Issue**
  - `url` and `token` are written directly into `.env` lines with no runtime type validation, newline stripping, or format checks.
  - Malformed input (including newline characters) can corrupt `.env` or inject extra variables.
- **Impact**
  - Broken configuration, unexpected env values, possible privilege escalation via env injection.
- **Suggested fix**
  - Validate payload types strictly (`typeof === 'string'`).
  - Reject `\r`/`\n` and control chars; trim and bound length.
  - Validate `url` with `new URL(...)` and allowed protocols (`ws`, `wss`, optionally `http/https` if intended).
  - Escape or quote values when writing `.env`.

### 20. P2 - `chat-abort` treats invalid JSON/request shape as server error (500) instead of client error (400)
- **Files / lines**
  - `src/routes/api/chat-abort.ts:20`
  - `src/routes/api/chat-abort.ts:26`
- **Issue**
  - `await request.json()` is not guarded with `.catch(...)`; malformed JSON throws and falls into generic `500`.
  - No validation that body is an object or that `sessionKey` is a string.
- **Impact**
  - Client-side request bugs look like server failures; harder retry logic and observability.
- **Suggested fix**
  - Parse with `.catch(() => null)` and return `400` for invalid JSON.
  - Validate shape and normalize `sessionKey`.

## Notes / Residual Risks
- I did not execute the frontend or run automated tests in this pass; findings are from static code review.
- I focused on the requested surfaces and prioritized correctness/security over style.

## Recommended Next Actions
1. Fix the `P0` auth gaps first (`/api/sessions/send`, `/api/gateway-config`, `/api/openclaw-update`), then add regression tests.
2. Add a shared API utility for auth + error envelope + timeout handling to eliminate repeated route inconsistencies.
3. Patch Agent Hub mission lifecycle guards (single active mission + cancellation token) before expanding mission features.
