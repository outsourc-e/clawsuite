# Conductor Phase 2 Spec
_Written: 2026-03-24_

## MVP Complete ✅
Phase 1 delivered: mission launch → orchestrator spawn → worker tracking → output preview. localStorage persistence, mission history, task model, error handling, isometric office.

---

## Phase 2 Features (Priority Order)

### P0 — Core UX

#### 1. Settings Panel (Home Page Cog)
Small settings icon on Conductor home page. Opens a panel/modal with:
- **Model Picker** — select orchestrator model + default worker model from available models
- **Rate Limit Fallback** — when a model hits 429, auto-switch to next available. Conductor detects the error and retries with fallback model.
- **API Key Config** — add provider API keys directly in Conductor (stored in localStorage or synced to gateway config). For users who don't want to edit `openclaw.json`.
- **Mission Defaults** — default mode (Research/Build/Review/Deploy), max workers, project path template

#### 2. OfficeView Swap (White Theme)
Replace `IsometricOffice` (dark pixel art) with `OfficeView` (white theme, desk grid, agent avatars) from the agent hub. Needs an adapter to convert `ConductorWorker[]` → `AgentWorkingRow[]`. Better visual match for the Conductor design language.

#### 3. Session Cleanup
After mission completes:
- Auto-kill orchestrator session (it's done, no need to keep it)
- Auto-kill worker sessions after output is captured
- Or: TTL-based cleanup — sessions with `conductor:` or `worker-` prefix expire after 1hr if complete
- Namespace all Conductor sessions so they're filterable in agent hub

#### 4. Stop Mission (Actually Stop)
Currently "Stop Mission" just resets UI state — doesn't kill the running orchestrator/workers. Wire it to:
- `gatewayRpc('sessions.delete', { key: orchestratorKey })`
- Kill all tracked worker sessions
- Update mission history with "cancelled" status

### P1 — Intelligence

#### 5. Steer / Intervene
Text input in active phase to send messages to the orchestrator mid-mission:
- "Focus on the header design"
- "Skip the tests for now"
- "Use TypeScript not JavaScript"
Uses `gatewayRpc('sessions.send')` to message the orchestrator session.

#### 6. Checkpoints + Approval Gates
After each task completes:
- Show task output diff/preview
- Approve / Reject / Revise buttons
- In supervised mode: orchestrator pauses until user approves
- In autonomous mode: auto-approve if exit criteria pass

#### 7. Multi-Agent Dispatch (Critic Pattern)
Opt-in via settings. Uses `skills/workspace-dispatch-multi/SKILL.md`:
- Each coding task gets a separate critic review
- Critic scores 1-10, rejects < 7
- Higher quality output, ~2x the sessions/tokens

#### 8. Rate Limit Detection + Model Fallback
When a spawned session errors with 429 or rate limit:
- Detect from session status/error
- Orchestrator retries with fallback model
- Surface the model switch in the UI ("Switched from Sonnet 4.6 → GPT-5.4")

### P2 — Polish

#### 9. Clickable Mission History
Tap a completed mission on home screen → view its complete phase (output preview, worker summary, task list). Requires persisting mission output data (not just metadata) in localStorage or IndexedDB.

#### 10. Parallel Dispatch
Run independent tasks concurrently (`max_parallel > 1`). Orchestrator spawns multiple workers, Conductor shows them side by side. Safety: never run 2 coding tasks on the same directory.

#### 11. Cost Dashboard
Per-mission token usage and estimated cost. Aggregate across workers. Show in complete phase and in mission history.

#### 12. Code Editor + File Tree
Browse output files in a tree view. Syntax-highlighted code viewer for non-HTML outputs. Edit files and re-run verification.

#### 13. Persistent Projects (Git Repos)
Instead of `/tmp/dispatch-*`, create real git repos in a projects directory. Each mission is a branch. Checkpoints are git commits. Output persists across missions.

#### 14. Real-time Events (WebSocket)
Replace 3s polling with WebSocket events from gateway. Instant worker status updates, live token counters, real-time output streaming.

#### 15. Templates / Quick Actions
Pre-built mission templates:
- "Build a landing page" → pre-filled goal + Research→Build→Review pipeline
- "Audit this codebase" → Review mode, multi-domain decomposition
- "Deploy to production" → Build→Test→Deploy pipeline
Saved as JSON, selectable from home screen.

#### 16. Agent Hub Integration
Compact "mini office" widget on Conductor home showing recent agent activity across all sessions (not just Conductor). Bridge between Conductor and the main Agent Hub view.

---

## Architecture Notes

### Session Lifecycle
```
User clicks Launch
  → POST /api/conductor-spawn (goal)
  → gatewayRpc('sessions.send', { sessionKey: 'conductor:{ts}', message: prompt })
  → Gateway creates session, runs orchestrator on default model
  → Orchestrator reads dispatch skill, decomposes, calls sessions_spawn per task
  → Workers run on default model, complete independently
  → Conductor UI polls /api/sessions + /api/history every 3s
  → Workers complete → mission complete → output preview
```

### Model Resolution
- Orchestrator: user's default model (from gateway config)
- Workers: same default model (orchestrator doesn't override)
- Future: Conductor settings override both independently
- Rate limit: gateway fallback chain applies (primary → fallback1 → fallback2)

### State
- Mission state: localStorage (`conductor:active-mission`)
- Mission history: localStorage (`conductor:history`, max 50)
- Future: IndexedDB or daemon SQLite for larger persistence
