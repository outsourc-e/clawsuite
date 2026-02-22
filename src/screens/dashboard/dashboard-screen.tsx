import {
  ArrowDown01Icon,
  ArrowUp02Icon,
  Activity01Icon,
  BubbleChatIcon,
  ChartLineData02Icon,
  Moon02Icon,
  PencilEdit02Icon,
  RefreshIcon,
  Settings01Icon,
  Sun02Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useNavigate } from '@tanstack/react-router'
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { SquadStatusWidget } from './components/squad-status-widget'
import { ActivityLogWidget } from './components/activity-log-widget'
import { CollapsibleWidget } from './components/collapsible-widget'
import { MetricsWidget } from './components/metrics-widget'
import { NotificationsWidget } from './components/notifications-widget'
import { RecentSessionsWidget } from './components/recent-sessions-widget'
import { SkillsWidget } from './components/skills-widget'
import { TasksWidget } from './components/tasks-widget'
import { UsageMeterWidget } from './components/usage-meter-widget'
import { SystemGlance } from './components/system-glance'
import { AddWidgetPopover } from './components/add-widget-popover'
import { WidgetGrid, type WidgetGridItem } from './components/widget-grid'
import { HeaderAmbientStatus } from './components/header-ambient-status'
import { NotificationsPopover } from './components/notifications-popover'
import { useVisibleWidgets } from './hooks/use-visible-widgets'
import { useDashboardData, buildUsageSummaryText } from './hooks/use-dashboard-data'
import { formatMoney, formatRelativeTime } from './lib/formatters'
import { OpenClawStudioIcon } from '@/components/icons/clawsuite'
import { ThemeToggle } from '@/components/theme-toggle'
import { SettingsDialog } from '@/components/settings-dialog'
import { DashboardOverflowPanel } from '@/components/dashboard-overflow-panel'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/hooks/use-settings'
import {
  type DashboardWidgetOrderId,
  useWidgetReorder,
} from '@/hooks/use-widget-reorder'

type MobileWidgetSection = {
  id: DashboardWidgetOrderId
  label: string
  content: ReactNode
}

// ─── Pull-to-refresh hook ────────────────────────────────────────────────────

