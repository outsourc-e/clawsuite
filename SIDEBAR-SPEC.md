# Sidebar Optimization Spec

## 3 Features to Implement

### 1. Pinned/Starred Sessions (⭐ "Quick Use" section)

Add a "Quick Use" section ABOVE the Studio section in the sidebar. Sessions can be starred/pinned via the context menu (⋯ button) on each session item.

**Files to create:**
- `src/hooks/use-pinned-sessions.ts` — Zustand store with persist (key: `pinned-sessions`)

**Reference implementation** (copy this exactly):
```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type PinnedSessionsState = {
  pinnedSessionKeys: Array<string>
  pinSession: (key: string) => void
  unpinSession: (key: string) => void
  togglePinnedSession: (key: string) => void
  isSessionPinned: (key: string) => boolean
}

export const usePinnedSessionsStore = create<PinnedSessionsState>()(
  persist(
    (set, get) => ({
      pinnedSessionKeys: [],
      pinSession: (key) =>
        set((state) => {
          if (state.pinnedSessionKeys.includes(key)) return state
          return { pinnedSessionKeys: [...state.pinnedSessionKeys, key] }
        }),
      unpinSession: (key) =>
        set((state) => ({
          pinnedSessionKeys: state.pinnedSessionKeys.filter(
            (pinnedKey) => pinnedKey !== key,
          ),
        })),
      togglePinnedSession: (key) => {
        if (get().isSessionPinned(key)) {
          get().unpinSession(key)
          return
        }
        get().pinSession(key)
      },
      isSessionPinned: (key) => get().pinnedSessionKeys.includes(key),
    }),
    { name: 'pinned-sessions' },
  ),
)

export function usePinnedSessions() {
  const pinnedSessionKeys = usePinnedSessionsStore((s) => s.pinnedSessionKeys)
  const togglePinnedSession = usePinnedSessionsStore((s) => s.togglePinnedSession)
  return { pinnedSessionKeys, togglePinnedSession }
}
```

**Files to modify:**

A) `src/screens/chat/components/sidebar/session-item.tsx`:
- Add `isPinned: boolean` and `onTogglePin: (session: SessionMeta) => void` to props
- Add `PinIcon` import from `@hugeicons/core-free-icons`
- Add "Pin session" / "Unpin session" menu item BEFORE Rename in the context menu
- Update the memo equality check to include `isPinned`

B) `src/screens/chat/components/sidebar/sidebar-sessions.tsx`:
- Import `usePinnedSessions` from `@/hooks/use-pinned-sessions`
- Split sessions into `pinnedSessions` and `unpinnedSessions` using useMemo
- Render pinned sessions first, then a thin divider `<div className="my-1 border-t border-primary-200/80" />`, then unpinned
- Pass `isPinned` and `onTogglePin` to each SessionItem
- Show pinned sessions even when the Sessions collapsible is collapsed (they're always visible as "Quick Use")

C) `src/screens/chat/components/chat-sidebar.tsx`:
- Add a "Quick Use" SectionLabel ABOVE the Studio section (only shows when there are pinned sessions)
- The Quick Use section shows pinned session items as compact links (just title, no subtitle)
- Use star icon (`FavouriteIcon` or `StarIcon` from hugeicons) for the section icon

### 2. Sessions Section — Collapsible Show/Hide

The Sessions list at the bottom of the sidebar should be collapsible (it already IS via the Collapsible component). No changes needed here — it already works. Just confirm it toggles properly.

### 3. Settings → Config Dropdown Styling

Currently Settings section has "Config" and a sub-item "Providers". Add dropdown sub-items under Studio section too:

In `chat-sidebar.tsx`, split Studio items into two groups:
- **Primary** (always visible): Dashboard, New Session, Search, Browser, Terminal, Tasks
- **Secondary** (in a "More" collapsible): Skills+, Cron+, Logs+, Debug+, Files+, Memory+

Use same collapsible pattern as Gateway/Settings sections. Use `usePersistedBool('openclaw-sidebar-studio-more-expanded', false)`.

## Style Rules
- Orange = brand only (active states use `bg-orange-500/10 text-orange-500`)
- 10px uppercase section labels
- Animations: 0.15s duration via motion/react
- Keep existing memo patterns for performance

## DO NOT
- Change any backend/API code
- Add new routes
- Modify any non-sidebar files beyond what's listed above
- Change the workspace-shell.tsx grid layout
