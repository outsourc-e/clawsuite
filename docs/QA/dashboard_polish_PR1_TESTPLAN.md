# PR1: Unified Widget Wrapper + Visual Cleanliness — Test Plan

## Pre-flight
- [x] `npm run build` passes with zero errors
- [x] Security grep clean: `grep -r "apiKey\|secret\|token\|password" src/screens/dashboard/` — no secrets found
- [x] `widget-chrome.tsx` deleted (was dead code)

## Visual Checks (Screenshots Needed)
- [ ] Desktop (1440px): All 11 widgets render, no broken layout
- [ ] No hover-float: Cards do NOT lift on hover (no translateY, no shadow-md)
- [ ] Hover state: Subtle border highlight only (border-primary-300)
- [ ] Drag handle: Each widget shows a grab icon (✋) in the header, integrated (not floating overlay)
- [ ] Drag works: Can grab the handle and reorder widgets
- [ ] Widget headers: Consistent spacing — icon + title + description aligned across all 11
- [ ] No debug text: No "Widget X • size MD" footer anywhere

## Functional Checks
- [ ] All 11 widgets load data correctly (usage, cost, sessions, agents, weather, etc.)
- [ ] Quick Actions buttons navigate correctly
- [ ] Reset Layout button works
- [ ] Add Widget button disabled with tooltip
- [ ] Activity Log SSE connection works
- [ ] Layout persists in localStorage after drag

## Files Changed
- `dashboard-glass-card.tsx` — added `draggable` prop with integrated handle
- `dashboard-screen.tsx` — removed DragHandle component + DragDropIcon import, simplified grid items
- `widget-chrome.tsx` — DELETED
- All 11 widget files — added `draggable?: boolean` prop, forwarded to DashboardGlassCard

## Regression Risk: LOW
- No data fetching logic changed
- No API routes changed
- Only wrapper chrome and styling affected
