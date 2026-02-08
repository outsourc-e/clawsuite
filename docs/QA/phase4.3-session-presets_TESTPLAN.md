# QA Test Plan — Phase 4.3: Session Presets (Modes)

**Phase:** 4.3 — Session Presets (Modes)  
**Spec:** [PHASE_4.3_SESSION_PRESETS.md](../PHASE_4.3_SESSION_PRESETS.md)  
**Branch:** `phase4.3-session-presets`

---

## Pre-Test Checklist

- [ ] Build passes (`npm run build`)
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] No lint errors (`npm run lint`)
- [ ] Security scan clean (`npm run security:check`)
- [ ] Dev server running (`npm run dev`)

---

## Test Cases

### T1: Save New Mode (Full Config)
**Goal:** Save current settings as a new mode with all fields populated.

**Setup:**
1. Open chat screen
2. Set model to `claude-sonnet-4-5`
3. Enable Smart Suggestions (Settings)
4. Disable "Only Suggest Cheaper" (Settings)
5. Set Preferred Budget to `claude-haiku-4-5`
6. Set Preferred Premium to `claude-opus-4-5`

**Steps:**
1. Click mode selector → "Save Current as New Mode..."
2. Enter name: "Work Mode"
3. Check "Include current model"
4. Click "Save"

**Expected:**
- Toast: "Mode saved: Work Mode"
- Mode appears in mode selector dropdown
- Mode selector shows "Work Mode" as applied

**Pass/Fail:**

---

### T2: Save New Mode (Minimal Config)
**Goal:** Save a mode without specifying a model.

**Setup:**
1. Change any setting (e.g., toggle Smart Suggestions)

**Steps:**
1. Click mode selector → "Save Current as New Mode..."
2. Enter name: "No Model Mode"
3. Uncheck "Include current model"
4. Click "Save"

**Expected:**
- Mode saved without `preferredModel`
- Mode appears in dropdown
- Applying it later will not prompt for model switch

**Pass/Fail:**

---

### T3: Prevent Duplicate Names
**Goal:** Cannot save two modes with the same name.

**Setup:**
1. Existing mode "Work Mode" saved

**Steps:**
1. Click mode selector → "Save Current as New Mode..."
2. Enter name: "Work Mode"
3. Click "Save"

**Expected:**
- Error message: "A mode with this name already exists"
- Mode not saved

**Pass/Fail:**

---

### T4: Rename Mode
**Goal:** Rename an existing mode.

**Setup:**
1. Mode "Work Mode" exists

**Steps:**
1. Click mode selector → "Manage Modes..."
2. Find "Work Mode" → click "Rename"
3. Enter new name: "Focus Mode"
4. Click "Save"

**Expected:**
- Toast: "Mode renamed to Focus Mode"
- Mode list updated
- If applied, mode selector shows new name

**Pass/Fail:**

---

### T5: Delete Mode
**Goal:** Delete an existing mode.

**Setup:**
1. Mode "Test Mode" exists (not applied)

**Steps:**
1. Click mode selector → "Manage Modes..."
2. Find "Test Mode" → click "Delete"
3. Confirm deletion

**Expected:**
- Toast: "Mode deleted: Test Mode"
- Mode removed from list

**Pass/Fail:**

---

### T6: Delete Applied Mode
**Goal:** Delete the currently applied mode.

**Setup:**
1. Mode "Active Mode" applied

**Steps:**
1. Click mode selector → "Manage Modes..."
2. Find "Active Mode" → click "Delete"
3. Confirm deletion

**Expected:**
- Mode deleted
- Mode selector shows "No mode" (default state)
- Settings unchanged (only indicator cleared)

**Pass/Fail:**

---

### T7: Apply Mode (Model Available, Confirm Switch)
**Goal:** Apply a mode that specifies a model, and confirm the model switch.

**Setup:**
1. Current model: `claude-haiku-4-5`
2. Mode "Opus Mode" exists with `preferredModel: claude-opus-4-5`

**Steps:**
1. Click mode selector → select "Opus Mode"
2. Confirm model switch dialog: "Switch to claude-opus-4-5?" → click "Switch Now"

**Expected:**
- Settings updated (Smart Suggestions, etc.)
- Model switched to `claude-opus-4-5`
- Mode selector shows "Opus Mode"
- Toast: "Mode applied: Opus Mode"

**Pass/Fail:**

---

### T8: Apply Mode (Model Available, Skip Switch)
**Goal:** Apply a mode but skip the model switch.

**Setup:**
1. Current model: `claude-haiku-4-5`
2. Mode "Sonnet Mode" exists with `preferredModel: claude-sonnet-4-5`

**Steps:**
1. Click mode selector → select "Sonnet Mode"
2. Model switch dialog → click "Skip"

**Expected:**
- Settings updated
- Model **unchanged** (still `claude-haiku-4-5`)
- Mode selector shows "Sonnet Mode ⚠️" (mismatch warning)

**Pass/Fail:**

---

### T9: Apply Mode (Model Unavailable)
**Goal:** Apply a mode with a model that's not in the catalog.

**Setup:**
1. Mode "Fake Mode" exists with `preferredModel: nonexistent-model-123`

