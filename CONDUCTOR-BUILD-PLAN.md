# Conductor Build Plan — Gateway-Direct Architecture
_Written: 2026-03-24 by Aurora (cross-referencing specs + audit + source review)_

## Architecture Decision: Gateway-Direct Wins

Eric confirmed: build on the **new** gateway-direct pattern. The old daemon-dispatch path is dead code.

**What we keep:**
- `use-conductor-gateway.ts` — the live hook (544 lines)
- `conductor.tsx` — the live UI (783 lines)
- `/api/preview-file` — file serving route
- `/api/send-stream` — gateway SSE streaming
- `/api/history` + `/api/sessions` — worker monitoring

**What we kill (Task 8):**
- `use-conductor-workspace.ts` (834 lines of unused daemon hook)
- Daemon dispatch proxy routes (`dispatch.start.ts`, `dispatch.state.ts`, `dispatch.files.$.ts`)
- Stale spec docs that reference daemon architecture

**What we keep from daemon (cherry-pick):**
- `workspace-daemon/src/routes/dispatch-files.ts` — useful for file serving, but we already have `/api/preview-file`
- Daemon SQLite tracker — potentially useful later for persistent mission history, but NOT for MVP

---

## Gap Analysis: Specs vs Reality

| Spec Promise | Reality (from audit + source read) | Gap |
|---|---|---|
| Task decomposition with review UI | Preview phase = spinner only, no task list | **Big gap** |
| Daemon-driven task lifecycle | Hook infers everything from session polling | **Architecture mismatch** (intentional — we chose gateway-direct) |
| Live task status (pending→running→complete) | Workers derived from session staleness heuristics | **Need real task model** |
| Output preview from `tasks[].output_file` | Regex extraction from streamed text + `/tmp/dispatch-*` guessing | **Fragile** |
| Checkpoints + approval gates | Nothing built | **Phase 2+** |
| Pause/resume/stop | Nothing wired in gateway hook | **Phase 2+** |
| Steer/intervene input | Nothing built | **Phase 2+** |
| Mission persistence across refresh | All state in React useState — lost on refresh | **Critical gap** |
| Dispatch skill for orchestrator | `skills/workspace-dispatch/` directory is empty | **Critical gap** |

---

## Build Tasks (Priority Order)

### Task 1: Mission Persistence via localStorage
**Why first:** Everything else is pointless if state is lost on refresh.

**Files:**
- `src/screens/gateway/hooks/use-conductor-gateway.ts`

**What to build:**
- Add `localStorage` persistence for mission state (goal, phase, missionStartedAt, workerKeys, workerLabels)
- On hook init, check localStorage for an active mission and rehydrate
- On phase transitions, write to localStorage
- On `resetMission()`, clear localStorage
- Key: `conductor:active-mission`

**Schema:**
```json
{
  "goal": "string",
  "phase": "decomposing|running|complete",
  "missionStartedAt": "ISO string",
  "workerKeys": ["session-key-1", "session-key-2"],
  "workerLabels": ["worker-label-1"],
  "streamText": "accumulated text (capped at 10KB)",
  "planText": "plan text",
  "completedAt": "ISO string | null"
}
```

**Verify:** `npx tsc --noEmit` + start mission, refresh browser, confirm state restores

**Dependencies:** None

---

### Task 2: Mission History (localStorage)
**Why:** Home screen should show past missions, not just recent gateway sessions.

**Files:**
- `src/screens/gateway/hooks/use-conductor-gateway.ts`
- `src/screens/gateway/conductor.tsx`

**What to build:**
- On mission complete, append to `conductor:history` in localStorage (last 50 missions)
- History entry: `{ id, goal, startedAt, completedAt, workerCount, totalTokens, status, projectPath }`
- Home screen "Recent Activity" should show mission history entries (not raw session list)
- Each entry links to a read-only complete view

**Verify:** `npx tsc --noEmit` + complete 2 missions, confirm they appear in history on home screen

**Dependencies:** Task 1

---

### Task 3: Real Task Model in Active Phase
**Why:** The active phase currently shows worker sessions with no task structure. Need decomposed tasks with status.

**Files:**
- `src/screens/gateway/hooks/use-conductor-gateway.ts`
- `src/screens/gateway/conductor.tsx`

**What to build:**
- Parse the orchestrator's streamed plan text to extract tasks (look for numbered lists, headers, or structured output)
- Add `tasks` array to hook state: `{ id, title, status, workerKey?, output? }`
- Map `sessions_spawn` events to tasks (match by label or order)
- Active phase: render task list sidebar (left column) with status dots
- Clicking a task shows its worker output in the main panel
- Status progression: `pending → running → complete/failed`

**Verify:** `npx tsc --noEmit` + dispatch a multi-step mission, confirm tasks appear with correct statuses

