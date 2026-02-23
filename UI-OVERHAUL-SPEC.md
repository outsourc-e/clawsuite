# UI Overhaul Spec — Premium Enterprise Agent Hub

## Overview
Transform the Agent Hub from "functional prototype" to premium enterprise-grade mission control. Light theme only. Orange (#f97316) brand accent.

## Files to modify
- `src/screens/gateway/agent-hub-layout.tsx` (main file, ~5400 lines)
- `src/screens/gateway/components/overview-tab.tsx`
- `src/screens/gateway/components/configure-tab.tsx`
- `src/screens/gateway/components/missions-tab.tsx`
- `src/screens/gateway/components/office-view.tsx`
- `src/screens/gateway/components/agent-avatar.tsx`

## 1. Overview Tab — Fix Stats Bar + Widget Cards

### Stats Bar (top row of KPI cards)
- **BUG**: Cards are clipped/cropped at bottom — text cut off. Fix the container height/overflow.
- Make each stat a proper card with padding: `p-4 rounded-xl border border-neutral-200 bg-white`
- Use `grid grid-cols-3 md:grid-cols-6 gap-3` for responsive layout
- Label: `text-xs font-medium text-neutral-500 uppercase tracking-wider`
- Value: `text-lg font-semibold text-neutral-900`

### Office Canvas
- Reduce height from ~40% viewport to max `h-[320px]`
- Agents in the office should have speech bubbles showing their current status/last action (like "Idle", "Analyzing code...", "Waiting for task")
- Make agent sprites larger and more readable
- Remove or reduce decorative trees/plants — keep it clean

### Widget Cards (TEAM / ACTIVITY / APPROVALS / CURRENT SESSION / REPORTS / MISSIONS)
- Use consistent card style: `rounded-xl border border-neutral-200 bg-white shadow-sm`
- **Don't force equal heights** — let cards size to content with `auto` grid rows
- Empty states: Add subtle icon + helpful text instead of plain "No recent activity yet."
  - Activity: calendar icon + "Activity will appear when agents start working"
  - Approvals: shield-check icon + "No pending approvals"
  - Reports: document icon + "Reports generate after missions complete"
- Card headers: `text-sm font-semibold text-neutral-900` (not tiny gray small-caps)
- Add subtle hover effect: `hover:shadow-md transition-shadow`

### Layout
- Use `grid grid-cols-1 lg:grid-cols-3 gap-4` for widget rows
- Add proper section spacing: `space-y-6` between rows

## 2. Configure Tab — Convert to Modal/Overlay

### Current Problem
The Configure tab uses a left sidebar + right content layout that wastes 50% of screen space.

### Solution: Full-width settings panel (not a popup, but better layout)
- Remove the left sidebar nav — use horizontal tabs/pills instead: `Agents | Teams | API Keys | Approvals`
- Pills: `flex gap-2 mb-6`, each pill `px-4 py-2 rounded-lg text-sm font-medium`
- Active: `bg-orange-50 text-orange-600 border border-orange-200`
- Inactive: `text-neutral-600 hover:bg-neutral-50`

### Agent Cards — Make Smaller and Denser
- Use a **2-column grid** for agent cards: `grid grid-cols-1 lg:grid-cols-2 gap-4`
- Each card: `rounded-xl border border-neutral-200 bg-white p-5`
- Compact layout:
  - Top row: Avatar (48px) + Name + Model badge inline
  - Role: single line below
  - System prompt: collapsed by default, expand icon
- Avatar picker: Move to a dropdown/popover instead of inline row of tiny dots
- Remove the giant orange left border — use a subtle `border-l-3` with agent accent color
- "Add Agent" button: Move below the grid, centered, as a dashed-border card: `border-2 border-dashed border-neutral-300 rounded-xl p-8 text-center hover:border-orange-400 cursor-pointer`

## 3. Missions Tab — Premium Kanban

### Current Problem
Kanban looks like a placeholder. Empty states are bare. Cards need more depth.

### Column Headers
- Each column: colored dot + name + count badge
- Draft: `text-neutral-400` dot, Running: `text-green-500` dot, Review: `text-blue-500` dot, Done: `text-amber-500` dot
- Background: subtle column tint — Draft `bg-neutral-50`, Running `bg-green-50/30`, Review `bg-blue-50/30`, Done `bg-amber-50/30`

### Mission Cards
- Card: `rounded-xl border border-neutral-200 bg-white shadow-sm p-4 hover:shadow-md transition-all`
- Title: `text-sm font-semibold text-neutral-900`
- Description: show full text (don't truncate), `text-xs text-neutral-500`
- Agent badges: Show full names with colored dots, not cryptic "FO", "SE", "SP"
- Stats grid: clean 2-col layout, format cost as "$0.00" (2 decimals, not 4)
- Status badge: pill with background color matching column
- Add subtle gradient or accent line at card top matching status color

### Empty States
- Replace plain "No missions" with:
  - Icon (rocket for Running, eye for Review, trophy for Done)
  - Helpful subtext: "Missions move here when launched", "Completed missions await your review", "Archived missions and reports"
- Style: `flex flex-col items-center justify-center py-12 text-neutral-400`

### "+ New Mission" Button
- Make it more prominent: `bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm`
- Add a `+` icon before text

## 4. General Polish

### Typography Scale
- Page title: `text-xl font-bold text-neutral-900`
- Section headers: `text-sm font-semibold text-neutral-900 uppercase tracking-wider`
- Body text: `text-sm text-neutral-700`
- Captions: `text-xs text-neutral-500`
- Labels: `text-xs font-medium text-neutral-500`

### Color System
- Primary action: `bg-orange-500 text-white`
- Secondary action: `bg-neutral-100 text-neutral-700 border border-neutral-200`
- Success: `text-green-600 bg-green-50`
- Info: `text-blue-600 bg-blue-50`
- Warning: `text-amber-600 bg-amber-50`
- Danger: `text-red-600 bg-red-50`

### Card System
- Standard card: `rounded-xl border border-neutral-200 bg-white shadow-sm`
- Hover: `hover:shadow-md transition-shadow duration-200`
- Interactive card: add `cursor-pointer`
- Selected: `ring-2 ring-orange-500 border-orange-500`

### Buttons
- Primary: `bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-colors`
- Secondary: `bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 rounded-lg px-4 py-2 text-sm font-medium transition-colors`
- Ghost: `text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg px-3 py-1.5 text-sm transition-colors`

## 5. Technical Requirements
- All changes must pass `npx tsc --noEmit`
- Light theme only — no `dark:` classes
- Keep all existing functionality (mission execution, SSE, team configs, etc.)
- Don't break imports or remove used functions
- Prefix unused functions/vars with `_` if needed for TS