**Steps:**
1. Click mode selector → select "Fake Mode"

**Expected:**
- Warning toast: "Mode 'Fake Mode' requires nonexistent-model-123 which is not available. You can edit this mode or choose a different one."
- Settings updated
- Model unchanged
- Mode selector shows "Fake Mode ⚠️"

**Pass/Fail:**

---

### T10: Apply Mode (No Model Specified)
**Goal:** Apply a mode that only updates settings, no model change.

**Setup:**
1. Mode "Settings Only" exists with no `preferredModel`

**Steps:**
1. Click mode selector → select "Settings Only"

**Expected:**
- Settings updated immediately
- No model switch prompt
- Mode selector shows "Settings Only"
- Toast: "Mode applied: Settings Only"

**Pass/Fail:**

---

### T11: Settings Changed After Apply
**Goal:** Mode indicator clears when user manually changes settings.

**Setup:**
1. Mode "Work Mode" applied

**Steps:**
1. Manually toggle Smart Suggestions (Settings)

**Expected:**
- Mode selector clears applied state (shows "No mode" or default)
- Settings remain as user changed them

**Pass/Fail:**

---

### T12: Mode List Empty State
**Goal:** Show empty state when no modes saved.

**Setup:**
1. Delete all modes (localStorage clear)

**Steps:**
1. Click mode selector

**Expected:**
- Dropdown shows:
  ```
  No modes saved
  ────────────────
  Save Current as New Mode...
  ```

**Pass/Fail:**

---

### T13: Mode Persistence Across Reload
**Goal:** Modes survive page reload.

**Setup:**
1. Save 2 modes: "Mode A", "Mode B"
2. Apply "Mode A"

**Steps:**
1. Reload page (`Cmd+R`)
2. Open mode selector

**Expected:**
- Both modes still in list
- "Mode A" still shown as applied

**Pass/Fail:**

---

### T14: Keyboard Navigation (Dropdown)
**Goal:** Navigate mode selector with keyboard.

**Steps:**
1. Focus mode selector (Tab to it)
2. Press `Enter` or `Space` → dropdown opens
3. Press `ArrowDown` → highlights next mode
4. Press `ArrowUp` → highlights previous mode
5. Press `Enter` → applies highlighted mode
6. Press `Escape` → closes dropdown

**Expected:**
- All keyboard interactions work
- Focus visible at all times
- ARIA labels correct (check with screen reader or inspector)

**Pass/Fail:**

---

### T15: Manage Modes Modal Focus Trap
**Goal:** Focus trapped in modal, Escape closes it.

**Steps:**
1. Open mode selector → "Manage Modes..."
2. Press `Tab` repeatedly → focus cycles within modal
3. Press `Escape` → modal closes, focus returns to trigger

**Expected:**
- Focus never leaves modal while open
- Escape closes modal
- Focus returns to mode selector button

**Pass/Fail:**

---

### T16: Mode Badge (Unavailable Model)
**Goal:** Show warning badge for modes with unavailable models.

**Setup:**
1. Create mode "Bad Mode" with `preferredModel: fake-model`
2. Remove `fake-model` from catalog (or just use a nonsense ID)

**Steps:**
1. Open mode selector

**Expected:**
- "Bad Mode ⚠️" shown in list
- Tooltip/label: "Model unavailable"

**Pass/Fail:**

---

### T17: ARIA Labels
**Goal:** Screen reader accessibility.

**Steps:**
1. Inspect mode selector with browser dev tools
2. Check ARIA attributes:
   - `aria-label="Mode selector"` on button
   - `aria-expanded="true|false"` on dropdown
   - `aria-checked="true"` on applied mode
   - `role="dialog"` on modals
   - `aria-describedby` for descriptions

**Expected:**
- All ARIA labels present and correct

**Pass/Fail:**

---

## Smoke Test Sequence

Run this end-to-end flow to verify core functionality:

1. **Save mode:**
   - Set model to `claude-sonnet-4-5`, enable Smart Suggestions
   - Save as "Test Mode" (include model)
   - ✅ Mode appears in list

2. **Change settings:**
   - Disable Smart Suggestions
   - ✅ Mode indicator clears

3. **Apply mode:**
   - Select "Test Mode" from dropdown
   - Confirm model switch
   - ✅ Settings restored, model switched

4. **Rename mode:**
   - Open "Manage Modes", rename "Test Mode" → "Renamed Mode"
   - ✅ Name updated in list

5. **Delete mode:**
   - Delete "Renamed Mode"
   - ✅ Mode removed

6. **Reload:**
   - Reload page
   - ✅ (No modes should remain)

---

## Acceptance Criteria

- [ ] All test cases pass
- [ ] Smoke test passes
- [ ] Build passes
- [ ] Security scan clean
- [ ] No console errors/warnings
- [ ] Keyboard navigation works
- [ ] ARIA labels correct
- [ ] Screenshots provided in PR

---

## Notes

- Test with multiple modes saved (5+) to verify dropdown scrolling
- Test long mode names (50+ chars) to verify truncation/wrapping
- Test rapid mode switching (no race conditions)
- Verify localStorage size limits (though unlikely to hit with typical usage)
