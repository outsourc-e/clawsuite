# QA Report: Chat + Mobile Frontend Review (ClawSuite)

Date: 2026-02-22
Reviewer: QA (static code review)

Scope reviewed:
- `src/screens/chat/` (chat screen, message list, message item, realtime hooks)
- `src/stores/gateway-chat-store.ts`
- Mobile responsiveness issues in shared/mobile UI used across screens (`workspace shell`, `mobile tab bar`, `toasts`, mobile sessions panel)

Severity scale:
- `P0` Critical data loss / app unusable
- `P1` Major broken behavior / high-frequency user impact
- `P2` Functional bug / reliability issue / noticeable UX break
- `P3` Minor bug / polish / low-risk mobile UX issue

## Summary

No `P0` issues found.

High-confidence problems found in chat realtime/store behavior include:
- broken Zustand reactivity due to in-place mutation of streaming state objects,
- state updates triggered during render via `mergeHistoryMessages`,
- stuck streaming UI when SSE disconnects mid-stream,
- stale polling guard causing history refetches during active streaming.

Mobile review found multiple cross-screen responsiveness issues, especially fixed-position overlays/toasts and small touch targets.

## Findings (ordered by severity)

### 1. `P1` Streaming state is mutated in place, which can prevent React/Zustand subscribers from re-rendering
- Files:
  - `src/stores/gateway-chat-store.ts:143`
  - `src/stores/gateway-chat-store.ts:162`
  - `src/stores/gateway-chat-store.ts:175`
  - `src/screens/chat/hooks/use-realtime-chat-history.ts:102`
- Problem:
  - `processEvent()` clones the `Map`, but reuses the existing `StreamingState` object (`streamingMap.get(sessionKey)`) and mutates its fields (`text`, `thinking`, `toolCalls`) in place.
  - `useRealtimeChatHistory` selects `s.streamingState.get(sessionKey) ?? null`. Zustand compares selector results by reference. If the same `StreamingState` object is mutated in place, the selector result reference may not change, so the component may not re-render for chunk/thinking/tool updates.
- User impact:
  - Streaming text/thinking/tool indicators can fail to update live or update inconsistently.
- Suggested fix:
  - Treat `StreamingState` as immutable. Clone the object and nested `toolCalls` array before changes, e.g.:
    - `const next = { ...prev, toolCalls: [...prev.toolCalls] }`
    - Then mutate `next`, set into a new `Map`, and `set()` that.

### 2. `P1` Store mutation is triggered during render (`mergeHistoryMessages` causes `set()` inside `useMemo`)
- Files:
  - `src/screens/chat/hooks/use-realtime-chat-history.ts:106`
  - `src/stores/gateway-chat-store.ts:330`
- Problem:
  - `useRealtimeChatHistory` calls `mergeHistoryMessages()` inside `useMemo` during render.
  - `mergeHistoryMessages()` has a side effect: it calls `set({ realtimeMessages: messages })` when history catches up.
  - This is a state update during render path and can cause React warnings, re-entrant renders, and nondeterministic behavior.
- User impact:
  - Intermittent render instability; hard-to-reproduce message flicker/duplicate clearing issues.
- Suggested fix:
  - Make `mergeHistoryMessages()` pure (no `set()` calls).
  - Return merged data only.
  - Move realtime-buffer cleanup into a `useEffect` in `useRealtimeChatHistory` that runs after render when history has caught up.

### 3. `P1` SSE disconnect mid-stream can leave chat stuck in streaming state indefinitely
- Files:
  - `src/hooks/use-gateway-chat-stream.ts:86`
  - `src/hooks/use-gateway-chat-stream.ts:92`
  - `src/stores/gateway-chat-store.ts:205`
  - `src/stores/gateway-chat-store.ts:276`
  - `src/screens/chat/hooks/use-realtime-chat-history.ts:117`
  - `src/screens/chat/hooks/use-realtime-chat-history.ts:142`
- Problem:
  - Streaming state is only cleared on `done` events.
  - If SSE disconnects after chunks arrive but before `done`, `streamingState` remains in store.
  - `useRealtimeChatHistory` derives `isRealtimeStreaming` from that stale state and also skips periodic polling when `streamingState !== null`.
- User impact:
  - UI can show perpetual streaming/thinking indicator.
  - Message may never finalize until manual refresh/navigation.
  - Background sync may remain suppressed.
- Suggested fix:
  - On disconnect/error, mark active session streams as interrupted or clear streaming state after a short grace timeout.
  - Alternatively, track per-stream `updatedAt` and expire stale streams (e.g. no chunk for N seconds) so polling resumes.

### 4. `P2` Periodic history sync uses stale `streamingState` in interval closure and may poll during active streaming
- File:
  - `src/screens/chat/hooks/use-realtime-chat-history.ts:115`
