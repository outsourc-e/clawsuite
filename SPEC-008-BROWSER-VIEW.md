# SPEC-008 Browser View

## Summary

Phase 2 adds a live browser monitoring workspace at `/browser` so operators can see what agents are browsing in near real-time.

## Scope Delivered

1. New route: `/browser`
2. Sidebar navigation link with globe icon
3. New browser view components in `src/components/browser-view/`
4. API integration with polling every 2 seconds
5. Demo fallback mode when browser APIs are unavailable
6. Responsive dark-theme UI with glass card treatment and motion transitions

## Files Added

- `src/routes/browser.tsx`
- `src/components/browser-view/BrowserPanel.tsx`
- `src/components/browser-view/BrowserScreenshot.tsx`
- `src/components/browser-view/BrowserTabs.tsx`
- `src/components/browser-view/BrowserControls.tsx`
- `src/routes/api/browser/tabs.ts`
- `src/routes/api/browser/screenshot.ts`
- `src/server/browser-monitor.ts`

## Files Updated

- `src/screens/chat/components/chat-sidebar.tsx`

## API Contract

### `GET /api/browser/tabs`

Returns:

- `tabs`: normalized tab list
- `activeTabId`: current active tab id
- `updatedAt`: server timestamp
- `demoMode`: `true` when fallback data is used
- `error` (optional): fallback reason

### `GET /api/browser/screenshot?tabId=<id>`

Returns:

- `imageDataUrl`: screenshot as data URL (or URL if provided by gateway)
- `currentUrl`: active URL in view
- `activeTabId`: selected/active tab id
- `capturedAt`: server timestamp
- `demoMode`: `true` when fallback data is used
- `error` (optional): fallback reason

## Gateway Integration

Browser endpoints call gateway RPC with fallback method probing:

- Tabs: `browser.tabs`, `browser.list_tabs`, `browser.get_tabs`
- Screenshot: `browser.screenshot`, `browser.capture`, `browser.take_screenshot`

If calls fail or payloads are missing required fields, APIs return demo-safe payloads instead of hard failures.

## UI Behavior

- Polls tabs and screenshots every 2 seconds using React Query.
- Supports tab selection; screenshot requests include `tabId`.
- URL bar is read-only and reflects current tab/screenshot URL.
- Manual refresh triggers both tabs and screenshot refetch.
- Loading states for tabs and screenshot.
- `Demo Mode` badge when either tabs or screenshot is fallback data.

## Responsive Layout

- Mobile: stacked controls, tabs, and screenshot.
- Desktop: two-column layout with tabs sidebar and large screenshot panel.

## Validation

- Build compiles with new route and API handlers.
- Tests run successfully.
- Navigation path validated by sidebar link -> `/browser`.
