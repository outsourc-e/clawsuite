# Conductor Roadmap — Next Stages

_Written: 2026-03-22 1:09 PM_
_Status: Dispatch skill works, Conductor UI restored, E2E proven_

---

## What Works Today
- ✅ Dispatch skill runs automated missions (spawn → yield → verify → critic → retry → chain)
- ✅ Conductor UI at /conductor with sidebar nav
- ✅ Plan Mission decomposes goals into tasks
- ✅ Start Mission writes dispatch-state.json
- ✅ 4 modes: Research / Build / Review / Deploy
- ✅ State persists to disk (survives compaction)
- ✅ Cron watchdog checks for stalled missions every 30s

---

## Stage 1: Auto-Trigger (Priority: CRITICAL)
_Without this, users hit Start and nothing happens until cron fires_

**Problem:** Start Mission writes state but the dispatch loop needs to be triggered. Currently relies on a 30s cron poll.

**Fix:** Two approaches (do both):
1. **Immediate trigger:** After POST /dispatch/start succeeds, the Conductor hook sends a webchat message to the main agent: `"[dispatch] Mission started: {mission_id}. Run workspace-dispatch skill."` — this arrives as a user message and triggers the skill immediately.
2. **Cron backup:** Keep the 30s cron as a safety net for compaction recovery.

**Implementation:**
- Add a ClawSuite API route: `POST /api/dispatch/trigger` that sends a message to the OpenClaw webchat session
- Hook calls this after successful start
- Skill checks dispatch-state.json on trigger

---

## Stage 2: Output Embed (Priority: HIGH)
_Users need to see what was built without leaving Conductor_

**What:** When a mission completes, show the output as an embedded preview in the Conductor complete phase.

**Design:**
```
┌─────────────────────────────────────────────────┐
│ ✅ Mission Complete: Build a Xbox controller      │
│ 2 tasks completed in 2m 15s                      │
│                                                   │
│ ┌───────────────────────────────────────────────┐ │
│ │ [EMBEDDED PREVIEW — iframe]                   │ │
│ │                                               │ │
│ │  (rendered HTML output from /tmp/dispatch-*)   │ │
│ │                                               │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ [Open in New Window]  [View Files]  [New Mission] │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Conductor complete phase reads `dispatch-state.json` → finds `output_file` for coding tasks
- If output is `.html`: render in iframe via daemon file-serve endpoint
- If output is code: show in CodeBlock component (already exists)
- If output is markdown: render as markdown
- "Open in New Window" opens the file-serve URL in a new tab
- Daemon needs: `GET /api/workspace/dispatch/files/:path` — serves files from project_path

---

## Stage 3: Live Progress (Priority: HIGH)
_Active phase should show real-time task progress_

**What:** While dispatch is running, Conductor active phase polls dispatch-state.json and shows:
- Which task is currently running (animated dot)
- Task progress (completed/total)
- Agent output (if available from sub-agent session)
- Elapsed time per task
- Retry count if task failed and is retrying

**Implementation:**
- Hook already polls `/api/workspace/dispatch/state` every 2s
- Map task statuses to active phase UI:
  - `pending` → gray dot
  - `running` → animated green dot + spinner
  - `completed` → green checkmark
  - `failed` → red X with retry count
  - `skipped` → gray dash
- Progress bar: `completed_tasks / total_tasks`
- Timer: `now - created_at` for mission elapsed

---

## Stage 4: Mobile Layout (Priority: MEDIUM)
_Eric tests on phone — 3-panel layout breaks on mobile_

**What:** Responsive Conductor for < 640px screens.

**Changes:**
- Home phase: already works (centered card)
- Active phase: collapse to single column with tabs: [Tasks] [Output] [Status]
- Complete phase: full-width iframe, stacked buttons
- Recent Missions: compact list, no pagination arrows (swipe instead)

---

## Stage 5: Parallel Dispatch (Priority: MEDIUM)
_Speed up missions with independent tasks_

**What:** When `max_parallel > 1` and multiple tasks have all deps resolved, spawn them simultaneously.

**Implementation:**
- Dispatch loop spawns N agents before calling `sessions_yield`
- On wake: identify which sub-agent completed (match session key)
- Process that completion, check for more ready tasks
- Important: never run 2 coding tasks that share the same `cwd`

---

## Stage 6: Agent Output Streaming (Priority: LOW)
_Show what the agent is doing in real-time_

**What:** While a sub-agent is running, show its live output in Conductor.

**Challenge:** Sub-agent output is in OpenClaw's session, not in the daemon. Need to bridge.

**Approach:** 
- After spawning, store the session key in dispatch-state.json
- Conductor can connect to OpenClaw's SSE for that session
- Show tool calls, file reads, code writes in real-time
- This is what `AgentOutputPanel` (already in conductor.tsx) was designed for

---

## Stage 7: Checkpoint Review UI (Priority: LOW)
_For supervised mode — user approves each task_

**What:** In supervised mode, after each task completes, show a checkpoint card:
- Diff of files changed
- Verification results (tsc, tests)
- Critic score and issues
- Approve / Reject / Revise buttons

**Implementation:**
- Dispatch state gets a `checkpoint` field per task
- Skill pauses after verification, sets task status to `awaiting_review`
- Conductor shows checkpoint card with actions
- User clicks Approve → PATCH dispatch state → skill resumes

---

## Stage 8: Mission Templates (Priority: LOW)
_Quick-start common mission types_

**What:** Pre-built mission templates:
- "Build a landing page" → 3 tasks (design, code, review)
- "Research X" → 3 tasks (search, synthesize, summarize)
- "Audit this codebase" → 4 tasks (security, perf, architecture, report)
- "Deploy to production" → 4 tasks (test, build, push, verify)

**Implementation:**
- Templates stored as JSON in the skill's `references/templates/` dir
- Conductor shows template picker on home phase
- User selects template, fills in variables, launches

---

## Implementation Order

| Stage | Effort | Impact | Sprint |
|-------|--------|--------|--------|
| 1. Auto-Trigger | S (1-2 hrs) | CRITICAL | Now |
| 2. Output Embed | M (2-3 hrs) | HIGH | Now |
| 3. Live Progress | M (2-3 hrs) | HIGH | Now |
| 4. Mobile Layout | S (1-2 hrs) | MEDIUM | Next |
| 5. Parallel Dispatch | M (3-4 hrs) | MEDIUM | Next |
| 6. Agent Streaming | L (4-6 hrs) | LOW | Later |
| 7. Checkpoint Review | M (3-4 hrs) | LOW | Later |
| 8. Mission Templates | S (2 hrs) | LOW | Later |

**This sprint:** Stages 1-3 (auto-trigger + output embed + live progress)
**Next sprint:** Stages 4-5 (mobile + parallel)
**Later:** Stages 6-8 (streaming, checkpoints, templates)
