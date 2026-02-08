# Phase 4.3 — Session Presets (Modes)

**Status:** 🟡 Spec  
**Branch:** `phase4.3-session-presets`  
**Depends on:** Phase 4.2 (pinned models + preferred defaults)

---

## Goal

Add **Modes** so users can quickly apply a preset configuration for model + suggestion behavior. Think "work mode," "deep thinking mode," "budget mode," etc.

---

## Requirements

### 1. Mode Selector UI
- **Location:** Near model switcher in chat composer
- **Trigger:** Button or dropdown (design TBD in implementation)
- **States:**
  - No mode applied (default)
  - Mode applied (show mode name)
  - Mode unavailable (model missing from catalog)

### 2. Mode Storage
- **Persistence:** `localStorage` (key: `openclaw-modes`)
- **Format:**
```typescript
interface Mode {
  id: string;                      // UUID
  name: string;                    // User-defined
  preferredModel?: string;         // Model ID (optional)
  smartSuggestionsEnabled: boolean;
  onlySuggestCheaper: boolean;
  preferredBudgetModel?: string;   // Model ID (optional)
  preferredPremiumModel?: string;  // Model ID (optional)
}
```

### 3. Mode Actions

#### Save Current as New Mode
- Prompt for mode name
- Capture current settings:
  - Current model (optional: "Include current model?")
  - Smart Suggestions toggle
  - Only Suggest Cheaper toggle
  - Preferred Budget/Premium models
- Save to localStorage
- Show success toast

#### Rename Mode
- Prompt for new name
- Update localStorage
- Show success toast

#### Delete Mode
- Confirm deletion
- Remove from localStorage
- If currently applied, clear mode state
- Show success toast

#### Apply Mode
1. **Update settings immediately:**
   - Set `smartSuggestionsEnabled`
   - Set `onlySuggestCheaper`
   - Set `preferredBudgetModel`
   - Set `preferredPremiumModel`

2. **Handle model switch:**
   - If mode specifies `preferredModel`:
     - Check if model exists in catalog
     - If **available**: Show confirmation dialog:
       ```
       Switch to [model name]?
       [Switch Now] [Skip]
       ```
     - If **unavailable**: Show warning toast:
       ```
       Mode "[mode name]" requires [model id] which is not available.
       You can edit this mode or choose a different one.
       [Edit Mode] [Dismiss]
       ```
   - If mode does **not** specify `preferredModel`: skip model switch

3. **Track applied mode:**
   - Store `appliedModeId` in state (not localStorage)
   - Show mode name in UI
   - Clear if user manually changes settings

### 4. Mode Management UI

**Options:**
- **Option A:** Dropdown menu with mode list + actions
- **Option B:** Modal dialog with mode cards + action buttons
- **Option C:** Popover with mode list + inline actions

**Recommended:** Option A (dropdown) for consistency with model switcher.

**Dropdown structure:**
```
[Current Mode: Work Mode ▼]
  ✓ Work Mode (applied)
  Deep Thinking
  Budget Mode
  ────────────────
  Save Current as New Mode...
  Manage Modes...
```

**Manage Modes modal:**
```
Modes
────────────────────────────
Work Mode
  Model: claude-sonnet-4-5
  Smart Suggestions: On
  Only Suggest Cheaper: Off
  [Rename] [Delete]

Deep Thinking
  Model: claude-opus-4-5
  Smart Suggestions: Off
  Only Suggest Cheaper: Off
  [Rename] [Delete]

[Close]
```

### 5. Accessibility

- **Keyboard navigation:**
  - `Tab` / `Shift+Tab` to navigate
  - `Enter` / `Space` to activate
  - `Escape` to close dialogs/dropdowns
  - Arrow keys for dropdown navigation

- **ARIA labels:**
  - `aria-label="Mode selector"` on trigger button
  - `aria-expanded="true|false"` on dropdown
  - `aria-checked="true"` on applied mode
  - `role="dialog"` on modals
  - `aria-describedby` for mode descriptions

- **Focus management:**
  - Return focus to trigger after closing
  - Trap focus in modals
  - Visible focus indicators

### 6. Edge Cases

- **No modes defined:** Show empty state in dropdown:
  ```
  No modes saved
  Save Current as New Mode...
  ```

- **Model unavailable:** Show warning badge in mode list:
  ```
  Work Mode ⚠️
  ```

- **Duplicate names:** Prevent saving modes with duplicate names

- **Settings changed after applying mode:** Clear applied mode indicator (mode no longer matches current state)

---

## Implementation Plan

### Files to Create
- `src/hooks/use-modes.ts` — Mode CRUD + apply logic
- `src/components/mode-selector.tsx` — Dropdown trigger + menu
- `src/components/mode-manager-modal.tsx` — Manage modes dialog
- `src/components/mode-save-dialog.tsx` — Save new mode dialog
- `src/components/mode-confirmation-dialog.tsx` — Model switch confirmation

### Files to Modify
- `src/screens/chat/components/chat-composer.tsx` — Add mode selector UI
- `src/hooks/use-settings.ts` — Track applied mode ID (state only, not persisted)

### API Dependencies
- **None** — All localStorage-based

---

## QA Requirements

### Test Plan Coverage
1. **Mode CRUD:**
   - Create mode with all fields
   - Create mode with minimal fields
   - Rename mode
   - Delete mode
   - Prevent duplicate names

2. **Mode Application:**
   - Apply mode (model available) → confirm switch
   - Apply mode (model available) → skip switch
   - Apply mode (model unavailable) → show warning
   - Apply mode (no model specified) → settings only
   - Settings change after apply → clear mode indicator

3. **UI States:**
   - No modes saved → empty state
   - Mode applied → show name
   - Mode unavailable → show warning badge
   - Dropdown navigation (keyboard + mouse)
   - Modal focus trap

4. **Persistence:**
   - Modes survive page reload
   - Mode list updates immediately after CRUD

5. **Accessibility:**
   - Keyboard navigation works
   - Screen reader announces correctly
   - Focus management correct

### Smoke Test
1. Save current settings as "Test Mode"
2. Change settings manually
3. Apply "Test Mode" → verify settings restored
4. Delete "Test Mode" → verify removed from list
5. Reload page → verify modes persist

---

## Success Criteria

- [ ] Users can save current settings as a mode
- [ ] Users can apply modes with one click
- [ ] Model switch confirmation works correctly
- [ ] Unavailable models show clear warnings
- [ ] Modes persist across sessions
- [ ] Keyboard navigation works throughout
- [ ] ARIA labels correct
- [ ] Build passes
- [ ] Security scan clean
- [ ] QA test plan passes
- [ ] Screenshots in PR

---

## Open Questions

1. **Should modes include pinned models?**
   - Leaning **no** — pinned models are UI preferences, not session config
   - Decision: **No** — modes only affect settings, not UI state

2. **Should modes be exportable/shareable?**
   - Deferred to Phase 4.4 or later
   - For now: local-only

3. **Should mode selector be in sidebar instead of composer?**
   - Leaning **no** — keep it near model switcher for discoverability
   - Decision: **Composer** — next to model switcher

---

## Notes

- **No backend routes** — all localStorage
- **No new API endpoints** — reuse existing `/api/models`, `/api/session-status`
- **Small PR** — one phase, one PR
- **Reuse patterns** from Phase 4.1 (dialogs) and 4.2 (settings hooks)
