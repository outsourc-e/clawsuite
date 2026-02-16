/**
 * WorkspaceShell — persistent layout wrapper.
 *
 * ┌──────────┬──────────────────────────┐
 * │ Sidebar  │  Content (Outlet)        │
 * │ (nav +   │  (sub-page or chat)      │
 * │ sessions)│                          │
 * └──────────┴──────────────────────────┘
 *
 * The sidebar is always visible. Routes render in the content area.
 * Chat routes get the full ChatScreen treatment.
 * Non-chat routes show the sub-page content.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChatSidebar } from '@/screens/chat/components/chat-sidebar'
import { chatQueryKeys } from '@/screens/chat/chat-queries'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { SIDEBAR_TOGGLE_EVENT } from '@/hooks/use-global-shortcuts'
import { ChatPanel } from '@/components/chat-panel'
import { ChatPanelToggle } from '@/components/chat-panel-toggle'
import { LoginScreen } from '@/components/auth/login-screen'
import { MobileTabBar } from '@/components/mobile-tab-bar'
// ActivityTicker moved to dashboard-only (too noisy for global header)
import type { SessionMeta } from '@/screens/chat/types'

type SessionsListResponse = Array<SessionMeta>

async function fetchSessions(): Promise<SessionsListResponse> {
  const res = await fetch('/api/sessions')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data?.sessions)
    ? data.sessions
    : Array.isArray(data)
      ? data
      : []
}

export function WorkspaceShell() {
  const navigate = useNavigate()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  const sidebarCollapsed = useWorkspaceStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar)
  const setSidebarCollapsed = useWorkspaceStore((s) => s.setSidebarCollapsed)

  const [creatingSession, setCreatingSession] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const swipeStartRef = useRef<{
    x: number
    y: number
    at: number
  } | null>(null)
  const [authState] = useState({
    checked: true,
    authenticated: true,
    authRequired: false,
  })

  // Derive active session from URL
  const chatMatch = pathname.match(/^\/chat\/(.+)$/)
  const activeFriendlyId = chatMatch ? chatMatch[1] : 'main'
  const isOnChatRoute = Boolean(chatMatch) || pathname === '/new'

  // Sessions query — shared across sidebar and chat
  const sessionsQuery = useQuery({
    queryKey: chatQueryKeys.sessions,
    queryFn: fetchSessions,
    refetchInterval: 15_000,
    staleTime: 10_000,
  })

  const sessions = sessionsQuery.data ?? []
  const sessionsLoading = sessionsQuery.isLoading
  const sessionsFetching = sessionsQuery.isFetching
  const sessionsError = sessionsQuery.isError
    ? sessionsQuery.error instanceof Error
      ? sessionsQuery.error.message
      : 'Failed to load sessions'
    : null

  const refetchSessions = useCallback(() => {
    void sessionsQuery.refetch()
  }, [sessionsQuery])

  const startNewChat = useCallback(() => {
    setCreatingSession(true)
    navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'new' } }).then(
      () => {
        setCreatingSession(false)
      },
    )
  }, [navigate])

  const handleSelectSession = useCallback(() => {
    // On mobile, collapse sidebar after selecting
    if (window.innerWidth < 768) {
      setSidebarCollapsed(true)
    }
  }, [setSidebarCollapsed])

  const handleActiveSessionDelete = useCallback(() => {
    navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'main' } })
  }, [navigate])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarCollapsed(true)
    }
  }, [isMobile, setSidebarCollapsed])

  // Edge swipe gesture: left edge swipe opens sidebar
  useEffect(() => {
    const EDGE_ZONE_PX = 28
    const MIN_SWIPE_PX = 56
    const MAX_VERTICAL_DRIFT_PX = 72
    const MAX_DURATION_MS = 520

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      swipeStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        at: Date.now(),
      }
    }

    function handleTouchEnd(event: TouchEvent) {
      if (!isMobile) return
      const start = swipeStartRef.current
      swipeStartRef.current = null
      if (!start || event.changedTouches.length !== 1) return

      const touch = event.changedTouches[0]
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      const elapsed = Date.now() - start.at
      if (elapsed > MAX_DURATION_MS) return
      if (Math.abs(dy) > MAX_VERTICAL_DRIFT_PX) return

      const fromLeftEdge = start.x <= EDGE_ZONE_PX
      if (fromLeftEdge && dx >= MIN_SWIPE_PX) {
        setSidebarCollapsed(false)
      }
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isMobile, setSidebarCollapsed])

  // Listen for global sidebar toggle shortcut
  useEffect(() => {
    function handleToggleEvent() {
      toggleSidebar()
    }
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, handleToggleEvent)
    return () =>
      window.removeEventListener(SIDEBAR_TOGGLE_EVENT, handleToggleEvent)
  }, [toggleSidebar])

  // Show loading indicator while checking auth
  if (!authState.checked) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-accent-500 border-r-transparent mb-4" />
          <p className="text-sm text-primary-500">Initializing ClawSuite...</p>
        </div>
      </div>
    )
  }

  // Show login screen if auth is required and not authenticated
  if (authState.authRequired && !authState.authenticated) {
    return <LoginScreen />
  }

  return (
    <div className="relative h-dvh bg-surface text-primary-900">
      <div className="grid h-full grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden md:grid-cols-[auto_1fr]">
        {/* Activity ticker bar */}
        {/* Persistent sidebar */}
        <ChatSidebar
          sessions={sessions}
          activeFriendlyId={activeFriendlyId}
          creatingSession={creatingSession}
          onCreateSession={startNewChat}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          onSelectSession={handleSelectSession}
          onActiveSessionDelete={handleActiveSessionDelete}
          sessionsLoading={sessionsLoading}
          sessionsFetching={sessionsFetching}
          sessionsError={sessionsError}
          onRetrySessions={refetchSessions}
        />

        {/* Mobile backdrop overlay when sidebar is open */}
        {isMobile && !sidebarCollapsed && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setSidebarCollapsed(true)}
          />
        )}

        {/* Main content area — renders the matched route */}
        <main
          className={[
            'h-full min-h-0 min-w-0 overflow-x-hidden',
            isOnChatRoute ? 'overflow-hidden' : 'overflow-y-auto',
            isMobile && !isOnChatRoute ? 'pb-24' : '',
          ].join(' ')}
          data-tour="chat-area"
        >
          <Outlet />
        </main>

        {/* Chat panel — visible on non-chat routes */}
        {!isOnChatRoute && !isMobile && <ChatPanel />}
      </div>

      {/* Floating chat toggle — visible on non-chat routes */}
      {!isOnChatRoute && !isMobile && <ChatPanelToggle />}

      {isMobile ? <MobileTabBar /> : null}
    </div>
  )
}
