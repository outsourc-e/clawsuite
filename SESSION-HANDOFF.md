# Session Handoff — ClawSuite Agent Hub Visual Upgrade

## READ THESE FILES FIRST
1. `CURRENT-STATE.md` — full technical state
2. `mission-working-screenshot.png` — current working UI (kanban style)
3. `mission-completed-screenshot.png` — proof missions work with live output

## Where We Are
- **Branch:** `feat/clean-sprint` @ commit `6724108`
- **Status:** Missions fully working — spawn agents, live output streaming, auto-complete, steer/pause/stop
- **Problem:** UI uses old kanban-style mission cards. We want a modern timeline view.

## What Needs To Happen
Upgrade the Missions UI from kanban cards to a timeline layout (like GitHub Actions). Keep ALL dispatch and output logic untouched.

### Visual changes wanted:
- Replace kanban mission cards with vertical timeline view
- Pill sub-tabs: Overview / Active Mission / History
- History cards with colored left border by status (green=done, red=aborted, yellow=partial)
- Active mission: progress bar, elapsed timer, agent status dots
- Sub-tab smooth underline animation
- Add 4th theme (sunset-brand — orange/amber brand theme)
- Apple glass blur header on mobile
- Keep existing Start/Pause/Stop/Steer controls

### Design references (from Eric):
- Clean light theme: warm gray backgrounds (#f5f5f5), subtle card borders, KPI stat cards
- Dark theme: deep charcoal/slate, slight glow, teal accents
- See THEME-SPEC.md in reflog commit 39810a9 if needed

## CRITICAL — Do Not Break These
The live output pipeline in `agent-hub-layout.tsx`:
- `spawnAgentSession` (~line 3216) — POST /api/sessions
- `ensureAgentSessions` — spawns all agent sessions
- `executeMission` + `dispatchToAgent` — POST /api/sessions/send
- `AgentOutputPanel` SSE wiring — /api/chat-events?sessionKey=<key>
- Session polling useEffect (~line 3700) — polls /api/sessions every 5s
- `stopMissionAndCleanup`, `handleMissionPause`, `handleSteerAgent`
- All agent state: agentSessionMap, agentSessionStatus, missionState, spawnState

## Verification After Any Change
```bash
# 1. Type check
npx tsc --noEmit

# 2. Verify dispatch path preserved
grep -n "api/sessions/send" src/screens/gateway/agent-hub-layout.tsx
# Should find dispatchToAgent calling POST /api/sessions/send

# 3. Verify output panel preserved  
grep -n "chat-events" src/screens/gateway/components/agent-output-panel.tsx
# Should find SSE EventSource to /api/chat-events

# 4. Start dev server and test a mission
# Gateway connects on retry (first attempt fails, that's normal)
```

## Available Resources
- Previous visual work in git reflog commit `39810a9` — has timeline component, themes, approvals
- Cherry-pick safe files: styles.css, theme.ts, settings-dialog.tsx, office-view.tsx, mission-timeline.tsx, approvals-*.tsx
- DO NOT cherry-pick agent-dispatch.ts, agent-result.ts, agent-events.ts, mission-store.ts

## Dev Setup
- Dev server: `npm run dev` → localhost:3000
- Gateway: ws://127.0.0.1:18789 (first connect fails during cold start, retry works)
- PC1 Ollama: http://192.168.12.192:11434 (13 models available)
- Codex CLI: `/Users/aurora/.nvm/versions/node/v22.22.0/bin/codex exec --full-auto -m gpt-5.3-codex '<task>'`
