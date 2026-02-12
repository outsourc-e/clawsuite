import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  BotIcon,
  BrainIcon,
  ChartLineData01Icon,
  Chat01Icon,
  Clock01Icon,
  ComputerTerminal01Icon,
  File01Icon,
  GlobeIcon,
  Home01Icon,
  ListViewIcon,
  Notification03Icon,
  PencilEdit02Icon,
  PuzzleIcon,
  Search01Icon,
  ApiIcon,
  Settings01Icon,
  SidebarLeft01Icon,
  ServerStack01Icon,
  SmartPhone01Icon,
  Task01Icon,
  UserGroupIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useChatSettings as useSidebarSettings } from '../hooks/use-chat-settings'
import { useDeleteSession } from '../hooks/use-delete-session'
import { useRenameSession } from '../hooks/use-rename-session'
import { SettingsDialog } from './settings-dialog'
import { SessionRenameDialog } from './sidebar/session-rename-dialog'
import { SessionDeleteDialog } from './sidebar/session-delete-dialog'
import { SidebarSessions } from './sidebar/sidebar-sessions'
import type { SessionMeta } from '../types'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { OpenClawStudioIcon } from '@/components/icons/clawsuite'
import { UserAvatar } from '@/components/avatars'
import {
  SEARCH_MODAL_EVENTS,
  useSearchModal,
} from '@/hooks/use-search-modal'
import {
  selectChatProfileAvatarDataUrl,
  selectChatProfileDisplayName,
  useChatSettingsStore,
} from '@/hooks/use-chat-settings'
import { GatewayStatusIndicator } from '@/components/gateway-status-indicator'
import {
  MenuRoot,
  MenuTrigger,
  MenuContent,
  MenuItem,
} from '@/components/ui/menu'

type ChatSidebarProps = {
  sessions: Array<SessionMeta>
  activeFriendlyId: string
  creatingSession: boolean
  onCreateSession: () => void
  isCollapsed: boolean
  onToggleCollapse: () => void
  onSelectSession?: () => void
  onActiveSessionDelete?: () => void
  sessionsLoading: boolean
  sessionsFetching: boolean
  sessionsError: string | null
  onRetrySessions: () => void
}

type RecentEventsResponse = {
  events?: Array<unknown>
}

const DEBUG_ERROR_WINDOW_MS = 5 * 60 * 1000

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function hasRecentIssueEvent(item: unknown, cutoffMs: number): boolean {
  const record = toRecord(item)
  if (!record) return false

  const level = record.level
  const timestamp = record.timestamp
  if (level !== 'warn' && level !== 'error') return false
  if (typeof timestamp !== 'number') return false
  if (!Number.isFinite(timestamp)) return false
  return timestamp >= cutoffMs
}

async function fetchHasRecentIssues(): Promise<boolean> {
  try {
    const response = await fetch('/api/events/recent?count=40')
    if (!response.ok) return false

    const payload = (await response.json()) as RecentEventsResponse
    const events = Array.isArray(payload.events) ? payload.events : []
    const cutoffMs = Date.now() - DEBUG_ERROR_WINDOW_MS

    for (const item of events) {
      if (hasRecentIssueEvent(item, cutoffMs)) return true
    }

    return false
  } catch {
    return false
  }
}

// ── Reusable nav item ───────────────────────────────────────────────────

type NavItemDef = {
  kind: 'link' | 'button'
  to?: string
  icon: unknown
  label: string
  active: boolean
  onClick?: () => void
  disabled?: boolean
  badge?: 'error-dot'
}

