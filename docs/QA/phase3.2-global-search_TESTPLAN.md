# Phase 3.2 — Global Search Test Plan

## Prerequisites
- App running on localhost
- Gateway connected
- At least 1 session active
- Workspace with some files

## Test Cases

### T1: Search Sessions
1. Open search (Cmd+K)
2. Type part of a session name/key
3. **Expected:** Real sessions appear in results
4. Click a session result
5. **Expected:** Navigates to `/chat/{sessionKey}`

### T2: Search Files  
1. Open search (Cmd+K)
2. Click "Files" filter pill
3. Type a file name (e.g., "chat" or "tsx")
4. **Expected:** Real files from workspace appear
5. Click a file result
6. **Expected:** Navigates to `/files?open={path}`

### T3: Search Skills
1. Open search (Cmd+K)
2. Click "Skills" filter pill
3. Type "weather" or "browser"
4. **Expected:** Static skills list filtered (Weather, Browser Use, etc.)
5. Click a skill
6. **Expected:** Navigates to `/skills`

### T4: Search Activity
1. Open search (Cmd+K)
2. Click "Activity" filter pill
3. Type an event keyword (e.g., "gateway" or "session")
4. **Expected:** Recent activity events appear
5. Click an event
6. **Expected:** Navigates to `/activity`

### T5: All Scope (Mixed Results)
1. Open search (Cmd+K)
2. Ensure "All" filter is selected
3. Type a common word (e.g., "test")
4. **Expected:** Results from all categories appear if matching

### T6: Keyboard Navigation
1. Open search
2. Type a query with multiple results
3. Press ↓ arrow
4. **Expected:** Selection moves down
5. Press ↑ arrow
6. **Expected:** Selection moves up
7. Press Enter
8. **Expected:** Selected item action fires

### T7: Empty State
1. Open search
2. Type gibberish that matches nothing
3. **Expected:** "No results found" or empty state

### T8: Close Modal
1. Open search
2. Press Escape
3. **Expected:** Modal closes
4. Click outside modal
5. **Expected:** Modal closes
