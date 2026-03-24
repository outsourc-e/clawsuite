> **⚠️ SUPERSEDED** — The restore was completed using a gateway-direct architecture instead of the daemon-dispatch approach described here. See `CONDUCTOR-BUILD-PLAN.md`.

# Conductor Restore — Wire to Dispatch Skill

_Goal: Restore Conductor's UI, rip out old daemon execution hooks, wire to dispatch-state.json_

---

## What We're Doing

Restore the Conductor UI from git history (`bcc8de4~1`) and rewire it to work with the dispatch skill instead of the old broken daemon execution path.

**Before:** Conductor → use-conductor-workspace.ts → daemon adapters → OpenClaw HTTP API (broken)
**After:** Conductor → dispatch-state.json → skill handles execution via system events

## Tasks

### Task 1: Restore Conductor UI from Git History
**Type:** coding
**Agent:** Codex

1. Restore `src/screens/gateway/conductor.tsx` from commit `bcc8de4~1`:
   ```
   git show bcc8de4~1:src/screens/gateway/conductor.tsx > src/screens/gateway/conductor.tsx
   ```
2. Restore `src/screens/gateway/hooks/use-conductor-workspace.ts` from same commit:
   ```
   git show bcc8de4~1:src/screens/gateway/hooks/use-conductor-workspace.ts > src/screens/gateway/hooks/use-conductor-workspace.ts
   ```
3. Re-register the `/conductor` route in the router (check `src/routes/` for route files)
4. Run `npx tsc --noEmit` — fix any type errors from missing imports or changed APIs
5. Verify the page loads at `http://localhost:3000/conductor`

**Exit criteria:** 
- conductor.tsx exists and compiles
- /conductor route is accessible
- tsc passes

---

### Task 2: Add Dispatch State Daemon Endpoint
**Type:** coding  
**Agent:** Codex

Add a single endpoint to the workspace daemon that serves the dispatch state file:

In `workspace-daemon/src/routes/` create `dispatch.ts`:
```typescript
import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function createDispatchRouter(): Router {
  const router = Router();
  
  const STATE_PATH = join(process.env.WORKSPACE_PATH || process.env.HOME || '', '.openclaw/workspace/data/dispatch-state.json');
  
  // GET /api/workspace/dispatch/state — return current dispatch state
  router.get('/state', (req, res) => {
    if (!existsSync(STATE_PATH)) {
      return res.json({ status: 'idle', tasks: [] });
    }
    try {
      const raw = readFileSync(STATE_PATH, 'utf-8');
      const state = JSON.parse(raw);
      res.json(state);
    } catch {
      res.status(500).json({ error: 'Failed to read dispatch state' });
    }
  });
  
  // POST /api/workspace/dispatch/start — write initial state + fire system event
  router.post('/start', (req, res) => {
    const { mission, mode, tasks } = req.body;
    if (!mission) return res.status(400).json({ error: 'mission is required' });
    
    const state = {
      mission_id: `mission-${Date.now()}`,
      mission,
      status: 'pending_dispatch',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_task_id: null,
      tasks: tasks || [],
      options: { mode: mode || 'autonomous', max_parallel: 1 }
    };
    
    // Write state file
    const fs = require('fs');
    fs.mkdirSync(require('path').dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    
    res.json({ ok: true, mission_id: state.mission_id });
  });
  
  return router;
}
```

Register in `server.ts`:
```typescript
import { createDispatchRouter } from './routes/dispatch';
app.use('/api/workspace/dispatch', createDispatchRouter());
```

Add proxy route in ClawSuite: `src/routes/api/workspace/dispatch.state.ts` and `dispatch.start.ts`

**Exit criteria:**
- GET /api/workspace/dispatch/state returns JSON
- POST /api/workspace/dispatch/start writes state file
- tsc passes in both workspace-daemon/ and clawsuite/

---

### Task 3: Rewrite Conductor Hook to Read Dispatch State
**Type:** coding
**Agent:** Codex

Replace the guts of `use-conductor-workspace.ts`. Keep the same exported interface so conductor.tsx doesn't need changes, but swap the implementation:

**Old:** Called daemon APIs for missions, tasks, decompose, start, etc.
**New:** 
- `useDispatchState()` — polls `GET /api/workspace/dispatch/state` every 2 seconds
- `useDecompose()` — calls the existing daemon decompose endpoint (it works fine)
- `useStartMission()` — calls `POST /api/workspace/dispatch/start` to write state, then fires system event via `POST /api/workspace/dispatch/start`
- Task list, status, progress — all derived from dispatch-state.json
- Remove all the old mission/project/phase creation logic (the skill handles that)

The key mapping:
```
dispatch-state.json field → Conductor UI
─────────────────────────────────────────
status                    → ConductorPhase (running→active, complete→complete, pending→home)
tasks[]                   → task checklist in active phase
tasks[].status            → task status dots (pending=○, running=●, completed=✓, failed=✗)
current_task_id           → which task card is highlighted
mission                   → mission name in header
options.mode              → autonomous/supervised toggle
```

**Exit criteria:**
- Hook compiles with no type errors
- Conductor loads and shows dispatch state data
- tsc passes

---

### Task 4: Verify E2E — Conductor Shows Live Dispatch State
**Type:** review
**Agent:** Codex

1. Start ClawSuite dev server + workspace daemon
2. Navigate to /conductor
3. Verify home phase renders with input + quick actions
4. Run a dispatch mission manually (write dispatch-state.json with running status + tasks)
5. Verify Conductor active phase shows the tasks from dispatch-state.json
6. Update dispatch-state.json to mark a task complete
7. Verify Conductor reflects the change within 2 seconds (polling)
8. Report PASS or FAIL

**Exit criteria:**
- Conductor displays live dispatch state
- Updates reflect within polling interval

---

## Files Modified

```
RESTORE:
  src/screens/gateway/conductor.tsx (from git history)
  src/screens/gateway/hooks/use-conductor-workspace.ts (from git history, then rewrite)

CREATE:
  workspace-daemon/src/routes/dispatch.ts
  src/routes/api/workspace/dispatch.state.ts (proxy)
  src/routes/api/workspace/dispatch.start.ts (proxy)

MODIFY:
  workspace-daemon/src/server.ts (register dispatch router)
  src/routes/ (re-register /conductor route if removed)

KEEP AS-IS:
  workspace-daemon/src/tracker.ts
  workspace-daemon/src/decomposer.ts
  All other workspace screens (workspace-layout, projects, etc.)
  skills/workspace-dispatch/ (the skill itself)
```

## Architecture After This

```
┌──────────────────────────────────────────────────┐
│ CONDUCTOR UI (conductor.tsx)                       │
│   Home → Preview → Active → Complete               │
│   Reads: GET /api/workspace/dispatch/state (2s poll)│
│   Writes: POST /api/workspace/dispatch/start        │
├──────────────────────────────────────────────────┤
│ DAEMON (:3099) — serves dispatch-state.json         │
│   One file read, one file write. That's it.         │
├──────────────────────────────────────────────────┤
│ DISPATCH SKILL (in main agent)                      │
│   Receives system event → decomposes → spawn loop   │
│   Writes dispatch-state.json at every step           │
│   UI sees updates via polling                        │
├──────────────────────────────────────────────────┤
│ OPENCLAW GATEWAY                                    │
│   sessions_spawn / sessions_yield / sessions_send    │
│   Sub-agents: Codex, Sonnet, local models            │
└──────────────────────────────────────────────────┘
```
