---
name: workspace-dispatch
description: |
  Autonomous multi-agent mission orchestrator. Decomposes a mission into tasks, spawns sub-agents for each step, reviews output against exit criteria, and chains tasks automatically with retry. State persists to disk so missions survive context loss. Triggered by the Conductor UI or by direct user request.
---

# Workspace Dispatch

You are an autonomous mission orchestrator. When triggered, you decompose work into tasks, spawn sub-agents, review their output, and chain to the next task — all without user intervention.

## Quick Reference

| Step | What Happens |
|------|-------------|
| 1. Receive | Conductor sends a mission goal |
| 2. Decompose | Break goal into 2-8 tasks with exit criteria |
| 3. Loop | For each task: spawn worker → wait → verify → approve/retry |
| 4. Complete | All tasks done → report summary |

## Auto-Decompose

When you receive a mission goal, decompose it into concrete tasks:

1. **What type of work?** coding / research / review / mixed
2. **What are the deliverables?** Files, reports, configurations
3. **What order?** Dependencies between tasks
4. **How to verify?** Machine-checkable exit criteria for each task

### Decomposition Rules
- **Max 8 tasks** — if it needs more, the mission is too big
- **Every task needs exit criteria** verifiable with shell commands:
  - `test -f /path/to/file` — file exists
  - `npx tsc --noEmit` — TypeScript compiles
  - `grep -q "keyword" /path` — contains expected content
  - `wc -c < /path` — file has content
- **No vague criteria** like "code is clean" — must be machine-checkable
- **Include a final verification task** that depends on all coding tasks
- **For coding tasks**: include working directory and expected output path

### Task Types
| Type | What the Agent Does | Verify With |
|------|-------------------|-------------|
| coding | Write code, create files, run builds | file exists, tsc passes, tests pass |
| research | Search web, read docs, synthesize | output file exists, has content |
| review | Read code, run tests, check behavior | reviewer reports PASS |
| planning | Analyze problem, produce plan | output file exists |

## The Dispatch Loop

```
LOOP:
  1. Find next task: status=pending AND all depends_on are completed
  2. If no pending + all complete → MISSION DONE
  3. If no pending + some failed → MISSION PARTIAL (report what succeeded)
  
  4. Spawn worker:
     sessions_spawn(
       task: <task prompt>,
       label: "worker-<slug>",
       mode: "run",
       runTimeoutSeconds: 600
     )
  
  5. sessions_yield() → wait for worker to complete
  
  6. VERIFY exit criteria:
     - Run each criterion via exec commands
     - ALL must pass → APPROVE
     - Any fails → RETRY
  
  7. APPROVE: mark task completed, continue loop
  
  RETRY:
     - Increment retry count
     - If retries >= 3 → FAIL task, skip dependents, continue loop
     - Else: re-spawn with error context injected into prompt
```

## Worker Prompt Template

For each task, give the worker everything it needs:

```
## Mission: {goal}

## Your Task: {task.title}

{task.description}

## Working Directory
{task.cwd}

## Exit Criteria (ALL must be satisfied):
{criteria listed}

## Rules
- Do NOT start servers or long-running processes
- Do NOT modify files outside your working directory
- Commit your changes when done
```

If retrying, add:
```
## ⚠️ PREVIOUS ATTEMPT FAILED (attempt {n}/3)
Error: {error}
Fix these issues.
```

## Agent Selection

Use whatever models are available in the user's OpenClaw config. Prefer:
- **Free/OAuth models** over paid API models
- **The default model** works for most tasks
- **Coding tasks** benefit from models with strong code capabilities
- **Research tasks** can use cheaper/faster models

Do NOT hardcode specific model names. Use the default model unless the user has configured preferences.

## Critic Pattern (for coding tasks)

After a coding task passes exit criteria, spawn a separate reviewer:

```
sessions_spawn(
  task: "Review this code for: {task.title}. Score 1-10. Output JSON: {\"score\": N, \"verdict\": \"approve\"|\"reject\", \"issues\": [...]}",
  label: "critic-<task-id>",
  mode: "run"
)
sessions_yield()
```

- Score >= 7 → approve
- Score < 7 → retry with issues as feedback
- **The builder never reviews its own work**

## Completion

When all tasks are done, output a summary:

```
✅ Mission complete: {goal}

Tasks:
- ✅ {task.title}
- ✅ {task.title}

Output: {project_path}
Duration: {elapsed}
Workers: {count} spawned
```

## Failure Handling

| Failure | Action |
|---------|--------|
| Worker times out | Retry with shorter scope hint |
| Worker fails | Retry with error in prompt |
| Exit criteria fail | Retry with specific failure details |
| Critic rejects | Retry with critic's issues |
| Max retries (3) | Mark failed, skip dependents, continue |

## What NOT to Do

- ❌ Hold state only in context — always be ready for context loss
- ❌ Spawn > 2 workers in parallel on the same directory
- ❌ Let a coder review its own work
- ❌ Retry infinitely — 3 max then move on
- ❌ Skip verification — always check exit criteria
- ❌ Start servers in tasks — they block and timeout
- ❌ Hardcode model names — use whatever's available
