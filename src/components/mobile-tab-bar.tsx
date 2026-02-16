import { useNavigate, useRouterState } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Chat01Icon,
  Home01Icon,
  Menu01Icon,
  PuzzleIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace-store'

type TabItem = {
  id: string
  label: string
  icon: typeof Chat01Icon
  to: string
  match: (path: string) => boolean
}

const TABS: TabItem[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: Chat01Icon,
    to: '/chat/main',
    match: (p) => p.startsWith('/chat') || p === '/new' || p === '/',
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home01Icon,
    to: '/dashboard',
    match: (p) => p.startsWith('/dashboard'),
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
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const sidebarCollapsed = useWorkspaceStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useWorkspaceStore((s) => s.setSidebarCollapsed)

  const isMoreActive = !sidebarCollapsed

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] pb-[calc(env(safe-area-inset-bottom)+0.35rem)] md:hidden">
      <div className="mx-3 mb-1.5 flex items-center gap-1 rounded-2xl border border-white/30 bg-white/60 px-2 py-1.5 shadow-lg backdrop-blur-xl backdrop-saturate-150">
        {TABS.map((tab) => {
          const isActive = tab.match(pathname)
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSidebarCollapsed(true)
                navigate({ to: tab.to })
              }}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-all duration-150 active:scale-95',
                isActive
                  ? 'bg-white/70 text-accent-600 shadow-sm'
                  : 'text-primary-500',
              )}
            >
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full transition-colors',
                  isActive
                    ? 'bg-accent-500 text-white'
                    : 'text-primary-400',
                )}
              >
                <HugeiconsIcon
                  icon={tab.icon}
                  size={18}
                  strokeWidth={isActive ? 2 : 1.6}
                />
              </span>
              <span className={cn(isActive ? 'text-accent-600' : 'text-primary-400')}>
                {tab.label}
              </span>
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-all duration-150 active:scale-95',
            isMoreActive
              ? 'bg-white/70 text-accent-600 shadow-sm'
              : 'text-primary-500',
          )}
        >
          <span
            className={cn(
              'flex size-6 items-center justify-center rounded-full transition-colors',
              isMoreActive
                ? 'bg-accent-500 text-white'
                : 'text-primary-400',
            )}
          >
            <HugeiconsIcon icon={Menu01Icon} size={18} strokeWidth={1.8} />
          </span>
          <span className={cn(isMoreActive ? 'text-accent-600' : 'text-primary-400')}>
            More
          </span>
        </button>
      </div>
    </div>
  )
}
