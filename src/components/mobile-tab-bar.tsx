import { useNavigate, useRouterState } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Activity01Icon,
  Chat01Icon,
  Home01Icon,
  Settings01Icon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

/** Total height of MobileTabBar including internal padding, used by other components for bottom insets */
export const MOBILE_TAB_BAR_OFFSET = '5rem'

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
    label: 'Agents',
    icon: UserMultipleIcon,
    to: '/agents',
    match: (p) => p.startsWith('/agents'),
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: Chat01Icon,
    to: '/chat/main',
    match: (p) => p.startsWith('/chat') || p === '/new' || p === '/',
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: Activity01Icon,
    to: '/activity',
    match: (p) => p.startsWith('/activity') || p.startsWith('/logs'),
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
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[60] pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Mobile navigation"
    >
      <div className="mx-2 mb-1 grid grid-cols-5 rounded-2xl border border-white/30 bg-white/60 px-1 py-1 shadow-lg backdrop-blur-xl backdrop-saturate-150">
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
                'flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[10px] font-medium transition-transform duration-150 active:scale-90',
                isCenterChat
                  ? '-translate-y-1 text-primary-500'
                  : isActive
                    ? 'bg-white/70 text-accent-600 shadow-sm'
                    : 'text-primary-500',
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-center rounded-full transition-all duration-150',
                  isCenterChat
                    ? 'size-10 bg-accent-500 text-white'
                    : isActive
                      ? 'size-6 bg-accent-500 text-white'
                      : 'size-6 text-primary-400',
                  isCenterChat && isActive ? 'ring-2 ring-accent-300 shadow-md' : '',
                )}
              >
                <HugeiconsIcon
                  icon={tab.icon}
                  size={isCenterChat ? 22 : 18}
                  strokeWidth={isCenterChat ? 1.9 : isActive ? 2 : 1.6}
                />
              </span>
              <span
                className={cn(
                  isActive ? 'text-accent-600' : 'text-primary-400',
                  isCenterChat && !isActive ? 'text-primary-500' : '',
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
