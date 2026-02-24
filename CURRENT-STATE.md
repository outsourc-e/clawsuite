# CURRENT-STATE.md — ClawSuite Sprint State
## Updated: 2026-02-23 20:29 EST

## Current: feat/clean-sprint @ 6724108 ✅ CONFIRMED WORKING

## What Works
- Mission creation → agent spawn → LIVE OUTPUT STREAMING ✅
- Start / Pause / Stop buttons ✅
- Live Feed with activity/tasks/agents/system tabs ✅
- AgentOutputPanel (SSE via /api/chat-events?sessionKey=<key>) ✅
- Mission cards with metrics ✅
- Agent spawn via sessions.patch + chat.send fallback ✅
- Mission completion detection + 26k tokens generated ✅
- 3 themes (paper-light, ops-dark, premium-dark) ✅

## How Live Output Works (DO NOT BREAK THIS)
1. spawnAgentSession creates session via POST /api/sessions → sessions.patch
2. dispatchToAgent sends task via POST /api/sessions/send → sessions.send (fallback to chat.send)
3. AgentOutputPanel opens SSE to /api/chat-events?sessionKey=<agentSessionKey>
4. SSE streams assistant chunks → displayed as live markdown
5. Session polling (5s) detects activity changes for status dots

## Known Issues (non-blocking)
- sessions.patch model step may fail but chat.send still uses the correct model — MiniMax confirmed working
- Gateway first-connect fails during Vite cold start (retry works)
- sessions.send not a valid RPC — falls back to chat.send (works)
- UI is kanban-style, needs visual upgrade to timeline

## What Needs Upgrading (visual only — DO NOT touch dispatch/output logic)
- Replace kanban mission cards with timeline view
- Add 4th theme (sunset-brand) + glass header
- Add approvals page/tab
- Menu polish (history cards, sub-tab animations)

## Cherry-Pick Strategy
ALL visual upgrades available in reflog commit 39810a9. When upgrading:
- ✅ Safe to cherry-pick: styles.css, theme.ts, settings-dialog.tsx, office-view.tsx, 
  config-wizards.tsx, approvals-page.tsx, approvals-panel.tsx, approvals-bell.tsx,
  mission-timeline.tsx, chat-screen.tsx, chat hooks, gateway.ts (challenge fix)
- ⚠️ DANGEROUS: agent-hub-layout.tsx — contains both UI and dispatch logic intertwined
  - Must preserve: spawnAgentSession, ensureAgentSessions, executeMission, dispatchToAgent,
    AgentOutputPanel SSE wiring, session polling useEffect, stopMissionAndCleanup
- ❌ DO NOT cherry-pick: agent-dispatch.ts, agent-result.ts, agent-events.ts, mission-store.ts
  (these are the broken dispatch rewrites)

## PC1
- IP: 192.168.12.192, Ollama: 13 models on port 11434