function usePullToRefresh(
  enabled: boolean,
  onRefresh: () => void,
  containerRef: RefObject<HTMLElement | null>,
) {
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const startYRef = useRef(0)
  const isPullingRef = useRef(false)
  const THRESHOLD = 72

  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return

    function onTouchStart(e: TouchEvent) {
      if (container!.scrollTop === 0 && e.touches[0]) {
        startYRef.current = e.touches[0].clientY
        isPullingRef.current = true
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!isPullingRef.current || !e.touches[0]) return
      const delta = e.touches[0].clientY - startYRef.current
      if (delta > 0) {
        setPullDistance(Math.min(delta, THRESHOLD * 1.5))
        setIsPulling(delta > 10)
      }
    }

    function onTouchEnd() {
      if (!isPullingRef.current) return
      const delta = pullDistance
      isPullingRef.current = false
      if (delta >= THRESHOLD) {
        onRefresh()
      }
      setIsPulling(false)
      setPullDistance(0)
    }

    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchmove', onTouchMove, { passive: true })
    container.addEventListener('touchend', onTouchEnd)

    return () => {
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
    }
  }, [enabled, onRefresh, containerRef, pullDistance])

  return { isPulling, pullDistance, threshold: THRESHOLD }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardScreen() {
  const navigate = useNavigate()
  const [dashSettingsOpen, setDashSettingsOpen] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [dismissedChips, setDismissedChips] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const stored = window.localStorage.getItem('clawsuite-dismissed-chips')
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set()
    } catch { return new Set() }
  })
  const { visibleIds, addWidget, removeWidget, resetVisible } =
    useVisibleWidgets()
  const { order: widgetOrder, moveWidget, resetOrder } = useWidgetReorder()
  const theme = useSettingsStore((state) => state.settings.theme)
  const updateSettings = useSettingsStore((state) => state.updateSettings)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileEditMode, setMobileEditMode] = useState(false)
  const [showLogoTip, setShowLogoTip] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem('clawsuite-logo-tip-seen') !== 'true'
    } catch {
      return false
    }
  })
  const mainScrollRef = useRef<HTMLElement>(null)

  // ── Dashboard data (single hook, all queries + computed values) ────────────
  const { data: dashboardData, refetch } = useDashboardData()

  // ── Pull-to-refresh (mobile) ───────────────────────────────────────────────
  const { isPulling, pullDistance, threshold } = usePullToRefresh(
    isMobile,
    refetch,
    mainScrollRef,
  )

  // B5: Use md-breakpoint-consistent 767px (= Tailwind md − 1px)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!isMobile || !showLogoTip) return
    const timeout = window.setTimeout(() => {
      setShowLogoTip(false)
      try {
        localStorage.setItem('clawsuite-logo-tip-seen', 'true')
      } catch {}
    }, 4_000)
    return () => window.clearTimeout(timeout)
  }, [isMobile, showLogoTip])

  const handleResetLayout = useCallback(() => {
    resetVisible()
    resetOrder()
    setMobileEditMode(false)
  }, [resetOrder, resetVisible])

  const nextTheme = useMemo(
    () => (theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'),
    [theme],
  )
  const mobileThemeIsDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark'))
  const mobileThemeIcon = mobileThemeIsDark ? Moon02Icon : Sun02Icon

  const markLogoTipSeen = useCallback(function markLogoTipSeen() {
    setShowLogoTip(false)
    try {
      localStorage.setItem('clawsuite-logo-tip-seen', 'true')
    } catch {}
  }, [])
  const shouldShowLogoTip = isMobile && showLogoTip

  const handleLogoTap = useCallback(function handleLogoTap() {
    markLogoTipSeen()
    setOverflowOpen(true)
  }, [markLogoTipSeen])

  const visibleWidgetSet = useMemo(() => {
    return new Set(visibleIds)
  }, [visibleIds])

  // ── Derived display values ─────────────────────────────────────────────────

  // Canonical cost display — single source of truth for both SystemGlance and MetricCards.
  // todayCostUsd is the priority-resolved value; cost.today mirrors it once the hook settles.
  // Never shows "—"; always shows at least $0.00.
  const costTodayDisplay = formatMoney(dashboardData.todayCostUsd ?? dashboardData.cost.today)

  // B1: Uptime fallback — if formatted is "—", show "Active · last check Xm ago"
  const uptimeDisplay = useMemo(() => {
    if (dashboardData.uptime.formatted !== '—') return dashboardData.uptime.formatted
    if (dashboardData.connection.connected && dashboardData.updatedAt > 0) {
      return `Active · ${formatRelativeTime(dashboardData.updatedAt)}`
    }
    return dashboardData.connection.connected ? 'Active' : '—'
  }, [dashboardData.uptime.formatted, dashboardData.connection.connected, dashboardData.updatedAt])

  const usageSummaryText = buildUsageSummaryText(dashboardData)
  const usageSummaryIsError = dashboardData.usageStatus === 'error' || dashboardData.usageStatus === 'timeout'

  const visibleAlerts = dashboardData.alerts.filter((c) => !dismissedChips.has(c.id))

  // Timeseries data for micro charts
  const costChartData = useMemo(
    () => dashboardData.timeseries.costByDay.map((p) => ({ date: p.date, value: p.amount })),
    [dashboardData.timeseries.costByDay],
  )
  const sessionsChartData = useMemo(
    () => dashboardData.timeseries.messagesByDay.map((p) => ({ date: p.date, value: p.count })),
    [dashboardData.timeseries.messagesByDay],
  )

  const healthStatus = useMemo(() => {
    if (!dashboardData.connection.connected) return 'offline' as const
    if (dashboardData.uptime.seconds <= 0) return 'warning' as const
    return 'healthy' as const
  }, [dashboardData.connection.connected, dashboardData.uptime.seconds])

  // ── Metric items (mobile card grid + desktop widget metrics row) ───────────
  const metricItems = useMemo<Array<WidgetGridItem>>(
    function buildMetricItems() {
      return [
        {
          id: 'metric-sessions',
          size: 'small',
          node: (
            <MetricsWidget
              title="Sessions"
              value={dashboardData.sessions.total}
              subtitle="Active in 24h"
              icon={Activity01Icon}
              accent="cyan"
              description="Sessions active in the last 24 hours."
              rawValue={`${dashboardData.sessions.total} sessions`}
              chartData={sessionsChartData}
              chartAccentClass="bg-cyan-500"
            />
          ),
        },
        {
          id: 'metric-agents',
          size: 'small',
          node: (
            <MetricsWidget
              title="Active Agents"
              value={dashboardData.agents.active || dashboardData.agents.total}
              subtitle="Currently active"
              icon={UserGroupIcon}
              accent="orange"
              description="Agents currently running or processing work."
              rawValue={`${dashboardData.agents.active} active agents`}
            />
          ),
        },
        {
          id: 'metric-cost',
          size: 'small',
          node: (
            <MetricsWidget
              title="Cost Today"
              value={costTodayDisplay}
              subtitle="Today's spend"
              icon={ChartLineData02Icon}
              accent="emerald"
              trendPct={dashboardData.cost.trend ?? undefined}
              trendLabel={dashboardData.cost.trend !== null ? 'vs prev day' : undefined}
              trendInverted
              description="Today's estimated spend from gateway cost telemetry."
              rawValue={costTodayDisplay}
              chartData={costChartData}
              chartAccentClass="bg-emerald-500"
            />
          ),
        },
        {
          id: 'metric-messages',
          size: 'small',
          node: (
            <MetricsWidget
              title="Messages"
              value={dashboardData.usage.messages.total}
              subtitle={`${dashboardData.usage.messages.user} user · ${dashboardData.usage.messages.assistant} assistant`}
              icon={BubbleChatIcon}
              accent="purple"
              description="Total messages exchanged today across all sessions."
              rawValue={`${dashboardData.usage.messages.total} messages`}
            />
          ),
        },
      ]
    },
    [
      costTodayDisplay,
      costChartData,
      sessionsChartData,
      dashboardData.agents.active,
      dashboardData.agents.total,
      dashboardData.cost.trend,
      dashboardData.sessions.total,
      dashboardData.status,
      dashboardData.usage.messages.total,
      dashboardData.usage.messages.user,
      dashboardData.usage.messages.assistant,
      refetch,
    ],
  )

  // ── Enterprise desktop layout ──────────────────────────────────────────────
  // C2: SystemGlance → chips → Usage+Squad → Sessions+Tasks → Activity → Skills

  const desktopLayout = useMemo(
    function buildDesktopLayout() {
      return {
        showUsage: visibleWidgetSet.has('usage-meter'),
        showSquad: visibleWidgetSet.has('agent-status'),
        showSessions: visibleWidgetSet.has('recent-sessions'),
        showTasks: visibleWidgetSet.has('tasks'),
        showActivity: visibleWidgetSet.has('activity-log'),
        showSkills: visibleWidgetSet.has('skills'),
        showNotifications: visibleWidgetSet.has('notifications'),
      }
    },
    [visibleWidgetSet],
  )

  // ── Mobile deep sections ────────────────────────────────────────────────────
  const mobileDeepSections = useMemo<Array<MobileWidgetSection>>(
    function buildMobileDeepSections() {
      const sections: Array<MobileWidgetSection> = []
      const deepTierOrder = widgetOrder.filter((id) =>
        ['activity', 'agents', 'sessions', 'tasks', 'skills', 'usage'].includes(id),
      )

      for (const widgetId of deepTierOrder) {
        if (widgetId === 'activity') {
          if (!visibleWidgetSet.has('activity-log')) continue
          sections.push({
            id: widgetId,
            label: 'Activity',
            content: (
              <div className="w-full">
                <ActivityLogWidget onRemove={() => removeWidget('activity-log')} />
              </div>
            ),
          })
          continue
        }

        if (widgetId === 'agents') {
          if (!visibleWidgetSet.has('agent-status')) continue
          sections.push({
            id: widgetId,
            label: 'Agents',
            content: (
              <div className="w-full">
                <SquadStatusWidget />
              </div>
            ),
          })
          continue
        }

        if (widgetId === 'sessions') {
          if (!visibleWidgetSet.has('recent-sessions')) continue
          sections.push({
            id: widgetId,
            label: 'Sessions',
            content: (
              <div className="w-full">
                <RecentSessionsWidget
                  onOpenSession={(sessionKey) =>
                    navigate({
                      to: '/chat/$sessionKey',
                      params: { sessionKey },
                    })
                  }
                  onRemove={() => removeWidget('recent-sessions')}
                />
              </div>
            ),
          })
          continue
        }

        if (widgetId === 'tasks') {
          if (!visibleWidgetSet.has('tasks')) continue
          sections.push({
            id: widgetId,
            label: 'Tasks',
            content: (
              <div className="w-full">
                <CollapsibleWidget
                  title="Tasks"
                  summary={`Tasks: ${dashboardData.cron.inProgress} in progress • ${dashboardData.cron.done} done`}
                  defaultOpen
                >
                  <TasksWidget onRemove={() => removeWidget('tasks')} />
                </CollapsibleWidget>
              </div>
            ),
          })
          continue
        }

        if (widgetId === 'skills') {
          if (!visibleWidgetSet.has('skills')) continue
          sections.push({
            id: widgetId,
            label: 'Skills',
            content: (
              <div className="w-full">
                <CollapsibleWidget
                  title="Skills"
                  summary={`Skills: ${dashboardData.skills.enabled} enabled`}
                  defaultOpen={false}
                >
                  <SkillsWidget onRemove={() => removeWidget('skills')} />
                </CollapsibleWidget>
              </div>
            ),
          })
          continue
        }

        if (widgetId === 'usage') {
          if (!visibleWidgetSet.has('usage-meter')) continue
          sections.push({
            id: widgetId,
            label: 'Usage',
            content: (
              <div className="w-full">
                <CollapsibleWidget
                  title="Usage Meter"
                  summary={usageSummaryText}
                  defaultOpen={false}
                  action={
                    usageSummaryIsError ? (
                      <button
                        type="button"
                        onClick={refetch}
                        className="rounded-md border border-red-200 bg-red-50/80 px-1.5 py-0.5 text-[10px] font-medium text-red-700 transition-colors hover:bg-red-100"
                      >
                        Retry
                      </button>
                    ) : null
                  }
                >
                  {usageSummaryIsError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-sm text-red-700">
                      <p className="font-medium">Usage unavailable</p>
                      <button
                        type="button"
                        onClick={refetch}
                        className="mt-2 rounded-md border border-red-200 bg-red-100/80 px-2 py-1 text-xs font-medium transition-colors hover:bg-red-100"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <UsageMeterWidget onRemove={() => removeWidget('usage-meter')} overrideCost={dashboardData.cost.today} overrideTokens={dashboardData.usage.tokens} />
                  )}
                </CollapsibleWidget>
              </div>
            ),
          })
        }
      }

      return sections
    },
    [
      dashboardData.cron.done,
      dashboardData.cron.inProgress,
      dashboardData.skills.enabled,
      navigate,
      refetch,
      removeWidget,
      usageSummaryIsError,
      usageSummaryText,
      visibleWidgetSet,
      widgetOrder,
    ],
  )

  const moveMobileSection = useCallback(
    (fromVisibleIndex: number, toVisibleIndex: number) => {
      const fromSection = mobileDeepSections[fromVisibleIndex]
      const toSection = mobileDeepSections[toVisibleIndex]
      if (!fromSection || !toSection || fromSection.id === toSection.id) return

      const fromOrderIndex = widgetOrder.indexOf(fromSection.id)
      const toOrderIndex = widgetOrder.indexOf(toSection.id)
      if (fromOrderIndex === -1 || toOrderIndex === -1) return

      moveWidget(fromOrderIndex, toOrderIndex)
    },
    [mobileDeepSections, moveWidget, widgetOrder],
  )

  // Pull-to-refresh indicator offset
  const pullIndicatorStyle = isPulling
    ? { transform: `translateY(${Math.min(pullDistance - 8, 48)}px)`, opacity: Math.min(pullDistance / threshold, 1) }
    : undefined

  return (
    <>
      <main
        ref={mainScrollRef as RefObject<HTMLElement>}
        className="h-full overflow-x-hidden overflow-y-auto bg-primary-100/45 px-4 pt-3 pb-24 pb-[calc(env(safe-area-inset-bottom)+6rem)] text-primary-900 md:px-6 md:pt-8 md:pb-8"
      >
        {/* Pull-to-refresh indicator (mobile) */}
        {isMobile && isPulling ? (
          <div
            className="pointer-events-none absolute left-1/2 top-2 z-50 -translate-x-1/2 transition-all duration-150"
            style={pullIndicatorStyle}
            aria-hidden
          >
            <div className="flex items-center gap-1.5 rounded-full border border-primary-200 bg-white/90 px-3 py-1.5 shadow-md backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/90">
              <span
                className={cn(
                  'size-3 rounded-full border-2 border-accent-500',
                  pullDistance >= threshold
                    ? 'border-t-transparent animate-spin'
                    : 'opacity-50',
                )}
              />
              <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                {pullDistance >= threshold ? 'Release to refresh' : 'Pull to refresh'}
              </span>
            </div>
          </div>
        ) : null}

        <section className="mx-auto w-full max-w-[1600px]">
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <header className="relative z-20 mb-3 rounded-xl border border-primary-200 bg-primary-50/95 px-3 py-2 shadow-sm md:mb-5 md:px-5 md:py-3">
            <div className="flex items-center justify-between gap-3">
              {/* Left: Logo + name + status */}
              <div className="flex min-w-0 items-center gap-2.5">
                {isMobile ? (
                  <button
                    type="button"
                    onClick={handleLogoTap}
                    className="shrink-0 cursor-pointer rounded-xl transition-transform active:scale-95"
                    aria-label="Open quick menu"
                  >
                    <OpenClawStudioIcon className="size-8 rounded-xl shadow-sm" />
                    {shouldShowLogoTip ? (
                      <div className="absolute !left-1/2 top-full z-30 mt-2 -translate-x-1/2 animate-in fade-in-0 slide-in-from-top-1 duratrion-300">
                        <div className="relative rounded bg-primary-900 px-2 py-1 text-xs font-medium text-white shadow-md">
                          <span
                            role="button"
                            tabIndex={0}
                            className="whitespace-nowrap cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); markLogoTipSeen(); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') markLogoTipSeen(); }}
                            aria-label="Dismiss quick menu tip"
                          >
                            Tap for quick menu
                          </span>
                          <div className="absolute left-1/2 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-primary-900 shadow-md" />
                        </div>
                      </div>
                    ) : null}
                  </button>
                ) : (
                  <OpenClawStudioIcon className="size-8 shrink-0 rounded-xl shadow-sm" />
                )}
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="text-sm font-semibold text-ink text-balance md:text-base truncate">
                    ClawSuite
                  </h1>
                  {isMobile ? (
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        dashboardData.connection.connected
                          ? 'bg-emerald-500'
                          : 'bg-red-500',
                      )}
                      title={dashboardData.connection.connected ? 'Connected' : 'Disconnected'}
                    />
                  ) : (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                        dashboardData.connection.connected
                          ? 'border-emerald-200 bg-emerald-100/70 text-emerald-700'
                          : 'border-red-200 bg-red-100/80 text-red-700',
                      )}
                    >
                      <span
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          dashboardData.connection.connected
                            ? 'bg-emerald-500'
                            : 'bg-red-500',
                        )}
                      />
                      {dashboardData.connection.connected ? 'Connected' : 'Disconnected'}
                    </span>
                  )}
                </div>
              </div>

              {/* Right controls */}
              <div className="ml-auto flex items-center gap-2">
                {!isMobile && <HeaderAmbientStatus />}
                {!isMobile && <ThemeToggle />}
                {!isMobile && (
                  <div className="flex items-center gap-1 rounded-full border border-primary-200 bg-primary-100/65 p-1">
                    <NotificationsPopover />
                    <button
                      type="button"
                      onClick={() => setDashSettingsOpen(true)}
                      className="inline-flex size-7 items-center justify-center rounded-full text-primary-600 dark:text-primary-400 transition-colors hover:bg-primary-50 dark:hover:bg-gray-800 hover:text-accent-600 dark:hover:text-accent-400"
                      aria-label="Settings"
                      title="Settings"
                    >
                      <HugeiconsIcon
                        icon={Settings01Icon}
                        size={20}
                        strokeWidth={1.5}
                      />
                    </button>
                  </div>
                )}
                {isMobile && (
                  <>
                    {mobileEditMode ? (
                      <>
                        <AddWidgetPopover
                          visibleIds={visibleIds}
                          onAdd={addWidget}
                          compact
                          buttonClassName="size-8 !px-0 !py-0 justify-center rounded-full border border-primary-200 bg-primary-100/80 text-primary-500 shadow-sm"
                        />
                        <button
                          type="button"
                          onClick={handleResetLayout}
                          className="inline-flex size-8 items-center justify-center rounded-full border border-primary-200 bg-primary-100/80 text-primary-500 shadow-sm transition-colors hover:text-primary-700 active:scale-95"
                          aria-label="Reset Layout"
                          title="Reset Layout"
                        >
                          <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.5} />
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setMobileEditMode((p) => !p)}
                      className={cn(
                        'inline-flex size-8 items-center justify-center rounded-full border shadow-sm transition-colors active:scale-95',
                        mobileEditMode
                          ? 'border-accent-300 bg-accent-50 text-accent-600'
                          : 'border-primary-200 bg-primary-100/80 text-primary-500 hover:text-primary-700',
                      )}
                      aria-label={mobileEditMode ? 'Done editing' : 'Edit layout'}
                      title={mobileEditMode ? 'Done editing' : 'Edit layout'}
                    >
                      <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={1.6} />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSettings({ theme: nextTheme })}
                      className="inline-flex size-8 items-center justify-center rounded-full border border-primary-200 bg-primary-100/80 text-primary-600 shadow-sm transition-colors hover:bg-primary-50 active:scale-95"
                      aria-label={`Switch theme to ${nextTheme}`}
                      title={`Theme: ${theme} (tap for ${nextTheme})`}
                    >
                      <HugeiconsIcon
                        icon={mobileThemeIcon}
                        size={16}
                        strokeWidth={1.6}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashSettingsOpen(true)}
                      className="inline-flex size-8 items-center justify-center rounded-full border border-primary-200 bg-primary-100/80 text-primary-600 shadow-sm transition-colors hover:bg-primary-50 active:scale-95"
                      aria-label="Dashboard settings"
                      title="Settings"
                    >
                      <HugeiconsIcon
                        icon={Settings01Icon}
                        size={16}
                        strokeWidth={1.5}
                      />
                    </button>
                  </>
                )}
              </div>
            </div>
          </header>

          {dashboardData.status === 'error' ? (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50/85 px-3 py-2 text-sm text-red-800 shadow-sm md:mb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Dashboard data failed to load</p>
                  <p className="text-xs text-red-700/90">
                    One or more dashboard queries failed. Retry to refresh data.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={refetch}
                  className="shrink-0 rounded-md border border-red-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-white"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : null}

          {/* ── Mobile layout ───────────────────────────────────────────────── */}
          {isMobile ? (
            <div className="flex flex-col gap-3">
              {/* Mobile hero: SystemGlance compact — single source of truth for Sessions/Agents/Cost/Uptime */}
              <SystemGlance
                sessions={dashboardData.sessions.total}
                activeAgents={dashboardData.agents.active || dashboardData.agents.total}
                costToday={costTodayDisplay}
                uptimeFormatted={uptimeDisplay}
                updatedAgo={formatRelativeTime(dashboardData.updatedAt)}
                healthStatus={healthStatus}
                gatewayConnected={dashboardData.connection.connected}
                sessionPercent={dashboardData.usage.contextPercent ?? undefined}
                currentModel={dashboardData.model.current}
                compact
              />

              {/* Alert signal chips — only one top-of-page clutter element */}
              {visibleAlerts.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {visibleAlerts.map((chip) => (
                    <span
                      key={chip.id}
                      className={cn(
                        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
                        chip.severity === 'red'
                          ? 'border-red-200 bg-red-100/75 text-red-700'
                          : 'border-amber-200 bg-amber-100/75 text-amber-700',
                      )}
                    >
                      {chip.text}
                    </span>
                  ))}
                </div>
              ) : null}

              {/* MetricCards intentionally omitted on mobile — SystemGlance above is the canonical hero */}

              {/* Deep sections (reorderable) */}
              <div className="space-y-1.5">
                {mobileDeepSections.map((section, visibleIndex) => {
                  const canMoveUp = visibleIndex > 0
                  const canMoveDown = visibleIndex < mobileDeepSections.length - 1

                  return (
                    <div key={section.id} className="relative w-full rounded-xl">
                      {mobileEditMode ? (
                        <div className="absolute right-1 top-1 z-10 flex gap-0.5 rounded-full border border-primary-200/80 bg-primary-50/90 p-0.5 shadow-sm">
                          {canMoveUp ? (
                            <button
                              type="button"
                              onClick={() => moveMobileSection(visibleIndex, visibleIndex - 1)}
                              className="inline-flex size-5 items-center justify-center rounded-full text-primary-400 transition-colors hover:text-primary-600"
                              aria-label={`Move ${section.label} up`}
                            >
                              <HugeiconsIcon icon={ArrowUp02Icon} size={12} strokeWidth={1.8} />
                            </button>
                          ) : null}
                          {canMoveDown ? (
                            <button
                              type="button"
                              onClick={() => moveMobileSection(visibleIndex, visibleIndex + 1)}
                              className="inline-flex size-5 items-center justify-center rounded-full text-primary-400 transition-colors hover:text-primary-600"
                              aria-label={`Move ${section.label} down`}
                            >
                              <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={1.8} />
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {section.content}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* ── Desktop enterprise layout (C2) ─────────────────────────────── */
            <div className="flex flex-col gap-4">
              {/* 1. SystemGlance */}
              <SystemGlance
                sessions={dashboardData.sessions.total}
                activeAgents={dashboardData.agents.active || dashboardData.agents.total}
                costToday={costTodayDisplay}
                uptimeFormatted={uptimeDisplay}
                updatedAgo={formatRelativeTime(dashboardData.updatedAt)}
                healthStatus={healthStatus}
                gatewayConnected={dashboardData.connection.connected}
                sessionPercent={dashboardData.usage.contextPercent ?? undefined}
                providers={dashboardData.cost.byProvider}
                currentModel={dashboardData.model.current}
              />

              {/* 2. Alert chips */}
              {visibleAlerts.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {visibleAlerts.map((chip) => (
                    <span
                      key={chip.id}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                        chip.severity === 'red'
                          ? 'border-red-200 bg-red-100/75 text-red-700'
                          : 'border-amber-200 bg-amber-100/75 text-amber-700',
                      )}
                    >
                      {chip.text}
                      {chip.dismissable && (
                        <button
                          type="button"
                          onClick={() => {
                            setDismissedChips((prev) => {
                              const next = new Set(prev)
                              next.add(chip.id)
                              try { window.localStorage.setItem('clawsuite-dismissed-chips', JSON.stringify([...next])) } catch {}
                              return next
                            })
                          }}
                          className={cn(
                            'ml-0.5 rounded-full p-0.5 transition-colors hover:bg-black/10',
                            chip.severity === 'red' ? 'text-red-500 hover:text-red-800' : 'text-amber-500 hover:text-amber-800',
                          )}
                          aria-label={`Dismiss ${chip.text}`}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              ) : null}

              {/* 3. Metric cards row — Sessions · Active Agents · Cost Today · Uptime */}
              {/* These complement SystemGlance: they add micro charts, trend pills & time-range selectors */}
              <WidgetGrid items={metricItems} className="gap-4" />

              {/* D1: Widget edit controls — inline row above widgets */}
              <div className="flex items-center justify-end gap-2">
                <AddWidgetPopover visibleIds={visibleIds} onAdd={addWidget} />
                <button
                  type="button"
                  onClick={handleResetLayout}
                  className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] text-primary-600 transition-colors hover:border-accent-200 hover:text-accent-600 dark:border-gray-700 dark:bg-gray-800 dark:text-primary-400 dark:hover:border-accent-600 dark:hover:text-accent-400"
                  aria-label="Reset Layout"
                  title="Reset Layout"
                >
                  <HugeiconsIcon icon={RefreshIcon} size={20} strokeWidth={1.5} />
                  <span>Reset</span>
                </button>
              </div>

              {/* 3. Two-up: Usage Today + Squad Status */}
              {(desktopLayout.showUsage || desktopLayout.showSquad) && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {desktopLayout.showUsage && (
                    <UsageMeterWidget onRemove={() => removeWidget('usage-meter')} overrideCost={dashboardData.cost.today} overrideTokens={dashboardData.usage.tokens} />
                  )}
                  {desktopLayout.showSquad && (
                    <SquadStatusWidget />
                  )}
                </div>
              )}

              {/* 4. Two-up: Recent Sessions + Tasks */}
              {(desktopLayout.showSessions || desktopLayout.showTasks) && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {desktopLayout.showSessions && (
                    <RecentSessionsWidget
                      onOpenSession={(sessionKey) =>
                        navigate({
                          to: '/chat/$sessionKey',
                          params: { sessionKey },
                        })
                      }
                      onRemove={() => removeWidget('recent-sessions')}
                    />
                  )}
                  {desktopLayout.showTasks && (
                    <TasksWidget onRemove={() => removeWidget('tasks')} />
                  )}
                </div>
              )}

              {/* 5. Full-width: Activity Log */}
              {desktopLayout.showActivity && (
                <ActivityLogWidget onRemove={() => removeWidget('activity-log')} />
              )}

              {/* 6. Skills + Notifications */}
              {(desktopLayout.showSkills || desktopLayout.showNotifications) && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {desktopLayout.showSkills && (
                    <SkillsWidget onRemove={() => removeWidget('skills')} />
                  )}
                  {desktopLayout.showNotifications && (
                    <NotificationsWidget onRemove={() => removeWidget('notifications')} />
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <SettingsDialog
        open={dashSettingsOpen}
        onOpenChange={setDashSettingsOpen}
      />
      <DashboardOverflowPanel
        open={overflowOpen}
        onClose={() => setOverflowOpen(false)}
      />
    </>
  )
}
