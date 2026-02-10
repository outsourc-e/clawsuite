# Dashboard Finalization Plan
**Branch:** `phaseD1-dashboard-hardening`  
**Created:** 2026-02-10  
**Scope:** Dashboard hardening, wiring, and polish only. No new features.

---

## 1. Dashboard Inventory Table

| # | Widget | Component | File Path | Data Source | Endpoint Verified? | Current Behavior | Gaps/Bugs | Priority |
|---|--------|-----------|-----------|-------------|-------------------|------------------|-----------|----------|
| 1 | Weather | `WeatherWidget` | `src/screens/dashboard/components/weather-widget.tsx` | `wttr.in` (external API) | ✅ Live | Fetches real weather, shows location/temp/forecast. Loading + error states exist. | Celsius only — no °F for US users | P1 |
| 2 | Quick Actions | `QuickActionsWidget` | `src/screens/dashboard/components/quick-actions-widget.tsx` | Static config (4 items) passed as props | N/A | 4 buttons: New Chat→`/new`, Terminal→`/terminal`, Skills→`/skills`, Files→`/files`. All routes exist. | Need to verify each route renders without crash. `/new` redirects to `/chat/new` — good. | P0 |
| 3 | Time & Date | `TimeDateWidget` | `src/screens/dashboard/components/time-date-widget.tsx` | `Date` + `Intl.DateTimeFormat` (client-side) | N/A | Shows live clock with timezone and date. Auto-updates. | None — clean widget | — |
| 4 | Usage Meter | `UsageMeterWidget` | `src/screens/dashboard/components/usage-meter-widget.tsx` | `GET /api/usage` | ✅ Returns real data | Shows token breakdown by provider, donut chart, cost total. Loading + error + empty states. | Need to verify consistency with Cost Tracker | P1 |
| 5 | Tasks (Kanban) | `TasksWidget` | `src/screens/dashboard/components/tasks-widget.tsx` | `localStorage` + hardcoded seed data | N/A | Kanban board with fake tasks (Ari, Lina, Kai, etc.). Has `badge="Demo"`. | Demo badge ✅ correct. Tasks are fake but clearly labeled. | — |
| 6 | Agent Status | `AgentStatusWidget` | `src/screens/dashboard/components/agent-status-widget.tsx` | `GET /api/sessions` | ✅ Returns real data | Shows running sessions with model, runtime, progress bar. | Need to verify empty state (0 agents). | P1 |
| 7 | Cost Tracker | `CostTrackerWidget` | `src/screens/dashboard/components/cost-tracker-widget.tsx` | `GET /api/cost` | ✅ Returns real data (timeseries) | Shows daily/weekly/monthly breakdown with sparkline chart. | Different endpoint than Usage Meter (`/api/cost` vs `/api/usage`) — verify totals align | P1 |
| 8 | Recent Sessions | `RecentSessionsWidget` | `src/screens/dashboard/components/recent-sessions-widget.tsx` | Props from parent (via `GET /api/sessions`) | ✅ | Shows top 5 sessions with title/preview/timestamp. Click navigates to chat. Falls back to 2 placeholder sessions. | Fallback preview text generic ("No preview available yet.") | P1 |
| 9 | System Status | `SystemStatusWidget` | `src/screens/dashboard/components/system-status-widget.tsx` | Props from parent (gateway ping + session count) | ✅ Partial | Shows gateway connected/disconnected (real), session count (real). "Open Debug Console" → `/debug`. | **Model hardcoded "sonnet"**. **Uptime always 0m** (gateway doesn't expose). | P0 |
| 10 | Notifications | `NotificationsWidget` | `src/screens/dashboard/components/notifications-widget.tsx` | `GET /api/sessions` (derives notifications from session timestamps) | ✅ | Shows session start/update events chronologically. | May overlap with Activity Log content | P1 |
| 11 | Activity Log | `ActivityLogWidget` | `src/screens/dashboard/components/activity-log-widget.tsx` | SSE `GET /api/events` via `useActivityEvents` | ✅ SSE streams events | Shows live/disconnected badge. Streams gateway events. "View all" → `/activity`. | **Disconnected state = raw red "Disconnected" text** — needs friendly treatment | P0 |

### Header Elements

| Element | Component | File | Wired? | Behavior | Gaps | Priority |
|---------|-----------|------|--------|----------|------|----------|
| "Studio Overview" badge | Inline in `DashboardScreen` | `dashboard-screen.tsx` | N/A | Decorative | None | — |
| "Reset Layout" button | Inline `<Button>` | `dashboard-screen.tsx` L170 | ❌ **NO onClick** | Dead button | **No handler at all** | P0 |
| "+ Add Widget" button | Inline `<Button>` | `dashboard-screen.tsx` L173 | ❌ **NO onClick** | Dead button | **No handler at all** | P0 |

### Shared Components

| Component | File | Purpose |
|-----------|------|---------|
| `DashboardGlassCard` | `src/screens/dashboard/components/dashboard-glass-card.tsx` | Card wrapper: icon, title, badge, description, children |
| `widget-chrome.tsx` | `src/screens/dashboard/components/widget-chrome.tsx` | Unused drag/resize chrome (from earlier experiment) |
| `dashboard-types.ts` | `src/screens/dashboard/components/dashboard-types.ts` (no .tsx) | Shared types |

---

## 2. Production-Ready Acceptance Criteria

### P0 Gates (Must Pass)

- [ ] **P0-1**: "Reset Layout" button — wire to meaningful action OR disable with "Coming soon" tooltip
- [ ] **P0-2**: "+ Add Widget" button — wire to meaningful action OR disable with "Coming soon" tooltip
- [ ] **P0-3**: System Status "Current model" — read from gateway status or show "Unknown" (not hardcoded "sonnet")
- [ ] **P0-4**: System Status "Uptime" — hide row or show "—" if 0 (don't display "0m")
- [ ] **P0-5**: Activity Log disconnected state — friendly gray message + retry button, not scary red box
- [ ] **P0-6**: Quick Actions — click-test all 4: `/new`, `/terminal`, `/skills`, `/files` render without errors
- [ ] **P0-7**: No secrets in UI/exports/diagnostics — `grep -RIn "apiKey\|token\|secret\|password\|authorization\|bearer" src server docs` clean
- [ ] **P0-8**: `npm run build` passes with zero errors

### P1 Gates (Should Pass)

- [ ] **P1-1**: Usage Meter + Cost Tracker totals — verify they don't contradict (different endpoints, same underlying data)
- [ ] **P1-2**: Recent Sessions — improve fallback preview copy ("No messages yet" not "No preview available yet.")
- [ ] **P1-3**: Weather — add °F alongside °C for US users
- [ ] **P1-4**: Notifications vs Activity Log — confirm not showing same items
- [ ] **P1-5**: Agent Status — verify empty state (0 agents) shows friendly message
- [ ] **P1-6**: All widgets — consistent loading skeleton / empty / error states
- [ ] **P1-7**: Dashboard loads < 2s on warm dev build
- [ ] **P1-8**: "Demo" badges used consistently — only on Tasks (the only mocked widget)

### P2 Gates (Nice to Have)

- [ ] **P2-1**: All interactive elements have `aria-label` attributes
- [ ] **P2-2**: Keyboard focus rings visible on all buttons/cards
- [ ] **P2-3**: Consistent tooltip copy on hover states
- [ ] **P2-4**: Activity Log disconnected: "Open Debug Console" button
- [ ] **P2-5**: Dashboard header breadcrumb or nav context

---

## 3. PR Breakdown

### PR 1: Header Buttons + Quick Actions Wiring
**Files:** `dashboard-screen.tsx`, `quick-actions-widget.tsx`
**Scope:**
- Wire "Reset Layout" — `window.location.reload()` with confirmation toast
- Wire "+ Add Widget" — disabled state with "Coming soon" tooltip (no widget picker in this phase)
- Smoke-test all 4 Quick Action routes render
**Test steps:**
1. Click "Reset Layout" → page reloads
2. Click "+ Add Widget" → tooltip appears, no crash
3. Click each Quick Action → correct route renders
4. `npm run build` passes
5. Security grep clean

### PR 2: System Status + Activity Log Fix
**Files:** `system-status-widget.tsx`, `activity-log-widget.tsx`
**Scope:**
- System Status: show "Default (Sonnet)" for model, show "—" for 0 uptime
- Activity Log: replace red disconnected banner with neutral gray info box + retry button
**Test steps:**
1. Load dashboard with gateway connected → System Status shows "Connected", real session count
2. Model shows "Default (Sonnet)" — honest about being default
3. Uptime shows "—" instead of "0m"
4. Disconnect gateway → Activity Log shows friendly gray message with "Retry" button
5. `npm run build` passes

### PR 3: Widget State Polish
**Files:** `recent-sessions-widget.tsx`, `agent-status-widget.tsx`, `usage-meter-widget.tsx`, `cost-tracker-widget.tsx`, `notifications-widget.tsx`
**Scope:**
- Recent Sessions: fallback text → "No messages yet — start a conversation"
- Agent Status: verify/fix empty state message
- Usage Meter + Cost Tracker: add comment documenting different endpoints, verify no contradictions
- Notifications: add comment re: overlap with Activity Log
**Test steps:**
1. Load dashboard with 0 sessions → Recent Sessions shows friendly fallback
2. Load with 0 active agents → Agent Status shows clean empty state
3. Verify Usage Meter total ≈ Cost Tracker total
4. `npm run build` passes

### PR 4: Weather °F + Accessibility (Optional)
**Files:** `weather-widget.tsx`, `dashboard-glass-card.tsx`, all widget files
**Scope:**
- Weather: dual °F/°C display
- Glass card: add `role="region"` + `aria-label`
- All buttons: ensure `aria-label` on icon-only buttons
**Test steps:**
1. Weather shows "79°F / 26°C" format
2. Screen reader reads widget titles
3. `npm run build` passes

---

## 4. Codex Agent Prompts

### Agent A — PR 1: Header Buttons + Quick Actions
```
Working directory: /Users/aurora/.openclaw/workspace/webclaw-ui
Branch: phaseD1-dashboard-hardening

In src/screens/dashboard/dashboard-screen.tsx:
1. Find the "Reset Layout" Button (around line 170). It has no onClick. Add: onClick={() => { if (window.confirm('Reset dashboard to default layout?')) window.location.reload() }}
2. Find the "+ Add Widget" Button (around line 173). It has no onClick. Change it to: <Button size="sm" variant="outline" disabled title="Widget picker coming soon"><HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={1.5} /><span>Add Widget</span></Button>
3. Verify all 4 Quick Action routes exist by checking these files exist and export a Route: src/routes/new.tsx, src/routes/terminal.tsx, src/routes/skills.tsx, src/routes/files.tsx

After changes:
- Run: npm run build (paste full output)
- Run: grep -RIn "apiKey\|token\|secret\|password\|authorization\|bearer" src/ docs/ (paste output, should be clean or only type definitions)
- Commit with message: "fix: wire Reset Layout + disable Add Widget with Coming Soon"
```

### Agent B — PR 2: System Status + Activity Log
```
Working directory: /Users/aurora/.openclaw/workspace/webclaw-ui
Branch: phaseD1-dashboard-hardening

1. In src/screens/dashboard/components/system-status-widget.tsx:
   - Find the "Current model" display row. The value comes from props `status.currentModel`. If it equals "sonnet", display "Default (Sonnet)" instead.
   - Find the "Uptime" display row. If `status.uptimeSeconds` is 0, display "—" instead of calling formatUptime(0) which returns "0m".

2. In src/screens/dashboard/components/activity-log-widget.tsx:
   - Find the disconnected state block (the red banner: className contains "border-red-200 bg-red-100/60"). Replace it with:
     <div className="mb-2 rounded-lg border border-primary-200 bg-primary-100/60 px-3 py-2.5 text-xs text-primary-600">
       <p className="font-medium">Gateway disconnected</p>
       <p className="mt-0.5">Reconnect to see live events.</p>
       <button onClick={() => window.location.reload()} className="mt-1.5 text-xs font-medium text-primary-800 underline hover:text-primary-900">Retry</button>
     </div>

After changes:
- Run: npm run build (paste full output)
- Run: grep -RIn "apiKey\|token\|secret\|password\|authorization\|bearer" src/ docs/
- Commit with message: "fix: system status truthfulness + friendly activity log disconnected state"
```

### Agent C — PR 3: Widget State Polish
```
Working directory: /Users/aurora/.openclaw/workspace/webclaw-ui
Branch: phaseD1-dashboard-hardening

1. In src/screens/dashboard/components/recent-sessions-widget.tsx:
   - Find the text "No preview available yet." and replace with "No messages yet — start a conversation"

2. In src/screens/dashboard/components/agent-status-widget.tsx:
   - Find the empty state (when 0 agents are active). Ensure it shows a friendly message like "No active agents" in a styled container, not a blank div.

3. In src/screens/dashboard/components/usage-meter-widget.tsx:
   - Add a comment at the top: // Data source: GET /api/usage — token counts + cost breakdown by provider

4. In src/screens/dashboard/components/cost-tracker-widget.tsx:
   - Add a comment at the top: // Data source: GET /api/cost — daily/weekly/monthly spend timeseries (different endpoint than usage-meter)

5. In src/screens/dashboard/components/notifications-widget.tsx:
   - Add a comment at the top: // Data source: GET /api/sessions — derives notifications from session start/update times. Note: some overlap with activity-log-widget which uses SSE /api/events.

After changes:
- Run: npm run build (paste full output)
- Run: grep -RIn "apiKey\|token\|secret\|password\|authorization\|bearer" src/ docs/
- Commit with message: "fix: widget state polish — empty states + data source documentation"
```

### Agent D — PR 4: Weather °F + Accessibility
```
Working directory: /Users/aurora/.openclaw/workspace/webclaw-ui
Branch: phaseD1-dashboard-hardening

1. In src/screens/dashboard/components/weather-widget.tsx:
   - Add a helper: function cToF(c: number): number { return Math.round((c * 9) / 5 + 32) }
   - In the current temperature display, change from "{weather.temperatureC}C" to "{cToF(weather.temperatureC)}°F / {weather.temperatureC}°C"
   - In the forecast day display, change from "{day.highC}C/{day.lowC}C" to "{cToF(day.highC)}°/{cToF(day.lowC)}°F"

2. In src/screens/dashboard/components/dashboard-glass-card.tsx:
   - On the outer <article> element, add: role="region" aria-label={title}

3. In all widget component files in src/screens/dashboard/components/:
   - Find any <Button> or <button> that contains only an icon (no visible text). Add an appropriate aria-label prop.

After changes:
- Run: npm run build (paste full output)
- Run: grep -RIn "apiKey\|token\|secret\|password\|authorization\|bearer" src/ docs/
- Commit with message: "fix: weather fahrenheit + accessibility aria-labels"
```

---

## 5. Top 5 Highest-Risk Items

| # | Risk | Why It's Risky | How to Test |
|---|------|---------------|-------------|
| 1 | **Dead header buttons (Reset Layout + Add Widget)** | Most visible interactive elements — first thing users click. Makes dashboard feel broken. | Click both buttons, verify behavior (toast/disabled) |
| 2 | **System Status lies (hardcoded model + 0 uptime)** | Users distrust entire dashboard if one card is obviously wrong | Load dashboard, check model shows honest value, uptime shows "—" |
| 3 | **Activity Log always "Disconnected" on cold start** | Scary red banner on first load before SSE connects — looks broken | Load dashboard fresh, watch Activity Log transition from loading → connected |
| 4 | **Usage Meter vs Cost Tracker contradicting** | Two widgets showing cost data from different endpoints — could show different totals | Compare: Usage Meter total cost vs Cost Tracker total. `/api/usage` returns $826 total, `/api/cost` returns $82. **These ARE different!** Usage = all-time, Cost = current billing period. Need labels to clarify. |
| 5 | **Quick Action `/new` → `/chat/new` session creation** | If session creation fails or hangs, user is stuck on blank page | Click "New Chat", verify chat screen loads with empty composer ready |

---

## 6. Risks + Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Usage ($826) vs Cost ($82) totals look contradictory | **High** | They track different things (all-time vs billing period). Add clear labels: "All-time usage" vs "Current period spend" |
| SSE may take 1-2s to connect → brief "Disconnected" flash | Medium | Add brief loading state before showing disconnected (or delay disconnected badge by 3s) |
| `widget-chrome.tsx` is unused dead code | Low | Remove in cleanup PR or leave — doesn't affect dashboard |
| Tasks widget fake data could mislead | Low | Demo badge is already present — sufficient |
