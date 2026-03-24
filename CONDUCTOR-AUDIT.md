# Conductor Audit

_Audited: 2026-03-24_

Scope reviewed line-by-line:

1. `src/screens/gateway/conductor.tsx`
2. `src/screens/gateway/hooks/use-conductor-gateway.ts`
3. `src/screens/gateway/hooks/use-conductor-workspace.ts`
4. `workspace-daemon/src/routes/dispatch.ts`
5. `workspace-daemon/src/routes/dispatch-files.ts`
6. `src/routes/api/agent-dispatch.ts`
7. `src/routes/conductor.tsx`
8. `src/routes/api/workspace/dispatch.start.ts`
9. `src/routes/api/workspace/dispatch.state.ts`
10. `CONDUCTOR-COMPLETION-SPEC.md`
11. `CONDUCTOR-ROADMAP.md`
12. `CONDUCTOR-RESTORE-SPEC.md`
13. `research/workspace-dispatch-skill-research.md`

Additional wiring checks performed:

- `workspace-daemon/src/server.ts`
- `src/routes/api/workspace/dispatch.files.$.ts`
- `src/routes/api/preview-file.ts`

Verification run during audit:

- `npx tsc --noEmit` in `clawsuite/`: passed
- `npx tsc --noEmit` in `workspace-daemon/`: passed

Important audit constraint: this is a code-path audit, not an end-to-end runtime mission test. Anything marked "proven" below is proven by complete source tracing and successful typecheck, not by a live dispatch mission run.

## Architecture Summary

The codebase is **not** using the old daemon-driven Conductor hook in the live `/conductor` route.

Today the actual runtime pattern is:

1. `/conductor` renders `Conductor` from `src/screens/gateway/conductor.tsx`.
2. `Conductor` imports and uses `useConductorGateway`, not `useConductorWorkspace`.
3. `useConductorGateway` sends a streamed message to `/api/send-stream` targeting `sessionKey: 'agent:main:main'` with message prefix `[DISPATCH] ...`.
4. It then infers mission progress by:
   - parsing streamed assistant/thinking/tool events
   - watching `sessions_spawn` tool results
   - polling `/api/sessions`
   - polling `/api/history` for worker outputs
5. The daemon-side dispatch routes exist and are registered, but the live Conductor UI does not call them.

So the actual pattern in production code is:

- **Primary UI architecture:** gateway-direct
- **Daemon dispatch architecture:** present, registered, and partially integrated elsewhere
- **Overall reality:** **hybrid codebase, gateway-direct UI with dormant/legacy daemon-dispatch hook**

It is not accurate to describe current Conductor as daemon-based. It is also not purely gateway-direct at the repo level, because:

- `use-conductor-workspace.ts` still exists and is large
- daemon `/dispatch/start`, `/dispatch/state`, and `/dispatch/files/*` routes exist
- proxy routes for those daemon endpoints exist in the web app

But those daemon pieces are **not what `/conductor` currently uses**.

## File Inventory

### 1. `src/screens/gateway/conductor.tsx` — 783 lines

Purpose:
- Main Conductor UI for home, preview, active, and complete phases.

Imports:
- React hooks and `CSSProperties`
- Hugeicons icons and renderer
- `Button`
- `Markdown`
- `GatewaySession` type
- `cn`
- `useConductorGateway`

Exports:
- `Conductor`

What it actually does:
- Maps `useConductorGateway().phase` to UI phases: `idle -> home`, `decomposing -> preview`, `running -> active`, everything else -> `complete`.
- Home phase:
  - goal textarea
  - quick actions
  - recent session list from gateway sessions
  - Launch button calls `conductor.sendMission(trimmed)`
- Preview phase:
  - shows only a planning spinner and streaming/error output state
  - no task review UI, no agent picker, no start confirmation
- Active phase:
  - shows streamed live plan
  - shows worker session cards derived from gateway sessions/history
  - no task list from dispatch state
  - no checkpoint UI
  - no pause/resume/stop
  - no steer input
- Complete phase:
  - builds summary from gateway session/worker state
  - attempts output preview by heuristically extracting `/tmp/dispatch-*` path from streamed text or worker output
  - uses `/api/preview-file?path=...`, not daemon dispatch file serving

Which hook it actually uses:
- `useConductorGateway` only

### 2. `src/screens/gateway/hooks/use-conductor-gateway.ts` — 544 lines