function NavItem({
  item,
  isCollapsed,
  transition,
  onSelectSession,
}: {
  item: NavItemDef
  isCollapsed: boolean
  transition: Record<string, unknown>
  onSelectSession?: () => void
}) {
  const cls = cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    'w-full h-auto gap-2.5 py-2',
    isCollapsed ? 'justify-center px-0' : 'justify-start px-3',
    item.active
      ? 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/15'
      : 'text-primary-900 hover:bg-primary-200',
  )

  const iconEl =
    item.badge === 'error-dot' ? (
      <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
        <HugeiconsIcon
          icon={item.icon as any}
          size={20}
          strokeWidth={1.5}
          className="size-5 shrink-0"
        />
        <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-red-500" />
      </span>
    ) : (
      <HugeiconsIcon
        icon={item.icon as any}
        size={20}
        strokeWidth={1.5}
        className="size-5 shrink-0"
      />
    )

  const labelEl = (
    <AnimatePresence initial={false} mode="wait">
      {!isCollapsed ? (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
          className="overflow-hidden whitespace-nowrap"
        >
          {item.label}
        </motion.span>
      ) : null}
    </AnimatePresence>
  )

  if (item.kind === 'link') {
    if (isCollapsed) {
      return (
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger
              render={
                <Link to={item.to!} onMouseUp={onSelectSession} className={cls}>
                  {iconEl}
                </Link>
              }
            />
            <TooltipContent side="right">{item.label}</TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      )
    }
    return (
      <Link to={item.to!} onMouseUp={onSelectSession} className={cls}>
        {iconEl}
        {labelEl}
      </Link>
    )
  }

  if (isCollapsed) {
    return (
      <TooltipProvider>
        <TooltipRoot>
          <TooltipTrigger
            render={
              <Button
                disabled={item.disabled}
                variant="ghost"
                size="sm"
                onClick={item.onClick}
                onMouseUp={onSelectSession}
                className={cls}
              >
                {iconEl}
              </Button>
            }
          />
          <TooltipContent side="right">{item.label}</TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
    )
  }

  return (
    <Button
      disabled={item.disabled}
      variant="ghost"
      size="sm"
      onClick={item.onClick}
      onMouseUp={onSelectSession}
      className={cls}
    >
      {iconEl}
      {labelEl}
    </Button>
  )
}

// ── Last-visited route tracking ─────────────────────────────────────────

const LAST_ROUTE_KEY = 'openclaw-sidebar-last-route'

function getLastRoute(section: string): string | null {
  try {
    const stored = localStorage.getItem(LAST_ROUTE_KEY)
    if (!stored) return null
    const map = JSON.parse(stored) as Record<string, string>
    return map[section] || null
  } catch {
    return null
  }
}

