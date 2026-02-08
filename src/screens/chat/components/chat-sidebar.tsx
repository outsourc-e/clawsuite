import { HugeiconsIcon } from '@hugeicons/react'
import {
  BrainIcon,
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
  Settings01Icon,
  SidebarLeft01Icon,
} from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { useChatSettings } from '../hooks/use-chat-settings'
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
import { OpenClawStudioIcon } from '@/components/icons/openclaw-studio'
import {
  SEARCH_MODAL_EVENTS,
  useSearchModal,
} from '@/hooks/use-search-modal'
import { GatewayStatusIndicator } from '@/components/gateway-status-indicator'

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
  } = useChatSettings()
  const { deleteSession } = useDeleteSession()
  const { renameSession } = useRenameSession()
  const openSearchModal = useSearchModal((state) => state.openModal)
  const isSearchModalOpen = useSearchModal((state) => state.isOpen)
  const pathname = useRouterState({
    select: function selectPathname(state) {
      return state.location.pathname
    },
  })
  const isDashboardActive = pathname === '/dashboard'
  const isFilesActive = pathname === '/files'
  const isMemoryActive = pathname === '/memory'
  const isLogsActive = pathname === '/logs'
  const isDebugActive = pathname === '/debug'
  const isCronActive = pathname === '/cron'
  const isBrowserActive = pathname === '/browser'
  const isSettingsRouteActive = pathname === '/settings'
  const isSkillsActive = pathname === '/skills'
  const isTerminalActive = pathname === '/terminal'
  const isNewSessionActive = pathname === '/new'
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
      'border-r border-primary-200 h-full overflow-hidden bg-surface flex flex-col',
  }

  function navItemClass(active = false): string {
    return cn(
      buttonVariants({ variant: 'ghost', size: 'sm' }),
      'w-full h-auto justify-start gap-2.5 px-3 py-2',
      active
        ? 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/15'
        : 'text-primary-900 hover:bg-primary-200',
    )
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

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 48 : 300 }}
      transition={transition}
      className={asideProps.className}
    >
      <motion.div
        layout
        transition={{ layout: transition }}
        className={cn('flex items-center h-12 px-2 justify-between')}
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
                OpenClaw Studio
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

      <div className="mb-4 space-y-1 px-2">
        <motion.div
          layout
          transition={{ layout: transition }}
          className="w-full"
        >
          <Link
            to="/dashboard"
            onMouseUp={onSelectSession}
            className={navItemClass(isDashboardActive)}
          >
            <HugeiconsIcon
              icon={Home01Icon}
              size={20}
              strokeWidth={1.5}
              className="size-5 shrink-0"
            />
            <AnimatePresence initial={false} mode="wait">
              {!isCollapsed ? (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Dashboard
                </motion.span>
              ) : null}
            </AnimatePresence>
          </Link>
        </motion.div>
        <motion.div
          layout
          transition={{ layout: transition }}
          className="w-full"
        >
          <Link
            to="/debug"
            onMouseUp={onSelectSession}
            className={navItemClass(isDebugActive)}
          >
            <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
              <HugeiconsIcon
                icon={Notification03Icon}
                size={20}
                strokeWidth={1.5}
                className="size-5 shrink-0"
              />
              {showDebugErrorDot ? (
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-red-500" />
              ) : null}
            </span>
            <AnimatePresence initial={false} mode="wait">
              {!isCollapsed ? (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Debug
                </motion.span>
              ) : null}
            </AnimatePresence>
          </Link>
        </motion.div>
        <motion.div
          layout
          transition={{ layout: transition }}
          className="w-full"
        >
          <Button
            disabled={creatingSession}
            variant="ghost"
            size="sm"
            onClick={onCreateSession}
            onMouseUp={onSelectSession}
            className={navItemClass(isNewSessionActive)}
          >
            <HugeiconsIcon
              icon={PencilEdit02Icon}
              size={20}
              strokeWidth={1.5}
              className="size-5 shrink-0"
            />
            <AnimatePresence initial={false} mode="wait">
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  New Session
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </motion.div>
        <motion.div
          layout
          transition={{ layout: transition }}
          className="w-full"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={openSearchModal}
            className={navItemClass(isSearchModalOpen)}
            title={isCollapsed ? 'Search' : undefined}
          >
            <HugeiconsIcon
              icon={Search01Icon}
              size={20}
              strokeWidth={1.5}
              className="size-5 shrink-0"
            />
            <AnimatePresence initial={false} mode="wait">
              {!isCollapsed ? (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Search
                </motion.span>
              ) : null}
            </AnimatePresence>
          </Button>
        </motion.div>
        <motion.div
          layout
          transition={{ layout: transition }}
          className="w-full"
        >
          <Link
            to="/skills"
            onMouseUp={onSelectSession}
            className={navItemClass(isSkillsActive)}
          >
            <HugeiconsIcon
              icon={PuzzleIcon}
              size={20}
              strokeWidth={1.5}
              className="size-5 shrink-0"
            />
            <AnimatePresence initial={false} mode="wait">
              {!isCollapsed ? (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Skills
                </motion.span>
              ) : null}
            </AnimatePresence>
          </Link>
        </motion.div>
        <motion.div
          layout
          transition={{ layout: transition }}
          className="w-full"
        >
          <Link
            to="/browser"
            onMouseUp={onSelectSession}
            className={navItemClass(isBrowserActive)}
          >
            <HugeiconsIcon
              icon={GlobeIcon}
              size={20}
              strokeWidth={1.5}
              className="size-5 shrink-0"
            />
            <AnimatePresence initial={false} mode="wait">
              {!isCollapsed ? (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Browser
                </motion.span>
              ) : null}
            </AnimatePresence>
          </Link>
        </motion.div>
        <motion.div
          layout
          transition={{ layout: transition }}
          className="w-full"
        >
          <Link
            to="/terminal"
            onMouseUp={onSelectSession}
            className={navItemClass(isTerminalActive)}
          >
            <HugeiconsIcon
              icon={ComputerTerminal01Icon}
              size={20}
              strokeWidth={1.5}
              className="size-5 shrink-0"
            />
            <AnimatePresence initial={false} mode="wait">
              {!isCollapsed ? (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Terminal
                </motion.span>
              ) : null}
            </AnimatePresence>
          </Link>
        </motion.div>
        <motion.div
          layout
          transition={{ layout: transition }}
          className="w-full"
        >
          <Link
            to="/logs"
            onMouseUp={onSelectSession}
            className={navItemClass(isLogsActive)}
          >
            <HugeiconsIcon
              icon={ListViewIcon}
              size={20}
              strokeWidth={1.5}
              className="size-5 shrink-0"
            />
            <AnimatePresence initial={false} mode="wait">
              {!isCollapsed ? (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Logs
                </motion.span>
              ) : null}
            </AnimatePresence>
          </Link>
        </motion.div>
        <motion.div
          layout
          transition={{ layout: transition }}
          className="w-full"
        >
          <Link
            to="/cron"
            onMouseUp={onSelectSession}
            className={navItemClass(isCronActive)}
          >
            <HugeiconsIcon
              icon={Clock01Icon}
              size={20}
              strokeWidth={1.5}
              className="size-5 shrink-0"
            />
            <AnimatePresence initial={false} mode="wait">
              {!isCollapsed ? (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Cron
                </motion.span>
              ) : null}
            </AnimatePresence>
          </Link>
        </motion.div>
        <motion.div
          layout
          transition={{ layout: transition }}
          className="w-full"
        >
          <Link
            to="/files"
            onMouseUp={onSelectSession}
            className={navItemClass(isFilesActive)}
          >
            <HugeiconsIcon
              icon={File01Icon}
              size={20}
              strokeWidth={1.5}
              className="size-5 shrink-0"
            />
            <AnimatePresence initial={false} mode="wait">
              {!isCollapsed ? (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Files
                </motion.span>
              ) : null}
            </AnimatePresence>
          </Link>
        </motion.div>
        <motion.div
          layout
          transition={{ layout: transition }}
          className="w-full"
        >
          <Link
            to="/memory"
            onMouseUp={onSelectSession}
            className={navItemClass(isMemoryActive)}
          >
            <HugeiconsIcon
              icon={BrainIcon}
              size={20}
              strokeWidth={1.5}
              className="size-5 shrink-0"
            />
            <AnimatePresence initial={false} mode="wait">
              {!isCollapsed ? (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Memory
                </motion.span>
              ) : null}
            </AnimatePresence>
          </Link>
        </motion.div>
        <motion.div
          layout
          transition={{ layout: transition }}
          className="w-full"
        >
          <Link
            to="/settings"
            onMouseUp={onSelectSession}
            className={navItemClass(isSettingsRouteActive)}
          >
            <HugeiconsIcon
              icon={Settings01Icon}
              size={20}
              strokeWidth={1.5}
              className="size-5 shrink-0"
            />
            <AnimatePresence initial={false} mode="wait">
              {!isCollapsed ? (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Settings
                </motion.span>
              ) : null}
            </AnimatePresence>
          </Link>
        </motion.div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition}
              className="pt-0 flex flex-col w-full min-h-0 h-full"
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

      <div className="px-2 py-3 border-t border-primary-200 bg-surface shrink-0">
        <GatewayStatusIndicator collapsed={isCollapsed} />
        <div className="w-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenSettings}
            title={isCollapsed ? 'Settings' : undefined}
            className="w-full h-auto justify-start gap-2.5 px-3 py-2"
          >
            <HugeiconsIcon
              icon={Settings01Icon}
              size={20}
              strokeWidth={1.5}
              className="size-5 shrink-0"
            />
            <AnimatePresence initial={false} mode="wait">
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Settings
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </div>
      </div>

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