Purpose:
- New live Conductor data source based on gateway streaming + session polling.

Imports:
- React hooks
- `useMutation`, `useQuery`
- `fetchSessions`, `GatewaySession` from `@/lib/gateway-api`

Exports:
- `ConductorWorker` type
- `useConductorGateway`

What it does:
- Defines stream event parsing for assistant/thinking/tool/done/error/started.
- Posts to `/api/send-stream` with:
  - `sessionKey: 'agent:main:main'`
  - `message: [DISPATCH] ${trimmed}`
- Parses streamed text for worker labels like `worker-*`.
- Watches tool events for `sessions_spawn` results and records child session keys.
- Polls gateway sessions every 3s during decomposition/running/partial completion.
- Polls recent sessions on idle home screen.
- Fetches last assistant output from `/api/history`.
- Derives worker status heuristically from session status, staleness, and token counts.
- Marks mission complete based on worker inactivity/completion, not daemon mission state.

Actual behavior model:
- Entire mission state is inferred from gateway chat/session activity.
- No dispatch-state polling.
- No task model.
- No checkpoint model.
- No daemon mission/task lifecycle calls.

### 3. `src/screens/gateway/hooks/use-conductor-workspace.ts` — 834 lines

Purpose:
- Old/alternate daemon-oriented hook that wraps workspace APIs, dispatch-state parsing, mission status, task runs, checkpoints, config, models, and launch flows.

Imports:
- React Query hooks
- `useCallback`

Exports:
- Types:
  - `DecomposeResult`
  - `WorkspaceMissionTask`
  - `WorkspaceMissionStatus`
  - `WorkspaceDispatchTask`
  - `WorkspaceDispatchState`
  - `WorkspaceTaskRun`
  - `WorkspaceCheckpoint`
  - `WorkspaceProject`
  - `WorkspaceRecentMission`
  - `WorkspaceConfig`
  - `WorkspaceAgentModel`
  - `WorkspaceProjectFile`
  - `WorkspaceProjectFiles`
- `useConductorWorkspace`

What it does:
- Polls `/api/workspace/dispatch/state` every 2s.
- Can synthesize mission status from dispatch state.
- Falls back to daemon `/missions/:id/status`.
- Queries:
  - `/api/workspace/task-runs`
  - `/api/workspace/checkpoints`
  - `/api/workspace/missions`
  - `/api/workspace/projects/:id/files`
  - `/api/workspace/stats`
  - `/api/workspace/config`
  - `/api/workspace/agents/models`
- Mutations:
  - decompose via `/api/workspace/decompose`
  - mission start/pause/resume/stop
  - checkpoint approve/reject
  - launch mission via `/api/workspace/dispatch/start`

Important mismatch:
- It returns a large daemon-based interface.
- `conductor.tsx` does not import it anywhere.
- Large parts are stubbed for compatibility:
  - `createProject`
  - `createPhase`
  - `createMission`
  - `createTask`
  - `stopTaskRun`
  - `retryTaskRun`
  - `sendTaskRunMessage`

Which hook `conductor.tsx` actually uses:
- Not this one

### 4. `workspace-daemon/src/routes/dispatch.ts` — 195 lines

Purpose:
- Daemon route for reading dispatch state and creating a new dispatch mission.

Imports:
- `Router` from Express
- file system helpers
- path helpers
- `Tracker`

Exports:
- `createDispatchRouter(tracker?)`

What it does:
- `GET /state`
  - reads `~/.openclaw/workspace/data/dispatch-state.json`
  - returns `{ status: 'idle', tasks: [] }` if missing
- `POST /start`
  - validates `mission`
  - creates a `mission-{Date.now()}` id
  - resolves `projectPath` or generates `/tmp/dispatch-${slug}-${Date.now()}`
  - writes dispatch-state.json with:
    - `mission_id`
    - `mission`
    - `status: 'pending_dispatch'`
    - timestamps
    - `current_task_id: null`
    - `tasks`
    - `options: { mode, max_parallel: 1, project_path }`
  - best-effort syncs to SQLite through `Tracker`
    - creates project
    - creates phase
    - creates mission
    - creates tasks
    - starts mission in tracker
  - builds an orchestrator message instructing curl PATCHes to daemon mission/task routes and worker spawning via `sessions_spawn`
  - sends that message to OpenClaw via `POST ${gatewayUrl}/hooks`

