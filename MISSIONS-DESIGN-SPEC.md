# Missions Tab — Design Spec (Match Configure Page 1:1)

## Goal
Make the Missions tab use IDENTICAL design language as the Configure page.
Visual changes only. No dispatch logic, no session management.

---

## 1. Background & Container

Configure page uses:
- Root: `relative flex h-full min-h-0 flex-col bg-neutral-50/80`
- Gradient overlay: `absolute inset-0 bg-gradient-to-br from-neutral-100/60 to-white`
- Inner content: `relative mx-auto flex w-full max-w-[1200px] flex-col gap-4`

Missions tab MUST match exactly — same bg, same gradient, same max-w-[1200px] centering.

---

## 2. Tab Pill Style (CRITICAL — match Configure exactly)

Configure active tab:
```
border border-orange-200 bg-orange-50 text-orange-700
```
Configure inactive tab:
```
border border-transparent text-neutral-600 hover:bg-neutral-100
```

Both use: `flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap`

Missions sub-tabs (Overview / Active Mission / History) MUST use this exact same style.
- Remove the sliding underline animation
- Remove the animated span indicator
- Remove the pill-border (border border-[#F57C00]) style
- Replace with Configure's bg-orange-50 + border-orange-200 style

---

## 3. Header Style (match Configure)

Configure header:
- Title: `text-lg font-bold text-neutral-900` — "Settings"
- Subtitle: `text-xs text-neutral-500` — description text
- Right side: Back button (← Back)

Missions header:
- Title: `text-lg font-bold text-neutral-900` — "Mission Control"
- Subtitle: `text-xs text-neutral-500` — "Track active runs, review history, and launch new missions"
- Right side: Stop Mission + New Mission buttons (keep existing logic)

Use SAME font sizes as Configure (text-lg not text-2xl).

---

## 4. Overview Tab — Add Widget Cards from Agent Hub

The Overview tab should show the SAME 3 widget cards that appear on the Agent Hub Overview page (Active Team, Recent Missions, Usage & Cost) BELOW the stat cards.

These cards already exist in `renderOverviewContent()` in agent-hub-layout.tsx.
Extract them into a shared sub-component or copy the JSX into the missions overview tab.

The widget cards use:
```
const cardCls = 'relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm'
```
They should appear in a `grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3` below the existing stat cards.

---

## 5. Stat Cards (Overview Tab)

Current stat cards need slight update to match Configure card style:
- Use `rounded-xl border border-neutral-200 bg-white p-4` (NO shadow-sm — matches Configure cards)
- Labels: `text-[10px] font-semibold uppercase tracking-wide text-neutral-500`
- Values: `text-lg font-bold text-neutral-900`

---

## 6. Content Cards (Active Mission, History tabs)

All cards on Mission tab must use same card style as Configure:
- `rounded-xl border border-neutral-200 bg-white p-4` (no extra shadow)
- No hardcoded hex colors
- Use Tailwind semantic colors: `text-neutral-900`, `text-neutral-500`, `border-neutral-200`

Replace hardcoded hex colors in agent-hub-layout.tsx missions section:
- `text-[#E8552E]` → `text-red-600`
- `text-[#777]` → `text-neutral-500`
- `text-[#888]` → `text-neutral-400`
- `text-[#333]` → `text-neutral-800`
- `text-[#555]` → `text-neutral-600`
- `border-[#E0E0E0]` → `border-neutral-200`
- `bg-[#F57C00]` → `bg-orange-500`
- `bg-[#00875A]` → `bg-emerald-700`
- `text-[#2E7D32]` → `text-emerald-800`
- `bg-[#E8F5E9]` → `bg-emerald-50`
- `border-[#4CAF50]` → `border-emerald-500`
- `bg-[#F5F5F0]` → `bg-neutral-50/80` (use the standard page bg)

---

## 7. Mission Timeline (mission-timeline.tsx)

Replace hardcoded hex colors with Tailwind:
- `bg-[#FFA726]` → `bg-orange-400`
- `bg-[#4A90D9]` → `bg-blue-500`
- `bg-[#0FAF6E]` → `bg-emerald-500`
- `bg-[#BDBDBD]` → `bg-neutral-300`
- `text-[#888]` → `text-neutral-400`
- `text-[#777]` → `text-neutral-500`
- `border-[#E0E0E0]` → `border-neutral-200`
- `bg-[#E8F5E9]` → `bg-emerald-50`
- `border-[#4CAF50]` → `border-emerald-500`
- `text-[#2E7D32]` → `text-emerald-800`
- `text-[#4CAF50]` → `text-emerald-600`
- `text-[#555]` → `text-neutral-600`

---

## Files to Edit
1. `src/screens/gateway/agent-hub-layout.tsx` — missions section only
2. `src/screens/gateway/components/mission-timeline.tsx` — color cleanup

## DO NOT TOUCH
- spawnAgentSession, ensureAgentSessions, executeMission, dispatchToAgent
- AgentOutputPanel SSE wiring
- Session polling useEffect
- stopMissionAndCleanup, handleMissionPause, handleSteerAgent
- agentSessionMap, agentSessionStatus, missionState, spawnState
- renderOverviewContent() logic (only the card JSX for the 3 widgets needs to be reused)
- renderConfigureContent() — do not change Configure page at all

## Verify
1. npx tsc --noEmit (0 errors)
2. grep -n "api/sessions/send" src/screens/gateway/agent-hub-layout.tsx (must find it)
3. No hardcoded hex colors (#F57C00, #E0E0E0, etc.) remaining in missions section

## Commit
git add -A && git commit -m "feat: missions tab matches Configure design language — Tailwind colors, shared tab style, widget cards in overview"

---

## CORRECTION: Section 4 Update

Do NOT add the 3 widget cards (Active Team / Recent Missions / Usage & Cost) to the Missions tab.
Remove that instruction from Section 4.

Instead: Apply the VISUAL STYLE of the overview widget cards to the EXISTING cards on the Missions tab.

Overview widget card style to replicate on all Missions cards:
```
relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm
```
With orange top accent bar as first child:
```
<div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-orange-500 via-orange-400/40 to-transparent" />
```

Apply this to ALL cards in the Missions tab:
- The 3 stat cards (Mission State / Tasks / Total Reports)
- The mission goal card (Active Mission tab)
- The agent cards in the timeline (mission-timeline.tsx)
- The live feed card
- The empty state card
- History cards
