> **⚠️ SUPERSEDED** — This spec describes the daemon-dispatch architecture which was replaced by the gateway-direct architecture in March 2026. See `CONDUCTOR-BUILD-PLAN.md` and `CONDUCTOR-AUDIT.md` for current state.

# Conductor Completion Spec
_2026-03-23 — Aurora_

## Vision

Conductor is a **one-click mission launcher** inside ClawSuite. You describe what you want built, Conductor decomposes it into tasks, spawns AI agents to execute each task, and shows live progress. When it's done, you see the output. No terminal, no CLI, no manual orchestration.

**Goal state:** User types "Build a landing page for my SaaS" → clicks Start → watches tasks execute in real-time → gets working code.

---

## Architecture (Finalized)

```
┌─────────────────────────────────────────────────────────────┐
│                    ClawSuite (Browser)                       │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  HOME        │───▶│  PREVIEW      │───▶│  ACTIVE        │  │
│  │  Goal input  │    │  Task list    │    │  Live monitor  │  │
│  │  Recent list │    │  Agent picker │    │  Task sidebar  │  │
│  │              │    │  Start button │    │  Activity feed │  │
│  └─────────────┘    └──────────────┘    └───────┬───────┘  │
│                                                  │          │
│                                           ┌──────▼──────┐   │
│                                           │  COMPLETE    │   │
│                                           │  Output view │   │
│                                           │  File viewer │   │
│                                           └─────────────┘   │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTP (SSE + REST)
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Workspace Daemon (:3099)                        │
│                                                             │
│  SQLite DB ─── Tracker ─── REST API ─── SSE Push            │
│  (projects, phases, missions, tasks, checkpoints, task_runs)│
│                                                             │
│  POST /dispatch/start:                                      │
│    1. Create mission in SQLite                              │
│    2. Write data/dispatch-state.json                        │
│    3. POST /hooks/agent → Gateway                           │
│       (fallback: /api/cron/wake)                            │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTP
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              OpenClaw Gateway (:18789)                       │
│                                                             │
│  /hooks/agent → Spawns isolated agent session               │
│  Agent reads dispatch-state.json                            │
│  Agent uses workspace-dispatch skill:                       │
│    for each task:                                           │
│      sessions_spawn(worker) → wait → verify → critic       │
│      PATCH daemon /tasks/:id (status update)                │
│      POST daemon /checkpoints (QA results)                  │
│    Mission complete → PATCH daemon /missions/:id            │
│                                                             │
│  Worker agents: Codex, Sonnet, local models                 │
│  Each worker: read task → build code → verify → report      │
└─────────────────────────────────────────────────────────────┘
```

---

## What Exists (Inventory)

### UI — `conductor.tsx` (1,807 lines)
| Phase | Status | What it does |
|-------|--------|-------------|
| **Home** | ✅ Working | Goal textarea, mode buttons (Research/Build/Review), recent missions list with pagination |
| **Preview** | ✅ Working | Decomposed task list, agent picker dropdown per task, hands-free toggle, Start Mission button |
| **Active** | ⚠️ Partial | 3-column layout (task sidebar / main content / activity feed), task selection, running agents list, pause/resume/stop buttons, steer input |
| **Complete** | ⚠️ Partial | Output files viewer, mission stats, "New Mission" button |

### Hook — `use-conductor-workspace.ts` (834 lines)
| Feature | Status |
|---------|--------|
| Decompose mutation (Plan It) | ✅ Working |
| Launch mission → daemon | ✅ Working |
| Dispatch state polling | ✅ Working |
| Mission status query | ✅ Working |
| Start/Pause/Resume/Stop mutations | ✅ Wired |
| Approve/Reject checkpoint mutations | ✅ Wired |
| Agent models query | ✅ Working |
| Task runs query | ✅ Wired |