Observed limitations in code:
- No route to update dispatch-state.json after start.
- No persistence of:
  - retry counts
  - checkpoints
  - event log
  - context handoff file
  - current worker session ids
  - last_error
  - watchdog job id
- No SSE emission on state-file writes in this route.
- Hook target is generic `/hooks` with a freeform text payload, not a typed orchestrator endpoint.

### 5. `workspace-daemon/src/routes/dispatch-files.ts` — 103 lines

Purpose:
- Serve files out of the dispatch project directory.

Imports:
- Express `Router`
- `existsSync`, `readFileSync`, `statSync`
- `path`

Exports:
- `createDispatchFilesRouter`

What it does:
- Reads `options.project_path` from dispatch-state.json, unless a `?project=` query overrides it.
- Serves `GET /*` only if:
  - requested path exists
  - requested path stays within resolved project path
- Sets content type by extension.

Observed usage:
- Registered in daemon server.
- Proxied by `src/routes/api/workspace/dispatch.files.$.ts`.
- Not used by `conductor.tsx`, which instead uses `/api/preview-file`.

### 6. `src/routes/api/agent-dispatch.ts` — 116 lines

Purpose:
- Authenticated API route for sending a message to an agent session through gateway RPC.

Imports:
- `randomUUID`
- router helpers
- `gatewayRpc`
- auth middleware
- JSON content-type enforcement

Exports:
- `Route` for `POST /api/agent-dispatch`

What it does:
- Validates auth and JSON content type.
- Requires:
  - `sessionKey`
  - `message`
- Optional:
  - `idempotencyKey`
  - `model`
- Calls `gatewayRpc('sessions.send', ...)` with lane `subagent`, `deliver: false`, timeout, idempotency key.
- Falls back to `gatewayRpc('chat.send', ...)` if method missing.

Observed usage relative to Conductor:
- This file is not used by `conductor.tsx`.
- Search results show it is used by `use-mission-orchestrator.ts`, not by the Conductor screen being audited.

### 7. `src/routes/conductor.tsx` — 6 lines

Purpose:
- Registers `/conductor`.

Imports:
- `createFileRoute`
- `Conductor`

Exports:
- `Route`

Which hook the route ultimately uses:
- Whatever `Conductor` uses, which is `useConductorGateway`

### 8. `src/routes/api/workspace/dispatch.start.ts` — 39 lines

Purpose:
- Authenticated proxy route from web app to daemon `POST /dispatch/start`.

Imports:
- router helpers
- auth middleware
- rate limit helpers
- `forwardWorkspaceRequest`

Exports:
- `Route`

What it does:
- Auth check
- rate limit
- forwards request to daemon path `/dispatch/start`
- returns 502 with safe error message on proxy failure

Observed usage:
- Used by `useConductorWorkspace.launchMission`
- Not used by `useConductorGateway`

### 9. `src/routes/api/workspace/dispatch.state.ts` — 39 lines

Purpose:
- Authenticated proxy route from web app to daemon `GET /dispatch/state`.

Imports:
- router helpers
- auth middleware
- rate limit helpers
- `forwardWorkspaceRequest`

Exports:
- `Route`

What it does:
- Auth check
- rate limit
- forwards request to daemon path `/dispatch/state`
- returns 502 on proxy failure

Observed usage:
- Used by `useConductorWorkspace`
- Not used by `conductor.tsx`

### 10. `CONDUCTOR-COMPLETION-SPEC.md` — 286 lines

Purpose:
- Product/spec doc for intended final Conductor system.

Key claims in doc:
- Describes daemon-centric architecture with dispatch start, SQLite tracking, gateway hooks, skill loop, checkpoints, task runs, SSE, and output preview.
- States many features as working or partially working.

Audit conclusion:
- The doc does not match the live `/conductor` implementation. It describes a richer daemon/skill architecture than the active UI actually consumes.

### 11. `CONDUCTOR-ROADMAP.md` — 179 lines

Purpose:
- Roadmap for next stages after restore.

Key claims in doc:
- Says "Dispatch skill works, Conductor UI restored, E2E proven".
- Plans immediate trigger, output embed, live progress, parallel dispatch, checkpoints, templates.

Audit conclusion:
- Several roadmap items describe architecture that still exists only in docs or partial backend plumbing, not in the current `/conductor` UI path.

### 12. `CONDUCTOR-RESTORE-SPEC.md` — 209 lines

Purpose:
- Restore plan for wiring Conductor to dispatch-state.json via daemon routes.