**Dependencies:** Task 1

---

### Task 4: Structured Output Preview
**Why:** Current regex path extraction is fragile. Need structured task→output mapping.

**Files:**
- `src/screens/gateway/hooks/use-conductor-gateway.ts`
- `src/screens/gateway/conductor.tsx`

**What to build:**
- Parse worker output for file paths more robustly (look for `Created:`, `Wrote:`, `Output:` patterns + `/tmp/` paths)
- Store `outputPath` per task/worker in hook state
- Complete phase: show output tabs if multiple workers produced files
- Support both HTML iframe preview and markdown/code preview
- Remove the `buildProjectPathCandidates` timestamp-guessing hack

**Verify:** `npx tsc --noEmit` + dispatch a build mission, confirm output preview loads from structured path

**Dependencies:** Task 3

---

### Task 5: Improved Preview Phase (Planning UI)
**Why:** Preview phase is just a spinner. Should show the plan as it streams.

**Files:**
- `src/screens/gateway/conductor.tsx`

**What to build:**
- Show streamed plan text in real-time (not just cycling status)
- As tasks are identified in the stream, show them appearing in a task list
- Show estimated worker count / model info if available
- Keep the cycling status as a secondary indicator, not the only content
- Transition to active phase automatically when first worker spawns (already works)

**Verify:** `npx tsc --noEmit` + dispatch a mission, confirm plan text streams in preview phase

**Dependencies:** Task 3

---

### Task 6: Worker Elapsed Time Fix
**Why:** All workers show the same elapsed time (mission start), not their individual start/elapsed.

**Files:**
- `src/screens/gateway/conductor.tsx`

**What to build:**
- Use each worker's `createdAt`/`startedAt` from session data for individual elapsed time
- Show per-worker elapsed, not mission-global elapsed
- Frozen timer for completed workers (use `updatedAt` as end time)

**Verify:** `npx tsc --noEmit` + visual check with 2+ workers

**Dependencies:** None

---

### Task 7: Error States & Timeout Handling
**Why:** When things fail, UI just hangs. Need visible error states.

**Files:**
- `src/screens/gateway/conductor.tsx`
- `src/screens/gateway/hooks/use-conductor-gateway.ts`

**What to build:**
- Show error banner when stream fails
- Show timeout warning if no worker activity for 60s
- Show per-worker error state if worker session errors
- "Retry Mission" button on error (re-sends same goal)
- "Cancel Mission" that resets to home

**Verify:** `npx tsc --noEmit` + test with a deliberately failing mission prompt

**Dependencies:** Task 1

---

### Task 8: Dead Code Cleanup
**Why:** Two architectures in one codebase causes confusion for both humans and Codex.

**Files to delete:**
- `src/screens/gateway/hooks/use-conductor-workspace.ts` (834 lines)
- `src/routes/api/workspace/dispatch.start.ts` (39 lines)
- `src/routes/api/workspace/dispatch.state.ts` (39 lines)
- `src/routes/api/workspace/dispatch.files.$.ts`

**Files to update:**
- `CONDUCTOR-COMPLETION-SPEC.md` — add deprecation note, point to this build plan
- `CONDUCTOR-RESTORE-SPEC.md` — mark superseded
- `DISPATCH-TRIGGER-SPEC.md` — mark superseded

**Verify:** `npx tsc --noEmit` in both roots + `grep -r "useConductorWorkspace" src/` returns nothing

**Dependencies:** Tasks 1-7 (do cleanup last)

---

## Phase 2 (After MVP)

These are NOT in scope for the current build but documented for reference:

| Feature | Notes |
|---|---|
| Dispatch skill (SKILL.md) | Only needed if we want autonomous multi-step orchestration without Aurora in the loop |
| Checkpoints + approval gates | Requires task model (Task 3) as foundation |
| Pause/resume/stop | Requires ability to message the orchestrator session |
| Steer/intervene | Same — need bidirectional session communication |
| Parallel dispatch | Need dependency graph in task model |
| SQLite persistence | Replace localStorage with daemon SQLite for multi-device |
| Cost dashboard | Aggregate token costs per mission/worker |
| Agent roster config | Custom agent names, models, prompts per mission type |

---

## Execution Plan

Codex tasks will be spawned sequentially (they all touch overlapping files):

1. **Task 1** → verify → commit
2. **Task 6** → verify → commit (independent, quick win)
3. **Task 3** → verify → commit
4. **Task 5** → verify → commit
5. **Task 4** → verify → commit
6. **Task 7** → verify → commit
7. **Task 2** → verify → commit
8. **Task 8** → verify → commit (cleanup last)

Each task: Codex reads the files, makes changes, runs `npx tsc --noEmit`, commits.
Aurora reviews `git diff` after each before proceeding.
