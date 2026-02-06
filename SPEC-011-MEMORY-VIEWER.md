# SPEC-011 Memory Viewer

## Summary

Phase 2 introduces a dedicated Memory Viewer at `/memory` for browsing and editing agent memory markdown:

- `MEMORY.md` at workspace root
- Daily memory notes under `memory/*.md`

The viewer uses a three-pane layout:

- Left: memory file list + metadata
- Center: Monaco markdown editor
- Right: markdown preview (toggleable)

It includes search, autosave status, read-only mode, API integration, and mock fallback data.

## Scope

### Route

- Added `src/routes/memory.tsx` for the full memory workspace.
- Added sidebar navigation link in `src/screens/chat/components/chat-sidebar.tsx` with `BrainIcon`.

### Components

Added under `src/components/memory-viewer/`:

- `MemoryFileList.tsx`
- `MemoryEditor.tsx`
- `MemoryPreview.tsx`
- `MemorySearch.tsx`

Supporting exports/types:

- `index.ts`
- `memory-types.ts`

## API Integration

### Existing Endpoints Used

- `GET /api/files?path=memory/*.md` for daily memory files
- `GET /api/files?path=MEMORY.*` for root memory file metadata
- `GET /api/files?action=read&path=<file>` for content
- `POST /api/files/write` behavior via existing `POST /api/files` with `action: "write"`

### API Enhancements

Updated `src/routes/api/files.ts`:

- `list` responses now include:
  - `size`
  - `modifiedAt`
- Added glob list support for `path` values containing `*`, enabling requests like:
  - `memory/*.md`
  - `MEMORY.*`

## Feature Details

### File Structure

- `MEMORY.md` is rendered as a top-level item.
- `memory/*.md` files are grouped by month (`YYYY-MM`) for daily note browsing.
- File rows display:
  - Size
  - Last modified timestamp

### Editor + Preview

- Monaco markdown editor with settings from existing app preferences:
  - font size
  - word wrap
  - minimap
- Markdown preview uses existing `Markdown` renderer.
- Split view with collapsible/toggleable panes.

### Save + Autosave

- Manual save button in editor toolbar.
- Autosave triggers after edit idle delay.
- Status indicator shows: `unsaved`, `saving`, `saved`, `error`.
- Read-only toggle disables edit/save.

### Search

- Search box scans all loaded memory file content.
- Results show `path:line` and snippet.
- Clicking a result opens the target file in editor/preview.

### Motion + Responsive

- Uses `motion/react` transitions for panel open/close.
- Desktop: horizontal split panes.
- Mobile: vertical stack.

## Mock Fallback

If memory API calls fail, viewer switches to demo mode with:

- `MEMORY.md`
- `memory/2026-02-06.md`

Demo mode still supports editing, preview, search, and save-state behavior in-memory.

## Verification

### Functional Checks

- `/memory` route renders and sidebar link navigates correctly.
- File list shows root + daily memory files with metadata.
- File selection updates editor and preview.
- Save and autosave update state indicators.
- Search returns cross-file matches.
- Read-only mode prevents edits from being persisted.
- Demo mode activates on API failure and remains fully usable.