Key claims in doc:
- "Before: Conductor -> use-conductor-workspace -> daemon adapters"
- "After: Conductor -> dispatch-state.json -> skill handles execution via system events"

Audit conclusion:
- The restore target was daemon dispatch-state polling through `use-conductor-workspace`.
- That is not what the current `conductor.tsx` does. The current code bypasses that hook entirely.

### 13. `research/workspace-dispatch-skill-research.md` — 1,156 lines

Purpose:
- Deep architecture research for the intended dispatch skill.

Key recommendations:
- JSON state file as single source of truth
- append-only event log
- context handoff file
- deterministic task loop
- critic agent
- machine-verifiable exit criteria
- watchdog cron
- state recovery after compaction
- optional daemon/SSE integration

Audit conclusion:
- Most of this research is aspirational relative to the audited code.
- The current codebase implements only a small subset of the recommended persistence/orchestration model.

## What Works (Tested & Proven)

This section means "proven by direct source tracing and typecheck in this audit."

### Fully wired in current `/conductor` path

1. `/conductor` route loads the Conductor screen.
2. The Conductor screen uses the gateway-direct hook, not the daemon hook.
3. Launching a mission from the home screen calls `useConductorGateway.sendMission`.
4. `sendMission` posts a streamed request to `/api/send-stream` targeting `agent:main:main`.
5. Streamed assistant and thinking tokens are accumulated and displayed.
6. Preview phase renders while the streamed dispatch/planning message is in progress.
7. Worker discovery is wired through two mechanisms:
   - parsing `worker-*` labels from stream text
   - capturing `sessions_spawn` tool result child session keys
8. Worker cards in the active phase are populated from gateway session polling (`fetchSessions`).
9. Worker output panels are populated from `/api/history`.
10. Home phase recent activity is populated from recent gateway sessions.
11. Mission completion in the current UI path is derived from gateway worker state and transitions into the complete phase.
12. Complete phase can preview `/tmp/dispatch-*` HTML files through `/api/preview-file` if a path is inferred from stream/history output.

### Fully wired in daemon/proxy path, but not used by current `/conductor`

1. Daemon `GET /api/workspace/dispatch/state` is registered and reads dispatch-state.json.
2. Daemon `POST /api/workspace/dispatch/start` is registered and writes dispatch-state.json.
3. Daemon `POST /api/workspace/dispatch/start` also best-effort mirrors mission/task records into SQLite through `Tracker`.
4. Daemon dispatch file serving route is registered at `/api/workspace/dispatch/files/*`.
5. Web proxy routes exist for:
   - `/api/workspace/dispatch/start`
   - `/api/workspace/dispatch/state`
   - `/api/workspace/dispatch/files/$`
6. `useConductorWorkspace.launchMission` is wired to the dispatch start proxy and invalidates related queries afterward.

### Verified by command

1. `clawsuite/` TypeScript build passes.
2. `workspace-daemon/` TypeScript build passes.

## What Is Stubbed / Partially Wired

### In the live gateway-direct Conductor path

1. Preview task review is missing.
   - The spec/older design expects decomposed task list review and agent selection.
   - Current preview phase is only a loading card with streaming text.

2. Active task model is missing.
   - No task list from dispatch-state.json.
   - No current task selection tied to `current_task_id`.
   - No dependency graph, retry count, or task-level progress model.

3. Pause/resume/stop controls are missing from the active screen.
   - Older daemon hook exposes these mutations.
   - Current screen/hook path does not use them.

4. Steer/intervene input is missing.
   - Mentioned in docs/spec.
   - Not implemented in current `conductor.tsx`.

5. Checkpoint review UI is missing.
   - No task checkpoint cards
   - no approve/reject actions
   - no use of `checkpoints` query/mutations from `useConductorWorkspace`

6. Output preview uses heuristic path extraction, not structured task outputs.
   - Current complete phase scans assistant text/history for `/tmp/dispatch-*`.
   - It does not read task `output_file` from dispatch state.

7. File serving strategy is split.
   - daemon dispatch-files route exists
   - current Conductor uses `/api/preview-file` instead

### In the daemon/dispatch-state path

1. `useConductorWorkspace` is partially wired but not live.
   - The interface is large and mostly intact.
   - It is effectively orphaned relative to `/conductor`.

