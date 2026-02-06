# SPEC-009: Agent Chat (Phase 2)

## Objective
Enable direct chat with sub-agents from the Studio Agent View panel.

## Scope Delivered

### 1. Agent View Enhancement
- Added a `Chat` action button to non-main agent cards in `src/components/agent-view/agent-card.tsx`.
- Wired card chat actions in `src/components/agent-view/agent-view-panel.tsx`.
- Opening `Chat` now launches an agent-scoped chat modal for the selected session.

### 2. New Components
Created `src/components/agent-chat/`:
- `AgentChatModal.tsx`
- `AgentChatMessages.tsx`
- `AgentChatInput.tsx`
- `AgentChatHeader.tsx`

Behavior implemented:
- Modal overlay with glass-style panel and darkened backdrop.
- Responsive modal layout (desktop centered, mobile bottom sheet style).
- Animated entry + message transitions using `motion/react`.
- User/agent chat bubble alignment (user right, agent left).
- Message timestamps via existing `MessageTimestamp` component.
- Typing indicator.
- Loading skeletons.
- Auto-scroll to latest message.
- Keyboard shortcuts:
  - `Enter` sends (Shift+Enter newline)
  - `Escape` closes modal

### 3. API Integration
- Added required endpoint route:
  - `src/routes/api/sessions/send.ts`
  - `POST /api/sessions/send` with `{ sessionKey, message }`
- Gateway send strategy:
  - Primary: `sessions.send`
  - Fallback: `chat.send` when method is unavailable
- Agent chat modal sends through `/api/sessions/send`.
- Message history loads from `/api/history` and updates via 2s polling while modal is open.

### 4. Demo Mode Fallback
If history/send fails:
- Modal enters Demo Mode.
- Shows visible `Demo Mode` indicator in header.
- Simulates agent response after ~2s delay.

## Files Changed
- `src/components/agent-view/agent-card.tsx`
- `src/components/agent-view/agent-view-panel.tsx`
- `src/components/agent-chat/AgentChatModal.tsx`
- `src/components/agent-chat/AgentChatMessages.tsx`
- `src/components/agent-chat/AgentChatInput.tsx`
- `src/components/agent-chat/AgentChatHeader.tsx`
- `src/routes/api/sessions/send.ts`

## Validation

### Functional Checks
- Agent cards now expose a `Chat` action.
- Selecting `Chat` opens agent-targeted modal.
- Sending messages posts to `/api/sessions/send`.
- History refreshes with polling.
- Typing/loading/auto-scroll/timestamps all render in modal.
- Demo Mode fallback activates on API failure and simulates replies.

### Commands Run
- `npm run test`
  - Result: no test files in repo (`vitest` exits with code 1)
- `npm run build`
  - Result: currently blocked by an unrelated pre-existing icon export issue in `src/components/memory-viewer/MemoryEditor.tsx` (`UnlockedIcon` export missing from `@hugeicons/core-free-icons`)

## Notes
- Agent chat currently scopes by the selected card node ID (`sessionKey` source from Agent View mapping).
- Polling is used for near-real-time updates (2s interval).
