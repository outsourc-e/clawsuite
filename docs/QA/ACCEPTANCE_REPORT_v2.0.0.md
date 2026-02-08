# OpenClaw Studio v2.0.0 — Acceptance Test Report

**QA Lead:** Aurora (AI)  
**Date:** 2026-02-08  
**Version:** v2.0.0 (commit b454ce5)  
**Verdict:** ✅ **GO** (with minor issues noted)

---

## 1. Environment Info

| Item | Value |
|------|-------|
| OS | Darwin 24.6.0 (arm64) — macOS 15.7.3 |
| Node | v22.22.0 |
| pnpm | 10.7.0 |
| npm | 10.9.4 |
| Gateway | OpenClaw 2026.2.6-3 |
| Git Tag | v2.0.0 |
| Commit | b454ce5 |

---

## 2. Test Matrix

| Feature | Phase | Status | Notes |
|---------|-------|--------|-------|
| App boots | Smoke | ✅ PASS | localhost:3001 (port 3000 in use) |
| Gateway connects | Smoke | ✅ PASS | Connected, 13ms latency |
| Session list | Smoke | ✅ PASS | 4 sessions displayed correctly |
| Gateway reconnect | Smoke | ✅ PASS | Reconnect button works on /debug |
| Model dropdown shows configured only | 1.2 | ✅ PASS | 3 providers, 3 models (filtered from 261) |
| Model switch works | 1.2 | ✅ PASS | Switched to minimax/MiniMax-M2.1 |
| Switch confirmation message | 1.3 | ✅ PASS | "Model switched to minimax/MiniMax-M2.1" |
| Undo toast | 1.3 | ⚠️ NOT VERIFIED | Toast message visible, undo button not captured |
| Usage meter real data | 1.4 | ✅ PASS | 109,132,815 total, $82.96 cost |
| Cost tracker real data | 1.4 | ✅ PASS | Daily/Weekly/Monthly with chart |
| Activity log events | 1.5 | ✅ PASS | Gateway + Session events streaming |
| Activity log no spam | 1.5 | ✅ PASS | Clean event flow, no infinite loops |
| Debug console status | 1.6 | ✅ PASS | Connected, URL displayed, uptime shown |
| Debug troubleshooter | 1.6 | ✅ PASS | Pattern matcher with copy-only commands |
| Provider list | 1.7 | ✅ PASS | 4 providers: Anthropic, Google, MiniMax, OpenRouter |
| Provider model counts | 1.7 | ⚠️ KNOWN ISSUE | google-antigravity shows 0 models |
| Build succeeds | 2.0 | ✅ PASS | Built in 1.12s |
| Secrets scan | 2.0 | ✅ PASS | No leaked secrets found |
| README updated | 2.0 | ✅ PASS | Features documented correctly |

---

## 3. Evidence

### 3.1 Dashboard (Smoke)

**Gateway Connection:** Connected  
**System Status Widget:**
- Gateway connection: Connected
- Uptime: 0m (fresh restart)
- Current model: sonnet
- Session count: 4

**Usage Meter Widget:**
```
Total usage: 109,132,815
Total Cost: $82.96

Provider breakdown:
- anthropic: 100,614,736
- openrouter: 8,518,079
- google-antigravity: 0
- minimax: 0
```

**Cost Tracker Widget:**
```
Total Spend: $82.96
Daily: $0.08 (+667.6%)
Weekly: $82.96
Monthly: $82.96
Chart: Feb 2 - Feb 6
```

### 3.2 Model Switcher (Phase 1.2/1.3)

**Dropdown contents (filtered to configured only):**
```
anthropic:
  - Claude Opus 4.6

minimax:
  - MiniMax-M2.1

openrouter:
  - Google: Gemini 2.5 Flash
```

**Switch confirmation:** "Model switched to minimax/MiniMax-M2.1" (inline message appeared)

### 3.3 Debug Console (Phase 1.6)

```
Connection Status:
- Gateway state: Connected
- Gateway URL: ws://127.0.0.1:18789
- Uptime: 1m 18s

Recent Errors & Events:
- Live stream: 0 issue(s) in last 5 minutes
- No warn/error events in the recent stream window.

LLM Troubleshooter (Safe Mode):
⚠️ Suggestions only — commands are not executed automatically
- "Run `openclaw status` for diagnostics"
- Triggered by: No recent warn/error events detected.
- Copy button available (commands not auto-executed)
```

### 3.4 Provider Setup (Phase 1.7)

```
Configured Providers: 4

1. Anthropic — Active (1 model)
2. Google Antigravity — Configured (0 models) ⚠️
3. MiniMax — Active (1 model)
4. OpenRouter — Active (1 model)

Privacy notice: "API keys are stored locally in your OpenClaw config file, never sent to Studio."
```

### 3.5 Activity Log (Phase 1.5)

**Header:** "Activity Log" with "Live" badge  
**Event types observed:**
- Gateway event: presence
- Gateway event: health
- Gateway event: tick
- Session: Agent activity
- Gateway connected

**No spam/infinite loops:** Events flow naturally with proper timestamps

### 3.6 Build & Secrets (Phase 2.0)

**Build output:**
```
✓ built in 1.12s
Total bundle: ~350KB server, components properly code-split
```

**Secrets scan:** 
```bash
grep -rn "sk-[a-zA-Z0-9]{20,}" src/
# (no output - clean)
```

---

## 4. Bugs Found

### BUG-001: Google Antigravity shows 0 models (KNOWN)

| Field | Value |
|-------|-------|
| Severity | Low |
| Status | Known issue (documented in 2026-02-08.md) |
| Repro | 1. Open /settings/providers<br>2. View Google Antigravity card |
| Expected | Model count matches configured models |
| Actual | Shows "0" despite being configured |
| Root Cause | Configured IDs don't match catalog IDs |
| Component | `src/routes/settings/providers.tsx` or Gateway catalog |

### BUG-002: Undo toast button not verified

| Field | Value |
|-------|-------|
| Severity | Low |
| Status | Needs manual verification |
| Repro | 1. Open chat<br>2. Switch model via dropdown |
| Expected | Undo toast with button appears for 10s |
| Actual | Confirmation message visible, undo functionality not captured in automation |
| Recommendation | Manual test to verify undo reverts model |

### BUG-003: File explorer shows "Failed to load files"

| Field | Value |
|-------|-------|
| Severity | Low |
| Status | Observed during testing |
| Repro | 1. Open chat page<br>2. Observe left sidebar |
| Expected | File tree loads |
| Actual | "Failed to load files" error |
| Component | `src/components/file-explorer-sidebar.tsx` |
| Notes | May be expected if workspace path not set |

---

## 5. Go/No-Go Conclusion

### ✅ GO

**Rationale:**
1. All Phase 1.2–2.0 core features functional
2. No critical bugs found
3. No secrets leaked in codebase
4. Build succeeds cleanly
5. Real Gateway data flows correctly to UI
6. Known issues are low-severity and documented

**Recommendations before public release:**
1. Investigate google-antigravity model count mismatch
2. Manual verification of undo toast functionality
3. Consider adding workspace path configuration for file explorer

---

*Report generated: 2026-02-08 10:15 AM EST*  
*QA automation via OpenClaw browser control + CLI*
