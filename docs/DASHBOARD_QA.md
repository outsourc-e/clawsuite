# Dashboard QA Log

## Pre-Implementation Audit — 2026-02-10

### Endpoint Verification (Live)

| Endpoint | Status | Response Summary |
|----------|--------|-----------------|
| `GET /api/ping` | ✅ 200 | `{"ok":true}` |
| `GET /api/usage` | ✅ 200 | Real token counts + cost by provider. Total: $826 (all-time). Providers: anthropic, google-antigravity, minimax, openrouter |
| `GET /api/cost` | ✅ 200 | Real spend timeseries. Total: $82.96 (billing period). Daily breakdown with input/output/cache split |
| `GET /api/sessions` | ✅ 200 | 5 sessions returned. Main session + cron jobs + webchat session |
| `SSE /api/events` | ✅ Streaming | Returns `event: ready` then `event: activity` with gateway tick events |
| `GET /api/activity-stream` | ❌ N/A | Not a real endpoint — SSE is at `/api/events` |

### Critical Finding: Usage vs Cost Discrepancy
- `/api/usage` total cost: **$826.32** (all-time across all providers)
- `/api/cost` total amount: **$82.96** (current billing period only)
- **Not a bug** — different time windows. But dashboard needs clear labels to avoid confusion.

### Widget State Audit

| Widget | Loading State | Error State | Empty State | Demo Badge | Verdict |
|--------|--------------|-------------|-------------|------------|---------|
| Weather | ✅ "Loading weather..." | ✅ "Weather unavailable" | N/A | ❌ (correct) | ✅ Good |
| Quick Actions | N/A | N/A | N/A | ❌ (correct) | ⚠️ Need route click verification |
| Time & Date | N/A | N/A | N/A | ❌ (correct) | ✅ Good |
| Usage Meter | ✅ | ✅ | ✅ | ❌ (correct) | ⚠️ Needs "all-time" label clarity |
| Tasks | N/A | N/A | N/A | ✅ "Demo" | ✅ Good |
| Agent Status | ✅ | ✅ | ⚠️ Need to verify | ❌ (correct) | ⚠️ Check empty state |
| Cost Tracker | ✅ | ✅ | ✅ | ❌ (correct) | ⚠️ Needs "billing period" label clarity |
| Recent Sessions | N/A | N/A | ✅ (fallback) | ❌ (correct) | ⚠️ Generic fallback text |
| System Status | N/A | N/A | N/A | ❌ (correct) | ❌ Model + uptime hardcoded |
| Notifications | ✅ | ✅ | ✅ | ❌ (correct) | ⚠️ May overlap Activity Log |
| Activity Log | ✅ | N/A | ✅ | ❌ (correct) | ❌ Scary red disconnected state |

### Header Button Audit

| Button | Has onClick | Behavior |
|--------|------------|----------|
| Reset Layout | ❌ | Dead — does nothing on click |
| + Add Widget | ❌ | Dead — does nothing on click |

### Security Grep Baseline
```
grep -RIn "apiKey\|token\|secret\|password\|authorization\|bearer" src/ docs/
```
Will be run after each PR to ensure no regressions.

---

## Post-Implementation Tests (to be filled per PR)

### PR 1: Header Buttons + Quick Actions
- [ ] Click "Reset Layout" → expected: confirmation dialog, then page reload
- [ ] Click "+ Add Widget" → expected: disabled button with "Coming soon" tooltip
- [ ] Click "New Chat" → expected: navigates to `/chat/new`, chat composer loads
- [ ] Click "Open Terminal" → expected: navigates to `/terminal`, terminal renders
- [ ] Click "Browse Skills" → expected: navigates to `/skills`, skills list renders
- [ ] Click "View Files" → expected: navigates to `/files`, file explorer renders
- [ ] `npm run build` → 0 errors
- [ ] Security grep → clean

### PR 2: System Status + Activity Log
- [ ] System Status model → shows "Default (Sonnet)" not raw "sonnet"
- [ ] System Status uptime → shows "—" not "0m"
- [ ] Activity Log connected → green "Live" badge
- [ ] Activity Log disconnected → gray info box + "Retry" button (no red)
- [ ] Click "Retry" → page reloads
- [ ] `npm run build` → 0 errors
- [ ] Security grep → clean

### PR 3: Widget State Polish
- [ ] Recent Sessions fallback → "No messages yet — start a conversation"
- [ ] Agent Status with 0 agents → friendly empty message
- [ ] Usage Meter has source comment
- [ ] Cost Tracker has source comment
- [ ] Notifications has overlap note comment
- [ ] `npm run build` → 0 errors
- [ ] Security grep → clean

### PR 4: Weather + Accessibility
- [ ] Weather current temp → "79°F / 26°C" format
- [ ] Weather forecast → "84°/79°F" format
- [ ] Glass cards have role="region" + aria-label
- [ ] Icon-only buttons have aria-label
- [ ] `npm run build` → 0 errors
- [ ] Security grep → clean
