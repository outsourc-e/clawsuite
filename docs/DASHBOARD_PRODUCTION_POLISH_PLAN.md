# Dashboard Production Polish — 3 PR Plan

**Repo:** https://github.com/outsourc-e/openclaw-studio
**Scope:** UI/UX polish only. No new backend features or API routes.
**Goal:** Enterprise-grade dashboard: consistent chrome, disciplined grid, responsive layouts, proper nav hierarchy.

---

## Current State Analysis

### Widget Chrome
- **DashboardGlassCard** — used by all 11 widgets. Provides: icon, title, description, badge, children.
- **WidgetChrome** — dead code (imported nowhere). Has footer debug text + settings/close buttons.
- **DragHandle** — separate component in `dashboard-screen.tsx`, overlaid via `absolute right-2 top-2`.
- **Problem:** DragHandle floats over widget content. No unified action bar. Hover-float on all cards.

### Grid
- react-grid-layout with 12-col layout, `rowHeight=70`, `margin=[10,10]`, `compactType="vertical"`.
- No `minW`/`maxW`/`minH`/`maxH` constraints — widgets can be dragged to any size slot.
- Only `lg` layout defined. `md`/`sm`/`xs` auto-derive (poorly).
- Whitespace gaps from mismatched widget content height vs grid cell height.

### Navigation
- Quick Actions is a draggable widget (can be moved below fold).
- No hero metrics row — weather + time occupy prime real estate.
- No persistent nav for core actions.

---

## PR Breakdown

### PR1: Unified Widget Wrapper + Visual Cleanliness
**Branch:** `phase-dashboard-polish-1`

**Changes:**
| File | Action |
|------|--------|
| `src/screens/dashboard/components/dashboard-glass-card.tsx` | Refactor: add optional drag handle, remove hover-float, add action slots |
| `src/screens/dashboard/components/widget-chrome.tsx` | DELETE (dead code) |
| `src/screens/dashboard/dashboard-screen.tsx` | Remove DragHandle component, integrate drag into DashboardGlassCard |
| `src/screens/dashboard/components/*-widget.tsx` (x11) | Verify consistent use of updated wrapper |
| `docs/QA/dashboard_polish_PR1_TESTPLAN.md` | New |
| `docs/QA/dashboard_polish_PR1_RESULTS.md` | New |

**Key decisions:**
- Keep `DashboardGlassCard` as the single wrapper (rename optional, but avoid churn).
- Add `draggable?: boolean` prop — renders drag handle in header when true.
- Remove `hover:-translate-y-0.5 hover:shadow-md` from all cards.
- Replace with `hover:border-primary-300` only (subtle, no motion).
- Delete `widget-chrome.tsx` entirely.
- Remove absolute-positioned DragHandle overlay from dashboard-screen.tsx grid items.

### PR2: Grid Discipline + Responsive Breakpoints
**Branch:** `phase-dashboard-polish-2`

**Changes:**
| File | Action |
|------|--------|
| `src/screens/dashboard/dashboard-screen.tsx` | Define size tiers, per-breakpoint layouts, widget constraints |
| `src/screens/dashboard/constants/grid-config.ts` | New: size tier definitions, breakpoint layouts |
| `docs/QA/dashboard_polish_PR2_TESTPLAN.md` | New |
| `docs/QA/dashboard_polish_PR2_RESULTS.md` | New |

**Size tiers:**
- **S** (small): `w=3, h=3` — Weather, Time, System Status
- **M** (medium): `w=6, h=4` — Usage Meter, Cost Tracker, Tasks, Agent Status
- **L** (large): `w=8, h=4` — Recent Sessions, Notifications
- **XL** (full-width): `w=12, h=3` — Quick Actions (until PR3 moves it)

**Breakpoint layouts:**
- `lg` (≥1080): 12 cols — full layout
- `md` (≥768): 8 cols — M→8, S→4, L→8
- `sm` (≥480): 4 cols — all widgets full-width stack
- `xs` (<480): 4 cols — single column stack

### PR3: Navigation Hierarchy + Hero Metrics
**Branch:** `phase-dashboard-polish-3`

**Changes:**
| File | Action |
|------|--------|
| `src/screens/dashboard/dashboard-screen.tsx` | Add hero row, move Quick Actions to header, reorder widgets |
| `src/screens/dashboard/components/hero-metrics-row.tsx` | New: compact stat cards |
| `src/screens/dashboard/components/quick-actions-widget.tsx` | Refactor: non-draggable, header-integrated |
| `docs/QA/dashboard_polish_PR3_TESTPLAN.md` | New |
| `docs/QA/dashboard_polish_PR3_RESULTS.md` | New |

**Hero metrics (data sources — all existing):**
- **Spend**: from `/api/cost` (billing period total)
- **Active Sessions**: from `/api/session-status` → `sessions.count`
- **Current Model**: from `/api/session-status` → `sessions.recent[0].model`
- **Uptime**: from `/api/session-status` → `sessions.recent[0].age`

---

## Screenshots Checklist

Each PR must verify:
- [ ] Desktop (1440px) — full layout, no whitespace gaps
- [ ] Tablet (768px) — responsive reflow, no overflow
- [ ] Mobile (375px) — single column, no horizontal scroll
- [ ] Drag & drop — handle visible, works correctly
- [ ] Hover states — no float, subtle border only
- [ ] Dark mode (if applicable) — no broken contrast

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Breaking existing widget data wiring | PR1 only changes wrapper chrome, not data fetching. Each widget's query/render logic untouched. |
| react-grid-layout constraint bugs | Test with `npm run build` + manual drag testing. Keep `isResizable={false}` for now. |
| Mobile layout untested | PR2 explicitly adds breakpoint layouts. QA includes 375px viewport check. |
| Merge conflicts with gateway-wiring branch | PR1 branches from latest `phase-dashboard-gateway-wiring`. Merge gateway branch to main first. |

---

## Merge Order

1. Merge `phase-dashboard-gateway-wiring` → `main` (prerequisite)
2. PR1: `phase-dashboard-polish-1` → `main`
3. PR2: `phase-dashboard-polish-2` → `main`
4. PR3: `phase-dashboard-polish-3` → `main`
