# Phase 2.0 Codex Task — Release Hardening & QA

## Context
OpenClaw Studio at `~/.openclaw/workspace/webclaw-ui/` (Vite + React + TanStack Router).
All Phase 1.x features are merged: model switcher, usage/cost, activity log, debug console, provider wizard.

## Task
Prepare Studio for a v2.0.0 release by auditing all features, fixing issues, and creating release docs.

## Requirements

### 1. Feature Audit
Scan ALL screens and components for:
- Any remaining demo-only UI (hardcoded data, placeholder text like "Lorem ipsum", fake numbers)
- Any "Coming Soon" or "TODO" text visible to users — either implement or remove
- Disabled features that aren't clearly marked as such
- Broken links or dead routes

Files to scan:
- All files in `src/screens/` (every screen)
- All files in `src/routes/` (every route)  
- All dashboard widgets in `src/screens/dashboard/components/`
- Sidebar in `src/screens/chat/components/chat-sidebar.tsx`

### 2. Error Handling Audit
Check ALL API routes in `src/routes/api/` for:
- Silent failures (catch blocks that swallow errors)
- Missing error responses (should return proper HTTP status + JSON error)
- Gateway errors that aren't surfaced clearly
- Any `catch {}` or `catch { /* ignore */ }` that should log or return errors

Fix any issues found. Every API route should:
- Return `{ ok: true, ...data }` on success
- Return `{ ok: false, error: string }` with appropriate HTTP status on failure
- Never expose stack traces or internal paths to the browser

### 3. README Update
Update the root `README.md` to reflect the current state:
- Project description: "OpenClaw Studio — Desktop control panel for OpenClaw AI agents"
- Features list (model switcher, usage/cost dashboard, activity log, debug console, provider setup wizard)
- Getting started: `npm install` → `npm run dev` → open localhost:5173
- Architecture overview (Vite + React + TanStack Router, Gateway RPC via WebSocket)
- Link to `/docs` for detailed documentation
- No marketing language or roadmap promises — just facts about what exists NOW

### 4. Docs Index
Create `docs/INDEX.md`:
- List all docs with one-line descriptions
- Organized by phase/feature
- Links to each doc file

### 5. Release Checklist
Create `docs/RELEASE_CHECKLIST.md`:
- Pre-release checklist (build passes, no console.logs, no secrets, tests pass)
- Version bump instructions
- Tag + changelog format
- Post-release verification steps

### 6. Changelog
Create `CHANGELOG.md` at project root:
- v2.0.0 entry with all features since v0.1.1-alpha:
  - Phase 1.1: Model switcher (Gateway RPC integration)
  - Phase 1.2: Model switcher fixes (provider format, filtering)
  - Phase 1.3: Model switcher safeguards (undo toast, confirmations, premium detection)
  - Phase 1.4: Usage + cost parity (real Gateway data)
  - Phase 1.5: Activity log & event stream
  - Phase 1.6: Gateway debug console
  - Phase 1.7: Provider setup wizard foundation
  - Phase 2.0: Release hardening & QA

### 7. Version Bump
- Update version in `package.json` to `2.0.0`
- Ensure the version is consistent anywhere else it appears

## Safety
- No secrets in README or docs
- No internal paths exposed (no `/Users/aurora/...`)
- No marketing promises about future features
- Changelog is factual — only lists what was actually built

## Final checks
1. `npm run build` must succeed
2. `README.md` contains no private paths or keys
3. All docs reference correct file paths
4. Version is `2.0.0` in `package.json`
5. Git add all new/modified files