- Problem:
  - The interval callback checks `if (streamingState !== null) return`, but `streamingState` is not in the effect dependency array.
  - The interval captures an old value and can continue invalidating history during active streaming (or fail to resume correctly after stream ends).
- User impact:
  - Flicker, overwritten optimistic/realtime state, extra network churn during streams.
- Suggested fix:
  - Include `streamingState` in dependencies, or use a ref that is updated on each render (`streamingStateRef.current = streamingState`).

### 5. `P2` Delayed `clearSession` cleanup timer is not canceled, causing late buffer deletion after remount/session return (memory leak + race)
- File:
  - `src/screens/chat/hooks/use-realtime-chat-history.ts:129`
- Problem:
  - Cleanup schedules `setTimeout(() => clearSession(sessionKey), 5000)` and returns nothing to cancel that timeout.
  - If user switches away and back to the same session within 5s, the old timer still fires and clears realtime/streaming state for the active session.
- User impact:
  - Disappearing in-flight messages/stream state after navigating back.
  - Timer accumulation over repeated navigation.
- Suggested fix:
  - Store timeout id in a ref and cancel it in the cleanup function.
  - Also guard callback by checking current active session before clearing.

### 6. `P2` Auto-scroll does not track streaming text/tool updates, only message count changes
- File:
  - `src/screens/chat/components/chat-message-list.tsx:635`
- Problem:
  - The auto-scroll effect depends on `displayMessages.length` and `sessionKey`, but not `streamingText`, `isStreaming`, or `activeToolCalls`.
  - During SSE streaming, message count often stays constant while content height increases.
- User impact:
  - While user is at bottom, assistant output can scroll out of view during the same message stream.
  - “Stick to bottom” behavior appears broken for long streaming responses.
- Suggested fix:
  - Include streaming height drivers in dependencies (e.g. `isStreaming`, `streamingText`, `activeToolCalls.length`).
  - Or subscribe to container size changes (ResizeObserver) and auto-scroll when `stickToBottomRef.current` is true.

### 7. `P2` UI-level message dedupe hides legitimate repeated user messages sent within 5 seconds
- File:
  - `src/screens/chat/components/chat-message-list.tsx:291`
- Problem:
  - The display filter drops user messages with same text+role if timestamps are within 5 seconds.
  - This is a visual dedupe heuristic and will hide valid repeated messages (e.g. “ok”, retries, repeated commands).
- User impact:
  - Chat transcript shown to user differs from actual history/store.
  - Confusing missing-message behavior, especially on rapid retries.
- Suggested fix:
  - Remove time-window dedupe from UI layer.
  - Dedupe only by stable message IDs/client IDs from backend/store.

### 8. `P2` `mergeHistoryMessages` dedupe logic only checks `.id`, not `.messageId`, causing duplicate merge edge cases
- Files:
  - `src/stores/gateway-chat-store.ts:309`
  - `src/stores/gateway-chat-store.ts:314`
  - Reference inconsistency: `src/stores/gateway-chat-store.ts:115`, `src/stores/gateway-chat-store.ts:120`
- Problem:
  - `processEvent()` dedupe supports `id` and `messageId`, but `mergeHistoryMessages()` only checks `id`.
  - If backend history uses `messageId` while realtime buffer holds `id`less messages (or vice versa), merge can append duplicates.
- User impact:
  - Duplicate messages after history backfill / SSE + polling convergence.
- Suggested fix:
  - Normalize identifiers consistently across store methods (`id`, `messageId`, possibly `clientId`).
  - Reuse a single `getMessageId()` helper in both `processEvent` and `mergeHistoryMessages`.

### 9. `P2` Message bubbles impose internal vertical scroll (`max-h`) causing nested scroll traps and poor code-block usability
- File:
  - `src/screens/chat/components/message-item.tsx:652`
  - `src/screens/chat/components/message-item.tsx:656`
- Problem:
  - User and assistant text content are wrapped in containers with `max-h-[600px]/max-h-[800px]` and `overflow-y-auto`.
  - Long markdown/code responses create a nested scroll region inside the message bubble, separate from the chat list scroll.
- User impact:
  - Auto-scroll to latest content appears broken (outer list reaches bottom while content remains hidden inside bubble).
  - Poor mobile UX for long code blocks; touch scrolling can get trapped.
- Suggested fix:
  - Remove vertical `max-h`/`overflow-y-auto` from normal message text containers.
  - Let the chat list be the single scroll container; keep horizontal overflow handling in code blocks only.

### 10. `P2` Fixed model suggestion toast can overlap mobile composer/tab bar and overflow narrow viewports
- Files:
  - `src/components/model-suggestion-toast.tsx:36`
  - `src/components/model-suggestion-toast.tsx:37`
  - `src/screens/chat/chat-screen.tsx:1344`
