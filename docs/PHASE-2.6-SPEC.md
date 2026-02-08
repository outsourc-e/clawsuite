# Phase 2.6 — File Explorer: Workspace Auto-Detect + Empty State

**Priority:** P0  
**Status:** Spec  
**Depends on:** v2.0.1 (merged)

## Goal

The file explorer currently shows "Failed to load files" when no workspace is configured or accessible. This is the first thing users see — it needs to work out of the box.

## Tickets

### P2.6-001: Workspace Auto-Detect

**Problem:** File explorer shows "Failed to load files" with no guidance.

**Solution:** Auto-detect the workspace from the Gateway connection.

Detection order:
1. Query Gateway for configured workspace path (`config.get` → `workspace.path`)
2. Fall back to `~/.openclaw/workspace` if Gateway doesn't report one
3. Fall back to graceful empty state if nothing found

**Acceptance criteria:**
- On first load, file explorer attempts auto-detection
- If detected: files load immediately, no user action needed
- If not detected: shows empty state (see P2.6-002)
- No full paths exposed in UI (show folder name only)

### P2.6-002: Graceful Empty State

**Problem:** "Failed to load files" is unhelpful and looks broken.

**Solution:** Replace error with a helpful empty state.

Empty state should show:
- Icon + friendly message ("No workspace selected")
- Brief explanation ("Select a folder to browse and edit files")
- "Select Workspace" button that opens folder picker
- Link to docs on workspace setup

**Acceptance criteria:**
- No error message on fresh install
- Clear call-to-action to set workspace
- Looks polished, matches existing glass card design

### P2.6-003: Remember Last Workspace

**Problem:** Workspace selection doesn't persist across sessions.

**Solution:** Store last workspace folder in localStorage.

**Acceptance criteria:**
- On workspace selection, save to `localStorage`
- On next load, restore from `localStorage` before auto-detect
- If saved path is no longer valid, fall back to auto-detect
- "Change Workspace" option available in file explorer header

## Deferred Issues

- **google-antigravity model mismatch** — Deferred, not blocking
- **OpenAI embeddings quota** — P1, see `docs/EMBEDDINGS-QUOTA-P1.md`

## Definition of Done

- File explorer works on fresh install without manual config
- Workspace persists across page refreshes
- No "Failed to load files" error visible to users
- Build passes, no regressions