2. Several returned mutations/helpers are explicit stubs:
   - `createProject`
   - `createPhase`
   - `createMission`
   - `createTask`
   - `stopTaskRun`
   - `retryTaskRun`
   - `sendTaskRunMessage`

3. `createMissionMutation` is compatibility-only.
   - Returns `{ id: '', name }`
   - does not hit any backend

4. Mission/task/checkpoint/task-run queries are only partially meaningful without a live mission id.
   - The hook can fetch them, but the live screen never consumes them.

5. Dispatch lifecycle after `/dispatch/start` is only partially represented in code.
   - start writes initial state and sends hook
   - there is no audited code in this file set that updates the state file through task execution

### In the dispatch route itself

1. The orchestrator prompt is embedded as a raw freeform message.
   - No structured contract
   - no explicit skill loading mechanism
   - no confirmation that spawned hook session has required orchestration context

2. SQLite sync is best-effort and non-transactional relative to state-file write.
   - state file is written first
   - DB mirror may fail silently

3. No daemon-side dispatch update routes.
   - There is only start/state/file serve in this audited path.
   - Task progression relies on other daemon task routes plus whatever external agent obeys the curl instructions.

## Dead Code / Conflicts

### Primary conflict: two Conductor architectures coexist

1. `conductor.tsx` imports `useConductorGateway`.
2. `useConductorWorkspace.ts` still exists as an 834-line daemon/disptach-state hook.
3. Restore/spec docs describe the daemon hook as the intended Conductor backend.
4. Current live route bypasses that hook entirely.

This is the single biggest architectural conflict in the feature.

### Exact answer: which hook does `conductor.tsx` actually import?

It imports:

- `./hooks/use-conductor-gateway`

It does **not** import:

- `./hooks/use-conductor-workspace`

### Specific dead or conflicting patterns

1. Dead-orphaned hook surface:
   - `useConductorWorkspace` exposes mission/task/checkpoint/config/model/project-file functionality that the current Conductor screen never uses.

2. Conflicting launch models:
   - gateway-direct path: send `[DISPATCH] ...` to main session via `/api/send-stream`
   - daemon path: `POST /api/workspace/dispatch/start`, write JSON state, fire gateway hook

3. Conflicting progress sources:
   - gateway-direct path: infer progress from session polling/history/tool events
   - daemon path: derive progress from `dispatch-state.json`, mission status, task runs, checkpoints

4. Conflicting output-preview sources:
   - current UI: `/api/preview-file`
   - daemon path: `/api/workspace/dispatch/files/$`

5. Conflicting mission completion semantics:
   - current UI: "workers stopped or look complete"
   - daemon path: explicit dispatch/mission statuses

6. Docs conflict with implementation:
   - `CONDUCTOR-RESTORE-SPEC.md` says Conductor should be rewired to dispatch-state.json
   - actual route is rewired to gateway streaming instead

7. The daemon itself contains a comment indicating its own mission loop is disabled:
   - `workspace-daemon/src/server.ts` says execution via Aurora sub-agents, because daemon cannot HTTP into OpenClaw `sessions_spawn`.
   - That reinforces that part of the older daemon-centric execution story is no longer authoritative.

## Missing Pieces for Phase 2

The requested Phase 2 areas were: dispatch loop, persistence, task pipeline, checkpoints.

### 1. Dispatch loop

Missing:

1. A single authoritative execution path.
   - Today the UI path and daemon path diverge.

2. Deterministic task progression logic in live code connected to Conductor.
   - Research recommends: pending -> running -> verify -> critic -> complete/retry/fail.
   - Current live Conductor has no task state machine.

3. Explicit orchestrator contract.
   - Current daemon start route emits a long natural-language message with curl instructions.
   - There is no typed schema for orchestrator wakeups or result handling.

4. Resume/recovery loop.
   - No audited code reconnects an in-progress dispatch mission into current `/conductor`.

5. Parallel dispatch control.
   - `max_parallel` is written as `1` but not used further in this audited path.

### 2. Persistence

Missing:

1. Full dispatch-state schema from research/spec.
   - Missing fields include:
     - `retry_count`
     - `max_retries`
     - `last_error`
     - worker/session identifiers
     - checkpoint references
     - watchdog id
     - context file path

2. Event log persistence.
   - Research expects `dispatch-log-{mission-id}.jsonl`.
   - Not present in audited implementation.

3. Context handoff persistence.
   - Research expects `dispatch-context-{mission-id}.md`.
   - Not present.

