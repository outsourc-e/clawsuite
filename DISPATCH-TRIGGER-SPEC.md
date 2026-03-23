# Dispatch Trigger Architecture Spec
_2026-03-23 — Aurora_

## Problem

When a user clicks "Start Mission" in Conductor, the system needs to spawn an orchestrator agent that executes the mission. Currently this is broken because:

1. **`/api/stream` goes to `agent:main:main`** — the default gateway webchat session, not necessarily the user's active session
2. **`cron wake` goes to `agent:main:main`** — same problem
3. **`openclaw system event` goes to `agent:main:main`** — same problem
4. The user might be chatting on Telegram, Discord, ClawSuite webchat, or not connected at all
5. Even if we route to the right session, we're polluting a *chat* session with execution commands

## Root Cause

The current design assumes "tell Aurora to spawn the orchestrator." This is fragile because:
- Aurora might be in any session, on any channel
- Aurora's session might compact mid-mission
- The dispatch message competes with normal conversation
- It couples execution to chat presence

## Correct Architecture

**The daemon spawns the orchestrator directly via the gateway API. No chat session involved.**

```
User → Conductor UI → POST /api/workspace/dispatch/start
                         → Daemon creates mission in SQLite
                         → Daemon calls Gateway HTTP API to spawn orchestrator
                         → Orchestrator sub-agent runs autonomously
                         → Updates daemon via HTTP (task status, checkpoints)
                         → Daemon pushes SSE → Conductor UI updates live
```

### Why This Works for Everyone
- **No active session required** — works if user is offline, on mobile, on any channel
- **No session routing ambiguity** — gateway spawns a fresh dedicated session
- **No chat pollution** — missions run in isolated sessions, chat stays clean
- **Survives compaction** — orchestrator is its own session, not dependent on main
- **Gateway is always running** — if ClawSuite can reach the gateway (it must, to work at all), it can spawn agents

## Implementation

### Step 1: Gateway Spawn Endpoint (already exists)

The OpenClaw gateway already supports spawning sessions via its HTTP API. We just need to call it from the daemon.

**Gateway HTTP API** (port 18789 by default):
```
POST /api/sessions/spawn
{
  "task": "...",
  "model": "openai-codex/gpt-5.4",
  "label": "mission-<id>",
  "mode": "run",
  "runTimeoutSeconds": 600
}
```

If the gateway doesn't expose a direct spawn HTTP endpoint, we use the WebSocket RPC:
```
gatewayRpc('sessions.spawn', { task, model, label, mode: 'run' })
```

ClawSuite already has `gatewayRpc` wired in `src/server/gateway.ts`.

### Step 2: New ClawSuite API Route — `/api/mission-spawn`

A server-side route that:
1. Receives mission details from the Conductor UI
2. Builds the orchestrator prompt (reads dispatch-state.json context)
3. Calls `gatewayRpc('sessions.spawn', ...)` to create an isolated orchestrator session
4. Returns the session key to the UI for monitoring

```typescript
// src/routes/api/mission-spawn.ts
POST /api/mission-spawn
Body: { missionId, goal, tasks[], model?, projectPath? }
Response: { ok, sessionKey, runId }
```

### Step 3: Orchestrator Prompt Template

The spawned orchestrator gets a self-contained prompt with everything it needs:

```
You are a mission orchestrator. Execute this mission autonomously.

Mission: {{goal}}
Mission ID: {{missionId}}
Project Path: {{projectPath}}

Tasks:
{{#each tasks}}
- [{{id}}] {{title}} (type: {{type}})
  Description: {{description}}
  Exit criteria: {{exitCriteria}}
  Depends on: {{dependsOn}}
{{/each}}

## Instructions
1. Work through tasks in dependency order
2. For each task: spawn a sub-agent via sessions_spawn, wait for completion
3. Verify exit criteria using exec commands
4. Update daemon task status: PATCH http://localhost:3099/api/workspace/tasks/{{taskId}}
5. If verification fails, retry once with feedback, then mark failed
6. After all tasks complete, POST summary to daemon

## Daemon API
- PATCH /api/workspace/tasks/:id — update task status { status, output, error }
- POST /api/workspace/checkpoints — create checkpoint { mission_id, task_id, type, data }
- GET /api/workspace/dispatch/state — read current dispatch state

Do not wait for user input. Execute everything autonomously.
```

