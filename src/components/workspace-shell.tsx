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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@/lib/utils'
import { ChatSidebar } from '@/screens/chat/components/chat-sidebar'
import { chatQueryKeys } from '@/screens/chat/chat-queries'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { SIDEBAR_TOGGLE_EVENT } from '@/hooks/use-global-shortcuts'
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation'
import { ChatPanel } from '@/components/chat-panel'
import { ChatPanelToggle } from '@/components/chat-panel-toggle'
import { LoginScreen } from '@/components/auth/login-screen'
import { GatewayConnectionBanner } from '@/components/gateway-connection-banner'
import { MobileTabBar } from '@/components/mobile-tab-bar'
import { useMobileKeyboard } from '@/hooks/use-mobile-keyboard'
import { ErrorBoundary } from '@/components/error-boundary'
import { SystemMetricsFooter } from '@/components/system-metrics-footer'
import { CommandPalette } from '@/components/command-palette'
import { useSettings } from '@/hooks/use-settings'
import { Button } from '@/components/ui/button'
// ActivityTicker moved to dashboard-only (too noisy for global header)
import type { SessionMeta } from '@/screens/chat/types'

type SessionsListResponse = Array<SessionMeta>
export const DESKTOP_SIDEBAR_BACKDROP_CLASS =
  'fixed left-0 bottom-0 top-[var(--titlebar-h,0px)] w-[300px] z-10 bg-black/10 backdrop-blur-[1px]'

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
  const isElectron = useMemo(
    () =>
      typeof navigator !== 'undefined' && /Electron/.test(navigator.userAgent),
    [],
  )

  const { settings } = useSettings()
  const sidebarCollapsed = useWorkspaceStore((s) => s.sidebarCollapsed)
  const chatFocusMode = useWorkspaceStore((s) => s.chatFocusMode)
  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar)
  const setSidebarCollapsed = useWorkspaceStore((s) => s.setSidebarCollapsed)
  const { onTouchStart, onTouchMove, onTouchEnd } = useSwipeNavigation()

  // ChatGPT-style: track visual viewport height for keyboard-aware layout
  useMobileKeyboard()

  const [creatingSession, setCreatingSession] = useState(false)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 767px)').matches
  })

  // Slide transition direction tracking (mobile only)
  const [slideClass, setSlideClass] = useState<string>('')
  const prevTabIndexRef = useRef<number>(-1)

  // Map pathname to tab index (mirrors TABS order in mobile-tab-bar)
  const getTabIndex = useCallback((path: string): number => {
    if (path.startsWith('/dashboard')) return 0
    if (path.startsWith('/conductor') || path.startsWith('/agents') || path.startsWith('/operations')) return 1
    if (path.startsWith('/chat') || path === '/new' || path === '/') return 2
    if (path.startsWith('/skills')) return 3
    if (path.startsWith('/settings')) return 4
    return -1
  }, [])

  // Fetch actual auth status from server instead of hardcoding
  interface AuthStatus {
    authenticated: boolean
    authRequired: boolean
    error?: string
  }

  const authQuery = useQuery<AuthStatus>({
    queryKey: ['auth-status'],
    queryFn: async () => {
      const controller = new AbortController()
      // /api/auth-check is local (no gateway calls) — should respond in <100ms.
      // If it doesn't, something is very wrong; fail fast instead of stalling.
      const timeout = globalThis.setTimeout(() => controller.abort(), 2_000)

      let res: Response
      try {
        res = await fetch('/api/auth-check', { signal: controller.signal })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error('Request timed out after 2 seconds')
        }
        throw error instanceof Error
          ? error
          : new Error('Failed to connect to ControlSuite server')
      } finally {
        globalThis.clearTimeout(timeout)
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as AuthStatus
      if (data.error) throw new Error(data.error)
      return data
    },
    staleTime: 60_000,
    retry: 1,
    retryDelay: 500,
  })

  // Hard cap on the "Initializing" splash. Whatever the auth state is after
  // ~3.5s, we proceed — the splash should never stick on mobile/Tailscale.
  const [splashTimedOut, setSplashTimedOut] = useState(false)
  useEffect(() => {
    if (!authQuery.isLoading) return undefined
    const id = globalThis.setTimeout(() => setSplashTimedOut(true), 3500)
    return () => globalThis.clearTimeout(id)
  }, [authQuery.isLoading])

  const authState = {
    checked: !authQuery.isLoading || splashTimedOut,
    authenticated: authQuery.data?.authenticated ?? true,
    authRequired: authQuery.data?.authRequired ?? false,
  }

  // Derive active session from URL
  const chatMatch = pathname.match(/^\/chat\/(.+)$/)
  const activeFriendlyId = chatMatch ? chatMatch[1] : 'main'
  const isOnChatRoute = Boolean(chatMatch) || pathname === '/new'
  const hideChatSidebar = isOnChatRoute && chatFocusMode
  const showDesktopSidebarBackdrop =
    !isMobile && !isOnChatRoute && !sidebarCollapsed

  const shouldLivePollSessions =
    pathname.startsWith('/chat') ||
    pathname === '/new' ||
    pathname === '/' ||
    pathname.startsWith('/dashboard')

  // Sessions query — shared across sidebar and chat, but keep it light.
  const sessionsQuery = useQuery({
    queryKey: chatQueryKeys.sessions,
    queryFn: fetchSessions,
    refetchInterval: shouldLivePollSessions ? 60_000 : 120_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 60_000,
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

  useEffect(() => {
    if (typeof document === 'undefined') return
    const titlebarHeight = isElectron ? '40px' : '0px'
    document.documentElement.style.setProperty('--titlebar-h', titlebarHeight)
    return () => {
      document.documentElement.style.removeProperty('--titlebar-h')
    }
  }, [isElectron])

  // Keep mobile sidebar state closed after resize and route changes.
  useEffect(() => {
    if (!isMobile) return
    setSidebarCollapsed(true)
  }, [isMobile, pathname, setSidebarCollapsed])

  // Slide transitions on mobile tab navigation
  useEffect(() => {
    if (!isMobile) return
    const currentIdx = getTabIndex(pathname)
    const prevIdx = prevTabIndexRef.current

    if (prevIdx !== -1 && currentIdx !== -1 && currentIdx !== prevIdx) {
      // Navigate right (higher index) = slide left; left = slide right
      const direction = currentIdx > prevIdx ? 'slide-enter-left' : 'slide-enter-right'
      setSlideClass(direction)
      // Remove class after animation completes
      const timer = setTimeout(() => setSlideClass(''), 250)
      prevTabIndexRef.current = currentIdx
      return () => clearTimeout(timer)
    }

    prevTabIndexRef.current = currentIdx
    return undefined
  }, [isMobile, pathname, getTabIndex])

  // Listen for global sidebar toggle shortcut
  useEffect(() => {
    function handleToggleEvent() {
      if (isMobile) {
        setSidebarCollapsed(true)
        return
      }
      toggleSidebar()
    }
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, handleToggleEvent)
    return () =>
      window.removeEventListener(SIDEBAR_TOGGLE_EVENT, handleToggleEvent)
  }, [isMobile, setSidebarCollapsed, toggleSidebar])

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

  const authQueryErrorMessage =
    authQuery.isError
      ? authQuery.error instanceof Error
        ? authQuery.error.message
        : 'Failed to connect to ClawSuite server'
      : null

  // Show login screen if auth is required and not authenticated
  if (authState.authRequired && !authState.authenticated) {
    return <LoginScreen />
  }

  const shellStyle: React.CSSProperties & Record<'--titlebar-h', string> = {
    height: 'var(--vvh, 100dvh)',
    paddingTop: isElectron ? 40 : 0,
    '--titlebar-h': isElectron ? '40px' : '0px',
  }

  return (
    <>
      <div
        className="relative overflow-hidden theme-bg theme-text"
        style={shellStyle}
      >
        {/* Electron: native-style title bar (absolute over the padding) */}
        {authQueryErrorMessage ? (
          <div className="absolute inset-x-0 top-0 z-50 flex justify-center px-3 py-2 pointer-events-none">
            <div className="pointer-events-auto rounded-lg border border-amber-500/30 bg-amber-500/12 px-3 py-2 text-xs text-amber-100 shadow-lg backdrop-blur-sm">
              ClawSuite had a brief local auth-check hiccup, but the app is staying live.
              <button
                type="button"
                className="ml-2 underline underline-offset-2"
                onClick={() => void authQuery.refetch()}
              >
                Retry
              </button>
            </div>
          </div>
        ) : null}

        {isElectron && (
          <div
            className="absolute inset-x-0 top-0 flex h-10 items-center border-b border-primary-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 z-40"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          >
            {/* Traffic light spacer (left ~78px for macOS buttons) */}
            <div className="w-[78px] shrink-0" />
            {/* Centered title */}
            <div className="flex-1 text-center">
              <span className="text-[13px] font-medium text-primary-600 dark:text-primary-400 select-none">ClawSuite</span>
            </div>
            {/* Right spacer to balance */}
            <div className="w-[78px] shrink-0" />
          </div>
        )}
        <GatewayConnectionBanner />
        <div
          className={cn(
            'grid h-full grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden',
            hideChatSidebar ? 'md:grid-cols-1' : 'md:grid-cols-[auto_1fr]',
          )}
        >
          {/* Activity ticker bar */}
          {/* Persistent sidebar */}
          {!isMobile && !hideChatSidebar && (
            <div className="relative z-30">
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
            </div>
          )}

          {/* Main content area — renders the matched route */}
          <main
            onTouchStart={isMobile ? onTouchStart : undefined}
            onTouchMove={isMobile ? onTouchMove : undefined}
            onTouchEnd={isMobile ? onTouchEnd : undefined}
            className={[
              'h-full min-h-0 min-w-0 overflow-x-hidden bg-transparent',
              isOnChatRoute ? 'overflow-hidden' : 'overflow-y-auto',
              isMobile && !isOnChatRoute
                ? 'pb-[calc(var(--tabbar-h,120px)+0.5rem)]'
                : !isMobile &&
                    !isOnChatRoute &&
                    settings.showSystemMetricsFooter
                  ? 'pb-[calc(1.5rem+1.75rem)]'
                  : '',
            ].join(' ')}
            data-tour="chat-area"
          >
            <div className={['page-transition h-full', slideClass].filter(Boolean).join(' ')}>
              <ErrorBoundary
                className="h-full"
                title="Something went wrong"
                description="This page failed to render. Reload to try again."
              >
                <Outlet />
              </ErrorBoundary>
            </div>
          </main>

          {/* Chat panel — visible on non-chat routes */}
          {!isOnChatRoute && !isMobile && <ChatPanel />}
        </div>

        {/* Floating chat toggle — visible on non-chat routes */}
        {!isOnChatRoute && !isMobile && <ChatPanelToggle />}

        {showDesktopSidebarBackdrop ? (
          <button
            type="button"
            aria-label="Collapse navigation sidebar"
            onClick={() => setSidebarCollapsed(true)}
            className={DESKTOP_SIDEBAR_BACKDROP_CLASS}
          />
        ) : null}
      </div>

      {isMobile ? <MobileTabBar /> : null}
      {settings.showSystemMetricsFooter && pathname.startsWith('/dashboard') ? (
        <SystemMetricsFooter enabled />
      ) : null}
      <CommandPalette pathname={pathname} sessions={sessions} />
    </>
  )
}