### Daemon — `workspace-daemon/` (5,728 lines)
| Route | Status |
|-------|--------|
| `/dispatch/start` + `/dispatch/state` | ✅ Working — creates mission, fires trigger |
| `/missions` CRUD + status | ✅ Working |
| `/tasks` CRUD + status update | ✅ Working |
| `/checkpoints` CRUD | ✅ Working |
| `/task-runs` — per-task execution records | ✅ Wired |
| `/decompose` — AI task breakdown | ✅ Working |
| `/agents/models` — dynamic model list | ✅ Working |
| `/events` — SSE push | ✅ Working |
| `/stats` | ✅ Working |
| `/projects` CRUD | ✅ Working |
| Tracker (SQLite ORM) | ✅ 2,629 lines, full schema |

### Dispatch Skill — `skills/workspace-dispatch/` (12KB SKILL.md + references)
| Feature | Status |
|---------|--------|
| Auto-decompose | ✅ Built |
| State file read/write | ✅ Built |
| Sequential task loop | ✅ Tested (3 missions completed 3/22) |
| Critic pattern (separate agent reviews) | ✅ Tested |
| Retry with feedback | ✅ Tested |
| Daemon status PATCH | ✅ Built |
| Checkpoint creation | ✅ Built |
| Parallel dispatch | ❌ Not implemented |
| Supervised mode (pause for approval) | ⚠️ Wired but untested |

### Trigger — Hooks Integration
| Component | Status |
|-----------|--------|
| Gateway hooks enabled + token | ✅ Configured |
| Daemon auto-reads token from openclaw.json | ✅ Built |
| Daemon POST /hooks/agent | ✅ Built |
| Wake fallback | ✅ Built |
| **E2E trigger test** | ❌ NOT YET TESTED |

---

## What's Missing (Gap Analysis)

### P0 — Must work for MVP

#### 1. E2E Trigger Verification
The hooks trigger has never been tested end-to-end. Need to confirm:
- Daemon fires POST /hooks/agent ✅ (tested separately)
- Gateway spawns isolated session ✅ (tested separately)
- **Spawned agent reads dispatch-state.json and runs skill** — ❌ UNTESTED
- **Agent PATCHes daemon with task status during execution** — ❌ UNTESTED
- **SSE pushes status to Conductor UI in real-time** — ❌ UNTESTED

#### 2. Orchestrator Agent Prompt
The agent spawned by hooks/agent gets a raw message. It needs to:
- Know it's an orchestrator (system prompt or message framing)
- Know where dispatch-state.json lives
- Know the daemon API endpoints for status updates
- Have access to `sessions_spawn` for worker agents

Currently the hooks/agent spawns a generic agent session. The dispatch message tells it to "read data/dispatch-state.json and run the workspace-dispatch skill loop" — but the spawned session doesn't have the workspace-dispatch skill loaded automatically.

**Fix needed:** The hooks message must be self-contained enough for the agent to orchestrate, OR the hooks/agent must target a specific agent ID that has the skill pre-configured.

#### 3. Active Phase — Live Updates
The active phase shows tasks and activity but doesn't update in real-time because:
- SSE is wired but the orchestrator may not be PATCHing daemon correctly
- Task status dots are static after load
- Activity feed (`mission-event-log.tsx`) exists but needs real events

**Fix:** Verify the orchestrator→daemon→SSE→UI pipeline works, then wire event log.

#### 4. Active Phase — Task Detail Panel
When you click a task in the sidebar, the center panel should show:
- Task description and exit criteria
- Agent output (streamed or final)
- Status timeline (pending → running → verifying → complete/failed)
- Retry count if applicable

Currently shows placeholder content.

#### 5. Error States
When things go wrong (no models available, agent timeout, build failure), the user sees nothing — just "Waiting for daemon…" forever.

Need: error banners, timeout detection, retry buttons.

### P1 — Should work for good UX

#### 6. Output Preview
Complete phase should show built output:
- HTML files rendered in iframe ✅ (partially built)
- Code files in syntax-highlighted viewer
- Research output in formatted markdown
- Download button for project directory

#### 7. Mission History
Recent missions on home screen show name + status, but should link to completed output and show duration/cost.

#### 8. Agent Visibility
During active phase, show which agent is working on which task:
- Model name + provider
- Token usage accumulating
- Session link to view raw agent conversation

