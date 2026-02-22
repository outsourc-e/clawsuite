# ClawSuite QA Review — Navigation, Cron, Settings, Performance

Date: 2026-02-22
Scope: Navigation/routing, cron manager, settings, skills, shared components, performance
Source: Agent 3 findings (extracted from analysis logs)

## Severity Scale
- `P0`: Critical security/data-loss issue; immediate fix
- `P1`: High severity functional bug / broken workflow
- `P2`: Medium severity reliability/UX correctness issue
- `P3`: Low severity polish/edge-case issue

## Findings

### 1. P1 - WorkspaceShell keys route outlet by pathname, forcing full remounts on every navigation
- **Files:** `src/components/workspace-shell.tsx`
- **Issue:** Route outlet is keyed by pathname, which forces React to unmount/remount the entire route tree on every navigation. This destroys all local component state (scroll position, form inputs, expanded/collapsed sections).
- **Impact:** Screen-local state is lost on every navigation. Combined with tab unmounting in Agent Hub (#11 in Hub report), this makes the app feel "forgetful."
- **Suggested fix:** Remove pathname key from outlet, or use CSS-based show/hide for tab content.

### 2. P1 - Task store client/server ID mismatch causes silent data loss
- **Files:** `src/stores/task-store.ts`, `src/routes/api/tasks/$taskId.ts`
- **Issue:** Task store generates client-side IDs that may not match server-side task IDs. PATCH/DELETE operations using mismatched IDs silently fail (server returns 404, client doesn't surface error).
- **Impact:** Tasks can appear to save/delete in the UI but not persist on the server. Data loss on refresh.
- **Suggested fix:** Always use server-returned IDs. Surface 404/error responses in the UI.

### 3. P1 - Dual theme stores cause dark mode inconsistency
- **Files:** `src/hooks/use-chat-settings.ts` (chatSettings store), `src/hooks/use-settings.ts` (studioSettings store), `src/components/theme-toggle.tsx`
- **Issue:** `theme-toggle.tsx` writes to `useChatSettingsStore` while settings page writes to `useSettingsStore`. Both persist to different localStorage keys. Theme can get out of sync.
- **Impact:** User changes theme in settings → sidebar toggle shows wrong state (or vice versa). Dark mode flickers on reload.
- **Suggested fix:** Unify theme into a single store. Remove the duplicate. Migrate localStorage key.

### 4. P2 - Skills screen has no error state for failed API query
- **Files:** `src/screens/skills/skills-screen.tsx`
- **Issue:** `skillsQuery.isError` is never checked. When the `/api/skills` endpoint fails, the screen renders the empty state ("No skills found") instead of showing an error.
- **Impact:** Network failures look like "no skills installed" — misleading and no retry affordance.
- **Suggested fix:** Add `skillsQuery.isError` check and render error state with retry button.

### 5. P2 - Settings page persists invalid gateway URL before validation completes
- **Files:** `src/routes/settings/index.tsx`
- **Issue:** `gatewayUrl` is written to the settings store on every keystroke via `updateSettings()`. If the user types an invalid URL and navigates away, the invalid URL is persisted.
- **Impact:** Gateway connection breaks until user manually corrects the URL.
- **Suggested fix:** Debounce URL persistence or only persist on blur/explicit save. Validate before write.

### 6. P2 - Cron manager uses `ok: false` on HTTP 200, frontend may not detect failures
- **Files:** `src/routes/api/cron/run.ts`, `src/routes/api/cron/toggle.ts`
- **Issue:** Cron API routes return `{ ok: false, error: '...' }` with HTTP 200 status for some failure cases. Frontend code that checks `response.ok` (HTTP status) won't catch these.
- **Impact:** Silent cron operation failures — user thinks toggle/run succeeded.
- **Suggested fix:** Return appropriate HTTP status codes (400/500) alongside `ok: false`. Or ensure frontend checks the JSON `ok` field.

### 7. P2 - No virtualization on large lists (sessions, tasks, skills, cron jobs)
- **Files:** `src/screens/chat/components/sidebar/sidebar-sessions.tsx`, `src/screens/skills/skills-screen.tsx`
- **Issue:** All list views render every item in the DOM. No windowing/virtualization.
- **Impact:** Performance degrades with 50+ sessions, 100+ skills, etc. Especially noticeable on mobile.
- **Suggested fix:** Add `react-window` or `@tanstack/react-virtual` for lists exceeding ~30 items.

### 8. P2 - Missing React.memo / useMemo in high-frequency render paths
- **Files:** Various dashboard widgets, chat message list
- **Issue:** Dashboard widgets and chat messages re-render on every parent state change (polling interval, streaming tick). No memoization boundaries.
- **Impact:** Unnecessary re-renders, especially during streaming (every chunk triggers full message list re-render).
- **Suggested fix:** Wrap message bubbles and widget components in `React.memo`. Memoize derived data.

### 9. P3 - Theme toggle lacks aria-label describing current state
- **Files:** `src/components/theme-toggle.tsx`
- **Issue:** Button cycles through themes but doesn't announce current theme to screen readers.
- **Suggested fix:** Add `aria-label={`Switch theme (currently ${theme})`}`.

### 10. P3 - Missing error boundaries around route-level screens
- **Files:** `src/components/workspace-shell.tsx`
- **Issue:** No React error boundaries wrap screen-level components. A render error in any screen crashes the entire app.
- **Suggested fix:** Add `<ErrorBoundary>` at the route outlet level with a fallback UI.

## Recommended Next Actions
1. Fix the dual theme store (P1) — quick win, user-visible.
2. Fix task ID mismatch (P1) — data loss risk.
3. Remove pathname keying on workspace shell — major UX improvement.
4. Add error states to Skills + Cron screens.
5. Add list virtualization as screens grow.