4. Atomic update helpers for state evolution.
   - Audited code writes initial state file only.
   - No centralized read/modify/write dispatch-state update flow appears in this file set.

5. Restore-from-disk integration in live UI.
   - Current `/conductor` idle state does not read daemon dispatch state to rehydrate active missions.

### 3. Task pipeline

Missing:

1. Task decomposition review in the actual screen.
2. Task selection and detail panel based on task ids and statuses.
3. Task status transitions tied to real backend updates.
4. Dependency handling beyond serialized task list handoff text.
5. Exit criteria tracking.
6. Retry and fallback model flow.
7. Task-run creation/association visible in live Conductor.
8. Mapping from task -> worker session -> output artifact in current UI.

### 4. Checkpoints

Missing:

1. Live use of checkpoint routes from Conductor.
2. Task-level checkpoint state in dispatch-state.json.
3. Approval gate in the Conductor screen.
4. Wiring from completed worker output into checkpoint creation/approval/rejection inside the Conductor mission flow.
5. Supervised mode UX.

The daemon has checkpoint infrastructure, but the Conductor route being audited does not participate in it.

## Recommended Task Manifest

The highest-leverage change is to stop running two Conductor architectures at once. These tasks assume the target architecture is daemon-backed dispatch state, because that is what the specs, restore plan, and daemon routes are converging toward.

### 1. Decide and enforce one Conductor backend

Files to modify:
- `src/screens/gateway/conductor.tsx`
- `src/screens/gateway/hooks/use-conductor-gateway.ts`
- `src/screens/gateway/hooks/use-conductor-workspace.ts`
- `CONDUCTOR-COMPLETION-SPEC.md`
- `CONDUCTOR-ROADMAP.md`

What to change:
- Pick one authoritative architecture for `/conductor`.
- Either:
  - switch `conductor.tsx` back to `useConductorWorkspace`
  - or delete/retire the daemon-dispatch Conductor path and rewrite specs to match gateway-direct
- Remove contradictory wording in docs.

How to verify:
- `npx tsc --noEmit` in both roots
- `rg "useConductorGateway|useConductorWorkspace" src/screens/gateway/conductor.tsx`
- manual load of `/conductor`

Dependencies:
- none

### 2. Reconnect `/conductor` to dispatch-state polling

Files to modify:
- `src/screens/gateway/conductor.tsx`
- `src/screens/gateway/hooks/use-conductor-workspace.ts`

What to change:
- Make the screen consume `dispatchState`/`missionStatus` from `useConductorWorkspace`.
- Rehydrate active/complete UI from `dispatch-state.json` instead of inferred gateway worker state.
- Preserve only the gateway-specific pieces that are still needed for optional worker output visibility.

How to verify:
- `npx tsc --noEmit`
- manual write/update of dispatch-state.json through daemon route and confirm `/conductor` updates within polling interval

Dependencies:
- task 1

### 3. Add authoritative dispatch-state update primitives

Files to modify:
- `workspace-daemon/src/routes/dispatch.ts`
- `workspace-daemon/src/server.ts`
- `workspace-daemon/src/types.ts` if needed

What to change:
- Add update endpoints or shared helpers for:
  - current task id
  - task status changes
  - retry counts
  - worker session ids
  - completion/failure fields
- Centralize dispatch-state read/modify/write instead of only writing the initial file.

How to verify:
- `npx tsc --noEmit` in `workspace-daemon/`
- curl/manual requests proving start + update + reread behavior

Dependencies:
- task 1

### 4. Formalize the orchestrator trigger contract

Files to modify:
- `workspace-daemon/src/routes/dispatch.ts`
- `src/routes/api/agent-dispatch.ts`
- any chosen gateway trigger route used by Conductor

What to change:
- Replace raw freeform hook text with a stable trigger contract.
- Decide whether dispatch starts through:
  - daemon `/dispatch/start` + hook
  - direct session send
- Ensure the triggered agent has sufficient instructions/config to run the loop.

How to verify:
- `npx tsc --noEmit` in both roots
- runtime smoke test that one start action produces one orchestrator wakeup path

Dependencies:
- task 1
- task 3

### 5. Build a real task model into the Conductor active phase

Files to modify:
- `src/screens/gateway/conductor.tsx`
- `src/screens/gateway/hooks/use-conductor-workspace.ts`