### Step 4: Update Daemon `dispatch.ts`

Replace `fireDispatchTrigger` (broken wake/system-event approach) with:

```typescript
async function spawnOrchestrator(missionId: string, mission: string, tasks: Task[]): Promise<string | null> {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:18789";
  
  // Build orchestrator prompt from template
  const prompt = buildOrchestratorPrompt(missionId, mission, tasks);
  
  // Option A: Call ClawSuite's /api/mission-spawn (which uses gatewayRpc)
  // Option B: Call gateway HTTP API directly
  // Using gateway direct for fewer hops:
  
  const res = await fetch(`${gatewayUrl}/api/sessions/spawn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: prompt,
      model: 'openai-codex/gpt-5.4',  // Free, capable
      label: `mission-${missionId}`,
      mode: 'run',
      runTimeoutSeconds: 600,
    }),
  });
  
  if (!res.ok) throw new Error(`Spawn failed: ${res.status}`);
  const data = await res.json();
  return data.sessionKey ?? null;
}
```

### Step 5: Update `launchMission` in Conductor Hook

Remove the `/api/stream` call entirely. The daemon handles everything:

```typescript
// In use-conductor-workspace.ts launchMission:
// 1. POST /api/workspace/dispatch/start → daemon creates mission + spawns orchestrator
// 2. That's it. No /api/stream, no wake, no system event.
// 3. UI polls dispatch state / listens to SSE for progress
```

### Step 6: Session Monitoring

Conductor can show orchestrator status by:
1. Daemon stores `sessionKey` returned from spawn in the mission record
2. UI can poll `/api/session-status?sessionKey=mission-xxx` for token usage, status
3. SSE events from daemon show task-level progress as orchestrator PATCHes status

### Step 7: Notifications (Optional, Nice-to-Have)

When mission completes/fails, the orchestrator (or daemon) can optionally notify the user:
- `POST /api/agent-dispatch` with `sessionKey: 'agent:main:main'` and a summary message
- Or daemon fires a one-shot cron wake with the completion summary
- This is *notification*, not *execution* — so routing to any session is fine

## Migration Path

1. **Kill the `/api/stream` call** in `launchMission` — it's broken and wrong
2. **Kill `fireDispatchTrigger`** in daemon — wake/system-event approach is broken
3. **Add spawn logic to daemon** — either direct gateway HTTP or via ClawSuite route
4. **Test**: does `gatewayRpc('sessions.spawn')` work from ClawSuite's server? (It should — same pattern as `sessions.send` in `agent-dispatch.ts`)
5. **Wire session key back to Conductor UI** for monitoring
6. **Remove dispatch-trigger cron** — no longer needed

## What We Keep

- `dispatch-state.json` — still useful as a persistent state file the orchestrator reads/writes
- `workspace-dispatch` skill — still the orchestrator's playbook (referenced in prompt)
- Daemon SQLite tracking — still the source of truth for UI
- SSE push — still how Conductor gets live updates
- `agent-dispatch.ts` — keep as a general-purpose "send message to session" API

## What We Delete

- `/api/stream` POST in `launchMission`
- `fireDispatchTrigger()` in daemon dispatch.ts
- `dispatch-trigger` cron job (already deleted, but don't recreate)

## Open Questions

1. **Does the gateway expose an HTTP spawn endpoint?** Or only via WebSocket RPC? If WS only, we must route through ClawSuite's `gatewayRpc` (which is WS-based).
2. **Model selection**: User picks models per task in Conductor. Should the orchestrator respect those, or re-decide? Recommend: pass user's selections in the prompt, orchestrator uses them.
3. **Concurrent missions**: Current design is single-mission. To support multiple: daemon tracks session keys per mission, each orchestrator is independent.
4. **Timeout handling**: What if the orchestrator dies mid-mission? Daemon should have a health-check polling loop (check session status every 60s, re-spawn if dead with resume state).

## Estimated Work

| Task | Effort | Who |
|------|--------|-----|
| Determine gateway spawn API (HTTP vs WS) | 15 min | Aurora |
| Build `/api/mission-spawn` route | 30 min | Codex |
| Update daemon `dispatch.ts` | 30 min | Codex |
| Update `launchMission` hook (remove /api/stream) | 10 min | Codex |
| Wire session key to Conductor monitor | 20 min | Codex |
| E2E test | 15 min | Manual |
| **Total** | **~2 hours** | |
