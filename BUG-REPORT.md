# OpenClaw Studio E2E Bug Report

Date: 2026-02-06
Project: `/Users/aurora/.openclaw/workspace/webclaw-ui`

## Execution Notes

- Full browser E2E could not be executed in this sandbox because local socket binding is blocked (`bind(127.0.0.1, ...) -> Operation not permitted`).
- Validation completed with:
  - Route/codepath audit
  - Production build (`npm run build`) to confirm app compiles
  - Static behavior verification against source for each requested scenario

## Summary by Requested Check

| # | Check | Status | Findings |
|---|---|---|---|
| 1 | All routes render without errors (`/dashboard`, `/skills`, `/terminal`, `/chat`, `/files`) | **FAIL** | `/chat` and `/files` routes do not exist; only `/chat/$sessionKey` and `/api/files` exist. |
| 2 | Cmd+K search modal opens and works | **BLOCKED (runtime)** | Keyboard handler and modal wiring are present in code. |
| 3 | Ctrl+` terminal panel toggles | **BLOCKED (runtime)** | Global keybinding toggles terminal panel store state in code. |
| 4 | Dashboard widgets are draggable | **BLOCKED (runtime)** | Widgets are rendered as `draggable` with drag handlers in code. |
| 5 | Skills browser loads and filters work | **BLOCKED (runtime)** | Skills page fetch/filter logic is implemented; runtime behavior not executable here. |
| 6 | File explorer shows files | **BLOCKED (runtime)** | File explorer fetches `/api/files?action=list` and renders tree/empty states. |
| 7 | Agent view panel opens/closes | **BLOCKED (runtime)** | Open/close controls and state toggles are implemented. |
| 8 | No console errors on any page | **BLOCKED** | Could not run pages in browser due sandbox socket restriction. |
| 9 | Dark theme consistent across all screens | **BLOCKED (visual)** | Theme defaults to dark at root script level; cross-screen visual verification blocked. |
| 10 | Mobile responsiveness | **BLOCKED (visual/runtime)** | Responsive class structure exists, but runtime viewport verification blocked. |

## Confirmed Bugs

1. **Missing required `/chat` route** (High)
- Requirement requested `/chat`, but only `/chat/$sessionKey` is routed.
- Evidence:
  - `src/routeTree.gen.ts`
  - `src/routes/chat/$sessionKey.tsx`

2. **Missing required `/files` route** (High)
- Requirement requested `/files`, but there is no page route for `/files`; only API route exists.
- Evidence:
  - `src/routeTree.gen.ts`
  - `src/routes/api/files.ts`

3. **Search modal agent result navigates to non-existent `/agents` route** (High)
- Selecting an agent result calls `window.location.assign('/agents')`, but `/agents` is not routed.
- Evidence:
  - `src/components/search/search-modal.tsx`
  - `src/routeTree.gen.ts`

## Additional Quality Signals

- Build succeeds (`npm run build`).
- Lint has extensive existing violations (`npm run lint` reports 184 errors, 3 warnings), increasing risk of regressions and hidden runtime defects.

## Recommended Next Actions

1. Add explicit routes for `/chat` (redirect to `/chat/main`) and `/files` (dedicated files screen or redirect behavior).
2. Fix search agent navigation target (`/agents`) to a valid route.
3. Re-run full browser E2E in an environment that allows localhost binding to complete checks #2-#10 with runtime evidence (screenshots/console logs).
