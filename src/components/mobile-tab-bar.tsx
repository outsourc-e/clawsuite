import { useNavigate, useRouterState } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Chat01Icon,
  Home01Icon,
  PuzzleIcon,
  Settings01Icon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace-store'

/** Height constant for consistent bottom insets on mobile routes with tab bar */
export const MOBILE_TAB_BAR_OFFSET = '3.75rem'

/**
 * Z-index layer map (documented for maintainability):
 *   z-40  — tab bar (below everything interactive)
 *   z-50  — chat composer input area
 *   z-60  — quick menus, modal sheets, overlays
 *   z-70  — composer wrapper (fixed on mobile)
 */

type TabItem = {
  id: string
  label: string
  icon: typeof Chat01Icon
  to: string
  match: (path: string) => boolean
}

const TABS: TabItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home01Icon,
    to: '/dashboard',
    match: (p) => p.startsWith('/dashboard'),
  },
  {
    id: 'agents',
    label: 'Agent Hub',
    icon: UserMultipleIcon,
    to: '/agent-swarm',
    match: (p) => p.startsWith('/agent-swarm') || p.startsWith('/agents'),
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: Chat01Icon,
    to: '/chat/main',
    match: (p) => p.startsWith('/chat') || p === '/new' || p === '/',
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: PuzzleIcon,
    to: '/skills',
    match: (p) => p.startsWith('/skills'),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings01Icon,
    to: '/settings',
    match: (p) => p.startsWith('/settings'),
  },
]

export function MobileTabBar() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const mobileKeyboardInset = useWorkspaceStore((s) => s.mobileKeyboardInset)
  const mobileComposerFocused = useWorkspaceStore((s) => s.mobileComposerFocused)
  const isChatRoute =
    pathname.startsWith('/chat') || pathname === '/new' || pathname === '/'

  // Hide tab bar when keyboard is open OR composer is focused (iOS reports focus before viewport resize)
  const keyboardActive = mobileKeyboardInset > 0 || mobileComposerFocused
  const hideTabBar = isChatRoute && keyboardActive

  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 isolate bg-primary-50/95 pb-[var(--safe-b)] md:hidden transition-all duration-200',
        hideTabBar
          ? 'translate-y-[110%] opacity-0 pointer-events-none'
          : 'translate-y-0 opacity-100',
      )}
      aria-label="Mobile navigation"
    >
      <div className="mx-2 mb-0 grid grid-cols-5 gap-1 rounded-2xl border border-primary-200/60 px-1 py-1.5 shadow-[0_2px_20px_rgba(0,0,0,0.08)]">
        {TABS.map((tab) => {
          const isActive = tab.match(pathname)
          const isCenterChat = tab.id === 'chat'
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate({ to: tab.to })}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-medium transition-transform duration-150 active:scale-90',
                isCenterChat ? '-translate-y-1.5' : '',
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-center rounded-full transition-all duration-150',
                  isCenterChat
                    ? cn(
                        'size-10 bg-accent-500 text-white shadow-sm',
                        isActive && 'ring-1 ring-accent-300/30 shadow-sm',
                      )
                    : isActive
                      ? 'size-7 bg-accent-500/15 text-accent-600'
                      : 'size-7 text-primary-400',
                )}
              >
                <HugeiconsIcon
                  icon={tab.icon}
                  size={isCenterChat ? 20 : 17}
                  strokeWidth={isCenterChat ? 1.8 : isActive ? 2 : 1.6}
                />
              </span>
              <span
                className={cn(
                  'leading-tight',
                  isActive ? 'text-accent-600' : 'text-primary-400',
                )}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
