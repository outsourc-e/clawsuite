# Phase 3.2 — Global Search (Real Data)

**Priority:** P0 UX  
**Branch:** phase3.2-global-search  
**Base:** v2.0.3

## Goal

Wire the existing SearchModal to **real data sources** with minimal backend changes.

## Current State

SearchModal exists with:
- ✅ Cmd/Ctrl+K to open
- ✅ Filter pills: All / Files / Sessions / Skills / Activity
- ✅ Keyboard nav (↑↓, Enter, Esc)
- ❌ Mock data only

## Changes

### Data Sources (No New API Routes)

| Scope | Source | Implementation |
|-------|--------|----------------|
| **Sessions** | `/api/sessions` (exists) | Query existing sessions list, filter client-side by title/key |
| **Files** | `/api/files` (exists) | Query existing file tree, flatten + filter by path/name |
| **Skills** | Static list (exists) | Reuse current skills browser dataset, no backend |
| **Activity** | `useActivityEvents` hook (exists) | Search in-memory event stream by title/detail |

### Search Logic

Client-side filtering:
- Sessions: match against `friendlyId`, `key`, message preview
- Files: match against `path`, `name`
- Skills: match against `name`, `description`
- Activity: match against `title`, `detail`, `source`

### Result Actions

| Type | Action |
|------|--------|
| File | Navigate to `/files?open={path}` or insert reference |
| Session | Navigate to `/chat/{sessionKey}` |
| Skill | Navigate to `/skills?id={skillId}` |
| Activity | Navigate to `/activity` and scroll to event |

## Files Changed

- `src/components/search/search-modal.tsx` — Replace mocks with real queries
- `src/hooks/use-search-data.ts` — NEW: Centralized search data fetching
- `src/components/search/search-results.tsx` — Update to handle real data types
- `docs/QA/phase3.2-global-search_TESTPLAN.md` — Test steps
- `docs/QA/phase3.2-global-search_RESULTS.md` — Test results

## Manual Test Plan

### T1: Search Sessions
1. Open search (Cmd+K)
2. Type a session name
3. **Expected:** Real sessions appear, click navigates to `/chat/{key}`

### T2: Search Files
1. Open search (Cmd+K)
2. Click "Files" filter
3. Type a file name
4. **Expected:** Real files from workspace appear

### T3: Search Skills
1. Open search (Cmd+K)
2. Click "Skills" filter
3. Type a skill name
4. **Expected:** Static skills list filtered

### T4: Search Activity
1. Open search (Cmd+K)
2. Click "Activity" filter
3. Type an event keyword
4. **Expected:** Recent events from in-memory stream appear

### T5: Keyboard Nav
1. Open search
2. Use ↑↓ to navigate results
3. Press Enter on a result
4. **Expected:** Navigates to correct page

## Security Check

```bash
grep -rn "token\|secret\|apiKey\|password" src/components/search/ src/hooks/use-search-data.ts
```

Expected: No matches (all data comes pre-sanitized from existing APIs)

## Risks

- **Low:** No new API routes, reusing existing endpoints
- **Low:** Client-side filtering may be slow with 100+ files/sessions (future: debounce + limit)
- **None:** No secret exposure (all APIs already sanitized)

## Deferred

- Server-side search indexing (future optimization)
- Search result preview/highlighting (UX enhancement)
- Search history/recent searches (Phase 3.3 persistence)