What to change:
- Render task list from dispatch state.
- Highlight `current_task_id`.
- Show status-specific visuals for pending/running/completed/failed/skipped.
- Add task detail panel with description, timestamps, retry count, and output metadata.

How to verify:
- `npx tsc --noEmit`
- manual dispatch-state edits reflected in UI

Dependencies:
- task 2
- task 3

### 6. Wire output preview to structured task outputs

Files to modify:
- `src/screens/gateway/conductor.tsx`
- `workspace-daemon/src/routes/dispatch-files.ts`
- `src/routes/api/workspace/dispatch.files.$.ts`
- optionally `src/routes/api/preview-file.ts`

What to change:
- Stop relying on regex extraction from assistant text.
- Use `tasks[].output_file` plus `options.project_path` from dispatch state.
- Route previews consistently through daemon dispatch file serving, or deliberately replace it and delete the duplicate path.

How to verify:
- `npx tsc --noEmit` in both roots
- load an HTML output and a text/markdown output from a known dispatch project

Dependencies:
- task 2
- task 3

### 7. Connect task runs and worker session identity

Files to modify:
- `workspace-daemon/src/routes/dispatch.ts`
- `src/screens/gateway/hooks/use-conductor-workspace.ts`
- `src/screens/gateway/conductor.tsx`

What to change:
- Persist task-level session/run identifiers into dispatch state or related daemon records.
- Display task -> session linkage in the active phase.
- Use that linkage for accurate worker output instead of loose `worker-*` text inference.

How to verify:
- `npx tsc --noEmit`
- runtime mission smoke test confirming each task shows the correct session identity/output

Dependencies:
- task 3
- task 4
- task 5

### 8. Integrate checkpoints into Conductor

Files to modify:
- `src/screens/gateway/conductor.tsx`
- `src/screens/gateway/hooks/use-conductor-workspace.ts`
- `workspace-daemon/src/routes/dispatch.ts`

What to change:
- Show checkpoint state per task.
- Surface approve/reject controls in supervised mode.
- Connect those actions to existing checkpoint endpoints.
- Represent awaiting-review state in the Conductor task model.

How to verify:
- `npx tsc --noEmit`
- manual checkpoint creation/approval flow visible in `/conductor`

Dependencies:
- task 5
- task 7

### 9. Add dispatch persistence layers from research

Files to modify:
- `workspace-daemon/src/routes/dispatch.ts`
- new helper module under `workspace-daemon/src/`

What to change:
- Add:
  - append-only event log
  - context handoff file
  - `last_error`
  - retry metadata
  - mission completion/failure summaries
- Use atomic writes for dispatch state.

How to verify:
- `npx tsc --noEmit` in `workspace-daemon/`
- inspect generated files during a mission

Dependencies:
- task 3

### 10. Add restore/recovery on page load

Files to modify:
- `src/screens/gateway/conductor.tsx`
- `src/screens/gateway/hooks/use-conductor-workspace.ts`

What to change:
- When dispatch state is non-idle, `/conductor` should open directly into active or complete state after refresh/reload.
- Avoid losing mission visibility when the browser reloads.

How to verify:
- `npx tsc --noEmit`
- start mission, reload `/conductor`, confirm state is restored

Dependencies:
- task 2
- task 3
- task 9

### 11. Add end-to-end verification for start -> run -> complete

Files to modify:
- add test or verification doc under `research/` or project docs
- optionally add lightweight integration helpers

What to change:
- Create a reproducible smoke test for:
  - dispatch start
  - state transition to running
  - task progression
  - output preview
  - completion

How to verify:
- execute the smoke test and record results

Dependencies:
- tasks 4 through 10

### 12. Remove or quarantine dead Conductor code

Files to modify:
- whichever hook/path loses the architecture decision from task 1
- related docs

What to change:
- Delete or clearly quarantine the unused Conductor path so future work does not keep drifting.

How to verify:
- `npx tsc --noEmit` in both roots
- search confirms only one production Conductor path remains

Dependencies:
- task 11

## Bottom Line

The live Conductor screen is currently a **gateway-streaming session monitor**, not the daemon/dispatch-state-driven task orchestrator described in the restore spec and completion spec.

The codebase already contains enough daemon plumbing to support a dispatch-state architecture, but that path is currently sidelined. The main problem is not that nothing exists; it is that **two incompatible implementations exist at once**, and `/conductor` is connected to the newer gateway-direct one while the docs and most of the intended product model still assume the daemon-dispatch one.