function setLastRoute(section: string, route: string) {
  try {
    const stored = localStorage.getItem(LAST_ROUTE_KEY)
    const map = stored ? (JSON.parse(stored) as Record<string, string>) : {}
    map[section] = route
    localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

// ── Section header ──────────────────────────────────────────────────────

function SectionLabel({
  label,
  isCollapsed,
  transition,
  collapsible,
  expanded,
  onToggle,
  navigateTo,
}: {
  label: string
  isCollapsed: boolean
  transition: Record<string, unknown>
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
  navigateTo?: string
}) {
  if (isCollapsed) return null

  const labelContent = (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary-500 select-none">
      {label}
    </span>
  )

  if (collapsible) {
    return (
      <motion.div
        layout
        transition={{ layout: transition }}
        className="flex items-center gap-1.5 px-3 pt-3 pb-1 w-full"
      >
        {navigateTo ? (
          <Link
            to={navigateTo}
            className="text-[10px] font-semibold uppercase tracking-wider text-primary-500 hover:text-primary-700 select-none transition-colors"
          >
            {label}
          </Link>
        ) : (
          labelContent
        )}
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto p-0.5 rounded hover:bg-primary-200 transition-colors"
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={12}
            strokeWidth={2}
            className={cn(
              'text-primary-500 transition-transform duration-150',
              expanded ? 'rotate-0' : '-rotate-90',
            )}
          />
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div
      layout
      transition={{ layout: transition }}
      className="px-3 pt-3 pb-1"
    >
      {navigateTo ? (
        <Link
          to={navigateTo}
          className="text-[10px] font-semibold uppercase tracking-wider text-primary-500 hover:text-primary-700 select-none transition-colors"
        >
          {label}
        </Link>
      ) : (
        labelContent
      )}
    </motion.div>
  )
}

// ── Collapsible section wrapper ─────────────────────────────────────────

function CollapsibleSection({
  expanded,
  items,
  isCollapsed,
  transition,
  onSelectSession,
}: {
  expanded: boolean
  items: NavItemDef[]
  isCollapsed: boolean
  transition: Record<string, unknown>
  onSelectSession?: () => void
}) {
  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="overflow-hidden space-y-0.5"
        >
          {items.map((item) => (
            <motion.div
              key={item.label}
              layout
              transition={{ layout: transition }}
              className="w-full"
            >
              <NavItem
                item={item}
                isCollapsed={isCollapsed}
                transition={transition}
                onSelectSession={onSelectSession}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Persist helper ──────────────────────────────────────────────────────

function usePersistedBool(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored === 'true') return true
      if (stored === 'false') return false
      return defaultValue
    } catch {
      return defaultValue
    }
  })

  function toggle() {
    setValue((prev) => {
      const next = !prev
      try {
        localStorage.setItem(key, String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  return [value, toggle] as const
}

// ── Main component ──────────────────────────────────────────────────────

function ChatSidebarComponent({
  sessions,
  activeFriendlyId,
  creatingSession,
  onCreateSession,
  isCollapsed,
  onToggleCollapse,
  onSelectSession,
  onActiveSessionDelete,
  sessionsLoading,
  sessionsFetching,
  sessionsError,
  onRetrySessions,
}: ChatSidebarProps) {
  const navigate = useNavigate()
  const {
    settingsOpen,
    setSettingsOpen,
    pathsLoading,
    pathsError,
    paths,
    handleOpenSettings,
    closeSettings,
    copySessionsDir,
    copyStorePath,
  } = useSidebarSettings()
  const profileDisplayName = useChatSettingsStore(selectChatProfileDisplayName)
  const profileAvatarDataUrl = useChatSettingsStore(
    selectChatProfileAvatarDataUrl,
  )
  const { deleteSession } = useDeleteSession()
  const { renameSession } = useRenameSession()
  const openSearchModal = useSearchModal((state) => state.openModal)
  const isSearchModalOpen = useSearchModal((state) => state.isOpen)
  const pathname = useRouterState({
    select: function selectPathname(state) {
      return state.location.pathname
    },
  })

  // Route active states
  const isDashboardActive = pathname === '/dashboard'
  const isAgentSwarmActive = pathname === '/agent-swarm'
  const isNewSessionActive = pathname === '/new'
  const isBrowserActive = pathname === '/browser'
  const isTerminalActive = pathname === '/terminal'
  const isTasksActive = pathname === '/tasks'
  // Gateway
  const isCronActive = pathname === '/cron'
  const isChannelsActive = pathname === '/channels'
  const isSessionsActive = pathname === '/sessions'
  const isUsageActive = pathname === '/usage'
  const isInstancesActive = pathname === '/instances'
  // Agent
  const isAgentsActive = pathname === '/agents'
  const isNodesActive = pathname === '/nodes'
  const isSkillsActive = pathname === '/skills'
  const isFilesActive = pathname === '/files'
  const isMemoryActive = pathname === '/memory'
  const isDebugActive = pathname === '/debug'
  const isLogsActive = pathname === '/activity' || pathname === '/logs'

  // Track last-visited route per section
  const studioRoutes = ['/dashboard', '/agent-swarm', '/new', '/browser', '/terminal', '/tasks', '/skills', '/cron', '/activity', '/logs', '/debug', '/files', '/memory']
  const gatewayRoutes = ['/channels', '/instances', '/sessions', '/usage', '/agents', '/nodes']

  useEffect(() => {
    if (studioRoutes.includes(pathname)) setLastRoute('studio', pathname)
    else if (gatewayRoutes.includes(pathname)) setLastRoute('gateway', pathname)
  }, [pathname])

  // Resolve navigation targets (last visited or default)
  const studioNav = getLastRoute('studio') || '/dashboard'
  const gatewayNav = getLastRoute('gateway') || '/channels'

  const transition = {
    duration: 0.15,
    ease: isCollapsed ? 'easeIn' : 'easeOut',
  } as const

  const recentIssuesQuery = useQuery({
    queryKey: ['activity', 'recent-issues-indicator'],
    queryFn: fetchHasRecentIssues,
    refetchInterval: 20_000,
    retry: false,
  })
  const showDebugErrorDot = Boolean(recentIssuesQuery.data)

  // Collapsible section states
  const [gatewayExpanded, toggleGateway] = usePersistedBool(
    'openclaw-sidebar-gateway-expanded',
    false,
  )

  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameSessionKey, setRenameSessionKey] = useState<string | null>(null)
  const [renameFriendlyId, setRenameFriendlyId] = useState<string | null>(
    null,
  )
  const [renameSessionTitle, setRenameSessionTitle] = useState('')

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteSessionKey, setDeleteSessionKey] = useState<string | null>(null)
  const [deleteFriendlyId, setDeleteFriendlyId] = useState<string | null>(null)
  const [deleteSessionTitle, setDeleteSessionTitle] = useState('')

  function handleOpenRename(session: SessionMeta) {
    setRenameSessionKey(session.key)
    setRenameFriendlyId(session.friendlyId)
    setRenameSessionTitle(
      session.label || session.title || session.derivedTitle || '',
    )
    setRenameDialogOpen(true)
  }

  function handleSaveRename(newTitle: string) {
    if (renameSessionKey) {
      void renameSession(renameSessionKey, renameFriendlyId, newTitle)
    }
    setRenameDialogOpen(false)
    setRenameSessionKey(null)
    setRenameFriendlyId(null)
  }

  function handleOpenDelete(session: SessionMeta) {
    setDeleteSessionKey(session.key)
    setDeleteFriendlyId(session.friendlyId)
    setDeleteSessionTitle(
      session.label ||
        session.title ||
        session.derivedTitle ||
        session.friendlyId,
    )
    setDeleteDialogOpen(true)
  }

  function handleConfirmDelete() {
    if (deleteSessionKey && deleteFriendlyId) {
      const isActive = deleteFriendlyId === activeFriendlyId
      if (isActive && onActiveSessionDelete) {
        onActiveSessionDelete()
      }
      void deleteSession(deleteSessionKey, deleteFriendlyId, isActive)
    }
    setDeleteDialogOpen(false)
    setDeleteSessionKey(null)
    setDeleteFriendlyId(null)
  }

  const asideProps = {
    className:
      'border-r border-primary-200 h-full overflow-hidden bg-primary-50 dark:bg-primary-100 flex flex-col',
  }

  useEffect(() => {
    function handleOpenSettingsFromSearch() {
      handleOpenSettings()
    }

    window.addEventListener(
      SEARCH_MODAL_EVENTS.OPEN_SETTINGS,
      handleOpenSettingsFromSearch,
    )
    return () => {
      window.removeEventListener(
        SEARCH_MODAL_EVENTS.OPEN_SETTINGS,
        handleOpenSettingsFromSearch,
      )
    }
  }, [handleOpenSettings])

  // ── Nav definitions ─────────────────────────────────────────────────

  // Search button definition (placed above Studio section)
  const searchItem: NavItemDef = {
    kind: 'button',
    icon: Search01Icon,
    label: 'Search',
    active: isSearchModalOpen,
    onClick: openSearchModal,
  }

  const studioItems: NavItemDef[] = [
    {
      kind: 'link',
      to: '/dashboard',
      icon: Home01Icon,
      label: 'Dashboard',
      active: isDashboardActive,
    },
    {
      kind: 'link',
      to: '/agent-swarm',
      icon: BotIcon,
      label: 'Agent Hub',
      active: isAgentSwarmActive,
    },
    {
      kind: 'button',
      icon: PencilEdit02Icon,
      label: 'New Session',
      active: isNewSessionActive,
      onClick: onCreateSession,
      disabled: creatingSession,
    },
    {
      kind: 'link',
      to: '/browser',
      icon: GlobeIcon,
      label: 'Browser',
      active: isBrowserActive,
    },
    {
      kind: 'link',
      to: '/terminal',
      icon: ComputerTerminal01Icon,
      label: 'Terminal',
      active: isTerminalActive,
    },
    {
      kind: 'link',
      to: '/tasks',
      icon: Task01Icon,
      label: 'Tasks',
      active: isTasksActive,
    },
    {
      kind: 'link',
      to: '/skills',
      icon: PuzzleIcon,
      label: 'Skills+',
      active: isSkillsActive,
    },
    {
      kind: 'link',
      to: '/cron',
      icon: Clock01Icon,
      label: 'Cron+',
      active: isCronActive,
    },
    {
      kind: 'link',
      to: '/activity',
      icon: ListViewIcon,
      label: 'Logs+',
      active: isLogsActive,
    },
    {
      kind: 'link',
      to: '/debug',
      icon: Notification03Icon,
      label: 'Debug+',
      active: isDebugActive,
      badge: showDebugErrorDot ? 'error-dot' : undefined,
    },
    {
      kind: 'link',
      to: '/files',
      icon: File01Icon,
      label: 'Files+',
      active: isFilesActive,
    },
    {
      kind: 'link',
      to: '/memory',
      icon: BrainIcon,
      label: 'Memory+',
      active: isMemoryActive,
    },
  ]

  const gatewayItems: NavItemDef[] = [
    {
      kind: 'link',
      to: '/channels',
      icon: Chat01Icon,
      label: 'Channels',
      active: isChannelsActive,
    },
    {
      kind: 'link',
      to: '/instances',
      icon: ServerStack01Icon,
      label: 'Instances',
      active: isInstancesActive,
    },
    {
      kind: 'link',
      to: '/sessions',
      icon: UserMultipleIcon,
      label: 'Sessions',
      active: isSessionsActive,
    },
    {
      kind: 'link',
      to: '/usage',
      icon: ChartLineData01Icon,
      label: 'Usage',
      active: isUsageActive,
    },
    {
      kind: 'link',
      to: '/agents',
      icon: UserGroupIcon,
      label: 'Agents',
      active: isAgentsActive,
    },
    {
      kind: 'link',
      to: '/nodes',
      icon: SmartPhone01Icon,
      label: 'Nodes',
      active: isNodesActive,
    },
  ]

  // Auto-expand sections if any child route is active
  const isAnyGatewayActive = gatewayItems.some((i) => i.active)

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 48 : 300 }}
      transition={transition}
      className={asideProps.className}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <motion.div
        layout
        transition={{ layout: transition }}
        className={cn('flex items-center h-12 px-2', isCollapsed ? 'justify-center' : 'justify-between')}
      >
        <AnimatePresence initial={false}>
          {!isCollapsed ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition}
            >
              <Link
                to="/new"
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'w-full pl-1.5 justify-start',
                )}
              >
                <OpenClawStudioIcon className="size-5 rounded-sm" />
                ClawSuite
              </Link>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger
              onClick={onToggleCollapse}
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={isCollapsed ? 'Open Sidebar' : 'Close Sidebar'}
                >
                  {isCollapsed ? (
                    <OpenClawStudioIcon className="size-5 rounded-sm" />
                  ) : (
                    <HugeiconsIcon
                      icon={SidebarLeft01Icon}
                      size={20}
                      strokeWidth={1.5}
                    />
                  )}
                </Button>
              }
            />
            <TooltipContent side="right">
              {isCollapsed ? 'Open Sidebar' : 'Close Sidebar'}
            </TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      </motion.div>

      {/* ── Search (ChatGPT-style, above sections) ─────────────────── */}
      <div className="px-2 pb-1">
        <motion.div
          layout
          transition={{ layout: transition }}
          className="w-full"
        >
          <NavItem
            item={searchItem}
            isCollapsed={isCollapsed}
            transition={transition}
            onSelectSession={onSelectSession}
          />
        </motion.div>
      </div>

      {/* ── Navigation sections ─────────────────────────────────────── */}
      <div className="mb-2 space-y-0.5 px-2 overflow-y-auto scrollbar-thin">
        {/* STUDIO */}
        <SectionLabel
          label="Studio"
          isCollapsed={isCollapsed}
          transition={transition}
          navigateTo={studioNav}
        />
        {studioItems.map((item) => (
          <motion.div
            key={item.label}
            layout
            transition={{ layout: transition }}
            className="w-full"
          >
            <NavItem
              item={item}
              isCollapsed={isCollapsed}
              transition={transition}
              onSelectSession={onSelectSession}
            />
          </motion.div>
        ))}

        {/* GATEWAY (collapsible) */}
        <SectionLabel
          label="Gateway"
          isCollapsed={isCollapsed}
          transition={transition}
          collapsible
          expanded={gatewayExpanded || isAnyGatewayActive}
          onToggle={toggleGateway}
          navigateTo={gatewayNav}
        />
        <CollapsibleSection
          expanded={gatewayExpanded || isAnyGatewayActive || isCollapsed}
          items={gatewayItems}
          isCollapsed={isCollapsed}
          transition={transition}
          onSelectSession={onSelectSession}
        />

      </div>

      {/* ── Sessions list ───────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden border-t border-primary-200/60">
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition}
              className="flex flex-col w-full min-h-0 h-full"
            >
              <div className="flex-1 min-h-0">
                <SidebarSessions
                  sessions={sessions}
                  activeFriendlyId={activeFriendlyId}
                  onSelect={onSelectSession}
                  onRename={handleOpenRename}
                  onDelete={handleOpenDelete}
                  loading={sessionsLoading}
                  fetching={sessionsFetching}
                  error={sessionsError}
                  onRetry={onRetrySessions}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer with User Menu ─────────────────────────────────── */}
      <div className="px-2 py-2 border-t border-primary-200 bg-primary-50 dark:bg-primary-100 shrink-0 space-y-2">
        {/* User menu (ChatGPT-style) */}
        <MenuRoot>
          <MenuTrigger
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg py-2 transition-colors hover:bg-primary-200',
              isCollapsed ? 'justify-center px-0' : 'px-2',
            )}
          >
            <UserAvatar
              size={32}
              src={profileAvatarDataUrl}
              alt={profileDisplayName}
            />
            <AnimatePresence initial={false} mode="wait">
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="flex-1 truncate text-left text-sm font-medium text-primary-900"
                >
                  {profileDisplayName}
                </motion.span>
              )}
            </AnimatePresence>
          </MenuTrigger>
          <MenuContent side="top" align="start" className="min-w-[200px]">
            <MenuItem onClick={() => navigate({ to: '/settings' })} className="justify-between">
              <span className="flex items-center gap-2">
                <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.5} />
                Config
              </span>
              <kbd className="ml-auto text-[10px] text-primary-500 font-mono">⌘,</kbd>
            </MenuItem>
            <MenuItem onClick={() => navigate({ to: '/settings/providers' })} className="justify-between">
              <span className="flex items-center gap-2">
                <HugeiconsIcon icon={ApiIcon} size={16} strokeWidth={1.5} />
                Providers
              </span>
              <kbd className="ml-auto text-[10px] text-primary-500 font-mono">⌘P</kbd>
            </MenuItem>
          </MenuContent>
        </MenuRoot>

        {/* Gateway status */}
        <GatewayStatusIndicator collapsed={isCollapsed} />
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────────── */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        pathsLoading={pathsLoading}
        pathsError={pathsError}
        paths={paths}
        onClose={closeSettings}
        onCopySessionsDir={copySessionsDir}
        onCopyStorePath={copyStorePath}
      />

      <SessionRenameDialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          setRenameDialogOpen(open)
          if (!open) {
            setRenameSessionKey(null)
            setRenameFriendlyId(null)
            setRenameSessionTitle('')
          }
        }}
        sessionTitle={renameSessionTitle}
        onSave={handleSaveRename}
        onCancel={() => {
          setRenameDialogOpen(false)
          setRenameSessionKey(null)
          setRenameFriendlyId(null)
          setRenameSessionTitle('')
        }}
      />

      <SessionDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        sessionTitle={deleteSessionTitle}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </motion.aside>
  )
}

