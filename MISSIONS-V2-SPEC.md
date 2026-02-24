# Missions Tab V2 — Design Match Spec (39810a9 Reference)

Visual-only. DO NOT touch dispatch, session logic, output pipeline, or agentSessionMap.

---

## 1. Mission Sub-Tab Bar

Replace current tab bar with this exact style from 39810a9:

Container:
```
flex w-full overflow-hidden rounded-xl border border-neutral-200 bg-white
```

Each tab button:
```
flex-1 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap text-center
```

Active:
```
bg-orange-50 text-orange-600 border-b-2 border-orange-500
```
(warm cream fill, orange text, orange bottom border)

Inactive:
```
bg-white text-neutral-600 hover:bg-neutral-50
```

NO rounded pill borders. NO sliding underline animation. Full-width tab container that looks like a segmented control.

---

## 2. History Cards (CRITICAL — highest priority)

Layout: `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`

Each card:
```
relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 shadow-sm
```

Colored left border by status (4px thick stripe, NOT the full card border):
```
<div className={cn("absolute inset-y-0 left-0 w-1 rounded-l-xl", statusBorderColor)} />
```
- Completed: `bg-emerald-500`
- Partial: `bg-orange-400`
- Aborted: `bg-orange-500`
- done: `bg-emerald-500`

Card content (pl-3 to offset the left stripe):
```
<div className="pl-3">
  {/* Row 1: Title + Status Badge */}
  <div className="flex items-start justify-between gap-2">
    <p className="font-semibold text-neutral-900 text-sm leading-snug">{entry.goal}</p>
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white", statusBadgeColor)}>
      {statusLabel}
    </span>
  </div>

  {/* Row 2: Task count */}
  <p className="mt-1 text-xs text-neutral-500">{completedTasks}/{totalTasks} tasks</p>

  {/* Row 3: Timestamp */}
  <p className="mt-0.5 text-xs text-neutral-400">{formattedDate} · {timeAgoFromMs(entry.completedAt || entry.updatedAt)}</p>

  {/* Row 4: Meta info */}
  <p className="mt-1 text-xs text-neutral-500">
    {agentCount} agents · Model {modelLabel} · Duration {durationStr} · Completion {completionPct}%
  </p>

  {/* Row 5: Buttons */}
  <div className="mt-3 flex flex-wrap items-center gap-2">
    {hasReport && (
      <button type="button" onClick={() => openReport(entry.id)}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
        View Report
      </button>
    )}
    {hasReport && (
      <button type="button" onClick={() => openFull(entry.id)}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
        Open Full
      </button>
    )}
    <button type="button" onClick={() => rerunFromTemplate(entry)}
      className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">
      New From Template
    </button>
  </div>
</div>
```

Status badge colors:
- Completed / done: `bg-emerald-500`
- Partial: `bg-orange-400`
- Aborted: `bg-red-500`

---

## 3. Active Mission Empty State

Make it spacious — min-h-[280px]:
```
<div className="flex min-h-[280px] items-center justify-center rounded-xl border border-neutral-200 bg-white">
  <div className="text-center">
    <p className="text-base font-semibold text-neutral-900">No active mission</p>
    <p className="mt-1 text-sm text-neutral-500">Start a mission to see inline agent output and timeline progress.</p>
    <button type="button" onClick={openNewMissionModal}
      className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
      + New Mission
    </button>
  </div>
</div>
```

---

## 4. Live Feed Card (Active Mission tab)

Wrap the existing LiveFeedPanel in this card:
```
<div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
  <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
    <div>
      <p className="font-semibold text-neutral-900 text-sm">Live Feed</p>
      <p className="text-xs text-neutral-500 mt-0.5">Last 5 events</p>
    </div>
    <button type="button" onClick={() => setLiveFeedVisible(true)}
      className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50">
      View All
    </button>
  </div>
  <div className="border-t border-neutral-100">
    <LiveFeedPanel compact />  {/* or render last 5 events inline */}
  </div>
</div>
```

---

## 5. Recovered Checkpoint Card

Style the existing restore checkpoint banner to match:
```
<div className="relative overflow-hidden rounded-xl border border-orange-200 bg-orange-50 p-4">
  <div className="absolute inset-y-0 left-0 w-1 rounded-l-xl bg-orange-500" />
  <div className="pl-3">
    <p className="text-[10px] font-bold uppercase tracking-wide text-orange-600">Recovered Checkpoint</p>
    <p className="mt-1 text-sm font-semibold text-orange-800">{restoreCheckpoint?.label}</p>
    <p className="mt-0.5 text-xs text-orange-600">
      Updated {timeAgoFromMs(restoreCheckpoint?.updatedAt)} · {restoreCheckpoint?.team?.length ?? 0} agents
    </p>
    <div className="mt-3 flex gap-2">
      <button type="button" onClick={handleRestore}
        className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">
        Restore
      </button>
      <button type="button" onClick={handleDiscard}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
        Discard
      </button>
    </div>
  </div>
</div>
```

---

## 6. Overview Sub-Tab — Recent Missions + Quick Launch sections

Recent Missions list items:
```
<div className="flex items-center justify-between gap-2 py-2.5 border-b border-neutral-100 last:border-0">
  <div className="min-w-0">
    <p className="truncate text-sm font-medium text-neutral-800">{mission.name}</p>
    <p className="text-xs text-neutral-400 mt-0.5">Duration {durationStr}</p>
  </div>
  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white",
    mission.failed ? "bg-orange-500" : "bg-emerald-500")}>
    {mission.failed ? "Aborted" : "Completed"}
  </span>
</div>
```

Quick Launch Teams chips:
```
<button className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700">
  {config.icon} {config.name} · {config.team.length}
</button>
```

---

## Files to Edit
- `src/screens/gateway/agent-hub-layout.tsx` — missions section only

## DO NOT TOUCH
- spawnAgentSession, ensureAgentSessions, executeMission, dispatchToAgent
- AgentOutputPanel SSE wiring, session polling useEffect
- stopMissionAndCleanup, handleMissionPause, handleSteerAgent
- agentSessionMap, agentSessionStatus, missionState, spawnState
- renderOverviewContent(), renderConfigureContent()

## Verify
1. npx tsc --noEmit (0 errors)
2. grep -n "api/sessions/send" src/screens/gateway/agent-hub-layout.tsx (must find dispatch)

## Commit
git add -A && git commit -m "feat: missions v2 design — segmented tabs, history cards with status borders, spacious empty states, recovered checkpoint card"