#### 9. Steer / Intervene
The steer input exists in active phase but needs:
- Message routing to the active orchestrator session
- "Pause after current task" functionality
- "Cancel and revert" for in-progress tasks

### P2 — Nice to have

#### 10. Parallel Dispatch
Run independent tasks concurrently (max_parallel > 1). Dispatch skill has the structure but it's sequential only.

#### 11. Git Integration
Auto-create branch per mission, commit after each task, PR when complete.

#### 12. Cost Tracking
Show token cost per task and total mission cost. Daemon has the schema, UI needs the display.

#### 13. Templates / Presets
Common mission types (landing page, API, research report) with pre-configured task breakdowns.

#### 14. Onboarding
First-time Conductor experience: explain what it does, auto-configure hooks if needed, suggest a starter mission.

---

## Execution Plan

### Phase 1: Make it Work (2-3 hours)
_Goal: User clicks Start → tasks execute → output appears_

1. **Test E2E trigger** — fire mission, verify agent spawns and reads dispatch state
2. **Fix orchestrator prompt** — ensure spawned agent can find skill + state + daemon API
3. **Verify daemon PATCH flow** — orchestrator updates task status, SSE pushes to UI
4. **Test complete flow** — mission finishes, output files appear in complete phase

### Phase 2: Make it Visible (2-3 hours)
_Goal: User sees real-time progress, not just final result_

5. **Wire SSE to active phase** — task status dots update live
6. **Build task detail panel** — show agent output per task
7. **Add error banners** — timeout, model unavailable, build failure
8. **Wire steer input** — send messages to orchestrator session

### Phase 3: Make it Polished (3-4 hours)
_Goal: Production-quality UX_

9. **Output preview** — iframe for HTML, syntax highlight for code, markdown renderer
10. **Mission history** — clickable recent missions with full output
11. **Agent visibility** — model/tokens/session per task
12. **Cost tracking** — per-task and total
13. **Mobile responsive** — all phases work on phone

### Phase 4: Make it Smart (ongoing)
14. **Parallel dispatch**
15. **Git integration**
16. **Templates**
17. **Onboarding wizard**

---

## Success Criteria

**MVP (Phase 1 complete):**
- [ ] User types goal → clicks Plan → sees task breakdown
- [ ] User clicks Start → orchestrator spawns automatically
- [ ] Each task: agent spawns → builds → verifies → marks complete
- [ ] Conductor active phase shows tasks transitioning through statuses
- [ ] Mission completes → output files viewable

**Production (Phase 1-3 complete):**
- [ ] Real-time task status updates in UI
- [ ] Agent output visible per task
- [ ] Error handling with clear messages
- [ ] Steer/pause/cancel functionality
- [ ] Output preview for HTML/code/markdown
- [ ] Works on mobile
- [ ] Works with any OpenClaw model (Codex, Sonnet, local)

---

## Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `conductor.tsx` | 1,807 | Main UI — all 4 phases |
| `use-conductor-workspace.ts` | 834 | Data hook — queries, mutations, dispatch |
| `workspace-daemon/src/server.ts` | 237 | Daemon entry + route registration |
| `workspace-daemon/src/tracker.ts` | 2,629 | SQLite ORM — full data layer |
| `workspace-daemon/src/routes/dispatch.ts` | 155 | Mission creation + trigger |
| `workspace-daemon/src/routes/missions.ts` | 209 | Mission CRUD + status |
| `workspace-daemon/src/routes/tasks.ts` | 103 | Task CRUD + status update |
| `workspace-daemon/src/routes/checkpoints.ts` | 805 | Checkpoint CRUD |
| `workspace-daemon/src/routes/task-runs.ts` | 273 | Per-task execution records |
| `skills/workspace-dispatch/SKILL.md` | ~530 | Orchestrator skill instructions |
| `skills/workspace-dispatch/references/orchestrator-prompt.md` | — | Sub-agent prompt template |
| `skills/workspace-dispatch/references/state-schema.md` | — | dispatch-state.json schema |
| `skills/workspace-dispatch/references/dispatch-algorithm.md` | — | Pseudocode for task loop |