function areSessionsEqual(
  prevSessions: Array<SessionMeta>,
  nextSessions: Array<SessionMeta>,
): boolean {
  if (prevSessions === nextSessions) return true
  if (prevSessions.length !== nextSessions.length) return false
  for (let i = 0; i < prevSessions.length; i += 1) {
    const prev = prevSessions[i]
    const next = nextSessions[i]
    if (prev.key !== next.key) return false
    if (prev.friendlyId !== next.friendlyId) return false
    if (prev.label !== next.label) return false
    if (prev.title !== next.title) return false
    if (prev.derivedTitle !== next.derivedTitle) return false
    if (prev.updatedAt !== next.updatedAt) return false
    if (prev.titleStatus !== next.titleStatus) return false
    if (prev.titleSource !== next.titleSource) return false
    if (prev.titleError !== next.titleError) return false
  }
  return true
}

function areSidebarPropsEqual(
  prevProps: ChatSidebarProps,
  nextProps: ChatSidebarProps,
): boolean {
  if (prevProps.activeFriendlyId !== nextProps.activeFriendlyId) return false
  if (prevProps.creatingSession !== nextProps.creatingSession) return false
  if (prevProps.isCollapsed !== nextProps.isCollapsed) return false
  if (prevProps.sessionsLoading !== nextProps.sessionsLoading) return false
  if (prevProps.sessionsFetching !== nextProps.sessionsFetching) return false
  if (prevProps.sessionsError !== nextProps.sessionsError) return false
  if (prevProps.onRetrySessions !== nextProps.onRetrySessions) return false
  if (!areSessionsEqual(prevProps.sessions, nextProps.sessions)) return false
  return true
}

const MemoizedChatSidebar = memo(ChatSidebarComponent, areSidebarPropsEqual)

export { MemoizedChatSidebar as ChatSidebar }