- Problem:
  - Toast is always `fixed bottom-6 right-6` with `w-[380px]` and no mobile breakpoint.
  - Chat screen renders it even on mobile, where chat composer and mobile tab bar are also fixed to bottom.
- User impact:
  - Overlay collision with composer/tab bar on phones.
  - Horizontal overflow on narrow devices (< ~412px with margins).
- Suggested fix:
  - Add responsive sizing/positioning (`left/right` insets + `max-w-[calc(100vw-1rem)]`, mobile bottom offset above tab bar/composer).
  - Optionally render inline banner on mobile instead of floating toast.

### 11. `P3` Scroll-to-bottom unread badge path is dead (count is never incremented)
- Files:
  - `src/screens/chat/components/chat-message-list.tsx:171`
  - `src/screens/chat/components/chat-message-list.tsx:777`
  - `src/screens/chat/components/chat-message-list.tsx:804`
  - `src/screens/chat/components/scroll-to-bottom-button.tsx:41`
- Problem:
  - `unreadCount` state exists and badge UI is rendered, but `setUnreadCount()` is only used to reset to `0`.
- User impact:
  - Badge never appears; feature looks broken/incomplete.
- Suggested fix:
  - Increment unread count when new messages/tool activity arrive while `!isNearBottomRef.current`.
  - Reset on manual scroll-to-bottom or when user scrolls near bottom.

### 12. `P3` Mobile chat header touch targets are undersized (<44px likely)
- File:
  - `src/screens/chat/components/chat-header.tsx:160`
  - `src/screens/chat/components/chat-header.tsx:174`
- Problem:
  - Mobile session button and agent-details button have no explicit minimum hit area; visual icons are `28px` / `size-8` and rely on minimal surrounding padding.
- User impact:
  - Harder tapping on small screens / accessibility issues.
- Suggested fix:
  - Enforce touch target size (`min-h-11 min-w-11` / `size-11`) and center icons within it.

### 13. `P3` Mobile tab bar buttons appear smaller than recommended touch target size
- File:
  - `src/components/mobile-tab-bar.tsx:162`
- Problem:
  - Tab buttons use small vertical padding (`py-1`) and compact icon+label layout; likely below 44px height on some devices/font settings.
- User impact:
  - Missed taps, poor one-handed navigation ergonomics.
- Suggested fix:
  - Increase tab button min height (`min-h-11`) and spacing while preserving layout.

### 14. `P3` Global toaster lacks mobile width constraints and can overflow with long messages
- File:
  - `src/components/ui/toast.tsx:77`
  - `src/components/ui/toast.tsx:82`
- Problem:
  - Toast stack is fixed top-right with no viewport width cap; toast rows have no explicit wrapping constraints.
  - Long messages can force horizontal overflow / off-screen clipping on narrow devices.
- User impact:
  - Toast content partially hidden on mobile across all screens.
- Suggested fix:
  - Use responsive container (`left-2 right-2 sm:left-auto sm:right-4`) and `max-w-[calc(100vw-1rem)]`.
  - Allow message text wrapping (`min-w-0`, `break-words`).

### 15. `P3` Mobile sessions panel does not lock background scrolling while open (sidebar/drawer behavior)
- File:
  - `src/components/mobile-sessions-panel.tsx:60`
  - `src/components/mobile-sessions-panel.tsx:74`
- Problem:
  - Panel adds an overlay and Escape handler, but does not apply body scroll lock / inerting to background content.
  - Background page can still scroll (especially on iOS overscroll / swipe gesture paths).
- User impact:
  - Drawer feels unstable; background content moves behind modal panel.
- Suggested fix:
  - Apply `document.body.style.overflow = 'hidden'` (with restore on cleanup) or use shared dialog/sheet primitive that handles scroll locking/focus management.

## Notes / Areas Checked

- `clearSession()` in `src/stores/gateway-chat-store.ts` correctly removes session entries from both maps, but the more severe cleanup issue is in the caller (`useRealtimeChatHistory`) where delayed cleanup timers are not canceled.
- Chat event listener cleanup in `useGatewayChatStream` relies on closing the `EventSource` object, which is generally acceptable; the larger reliability issue is missing stream interruption handling when `done` never arrives.

## Recommended Fix Order

1. Fix store immutability (`StreamingState` updates) and render-time store writes (`mergeHistoryMessages`).
2. Add robust mid-stream disconnect handling + stream expiry.
3. Fix stale polling closure + delayed `clearSession` timeout cancellation.
4. Fix auto-scroll dependency gap and remove UI time-window dedupe.
5. Address mobile fixed overlays/toasts and touch target sizing.
