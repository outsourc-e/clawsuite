import {
  ArrowDown01Icon,
  ArrowUp02Icon,
  Activity01Icon,
  ChartLineData02Icon,
  Moon02Icon,
  PencilEdit02Icon,
  RefreshIcon,
  Settings01Icon,
  Sun02Icon,
  Timer02Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useNavigate } from '@tanstack/react-router'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { SquadStatusWidget } from './components/squad-status-widget'
import { ActivityLogWidget } from './components/activity-log-widget'
import { CollapsibleWidget } from './components/collapsible-widget'
import { MetricsWidget } from './components/metrics-widget'
import { NowCard } from './components/now-card'
import { NotificationsWidget } from './components/notifications-widget'
import { RecentSessionsWidget } from './components/recent-sessions-widget'
import { SkillsWidget } from './components/skills-widget'
import { TasksWidget } from './components/tasks-widget'
import { UsageMeterWidget } from './components/usage-meter-widget'
import { SystemGlance } from './components/system-glance'
import { AddWidgetPopover } from './components/add-widget-popover'
import { WidgetGrid, type WidgetGridItem } from './components/widget-grid'
import { ActivityTicker } from '@/components/activity-ticker'
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

  // ── Dashboard data (single hook, all queries + computed values) ────────────
  const { data: dashboardData, refetch } = useDashboardData()

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

  // Derived values from dashboard data
  const costDisplay = dashboardData.cost.today > 0
    ? formatMoney(dashboardData.cost.today)
    : dashboardData.status === 'loading' ? '—' : '$0.00'

  const usageSummaryText = buildUsageSummaryText(dashboardData)
  const usageSummaryIsError = dashboardData.usageStatus === 'error' || dashboardData.usageStatus === 'unavailable'

  const visibleAlerts = dashboardData.alerts.filter((c) => !dismissedChips.has(c.id))

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
              value={costDisplay}
              subtitle="Today's spend"
              icon={ChartLineData02Icon}
              accent="emerald"
              isError={dashboardData.status === 'error'}
              onRetry={refetch}
              trendPct={dashboardData.cost.trend ?? undefined}
              trendLabel={dashboardData.cost.trend !== null ? 'vs prev day' : undefined}
              description="Today's estimated spend from gateway cost telemetry."
              rawValue={costDisplay}
            />
          ),
        },
        {
          id: 'metric-uptime',
          size: 'small',
          node: (
            <MetricsWidget
              title="Uptime"
              value={dashboardData.uptime.formatted}
              subtitle="Real session uptime"
              icon={Timer02Icon}
              accent="violet"
              description="Time since the active gateway session started (firstActivity)."
              rawValue={`${dashboardData.uptime.seconds}s`}
            />
          ),
        },
      ]
    },
    [
      costDisplay,
      dashboardData.agents.active,
      dashboardData.agents.total,
      dashboardData.cost.trend,
      dashboardData.sessions.total,
      dashboardData.status,
      dashboardData.uptime.formatted,
      dashboardData.uptime.seconds,
      refetch,
    ],
  )

  const desktopWidgetItems = useMemo<Array<WidgetGridItem>>(
    function buildDesktopWidgetItems() {
      const items: Array<WidgetGridItem> = []

      for (const widgetId of visibleIds) {
        if (widgetId === 'skills') {
          items.push({
            id: widgetId,
            size: 'medium',
            node: <SkillsWidget onRemove={() => removeWidget('skills')} />,
          })
          continue
        }

        if (widgetId === 'usage-meter') {
          items.push({
            id: widgetId,
            size: 'medium',
            node: <UsageMeterWidget onRemove={() => removeWidget('usage-meter')} />,
          })
          continue
        }

        if (widgetId === 'tasks') {
          items.push({
            id: widgetId,
            size: 'medium',
            node: <TasksWidget onRemove={() => removeWidget('tasks')} />,
          })
          continue
        }

        if (widgetId === 'agent-status') {
          items.push({
            id: widgetId,
            size: 'medium',
            node: <SquadStatusWidget />,
          })
          continue
        }

        if (widgetId === 'recent-sessions') {
          items.push({
            id: widgetId,
            size: 'medium',
            node: (
              <RecentSessionsWidget
                onOpenSession={(sessionKey) =>
                  navigate({
                    to: '/chat/$sessionKey',
                    params: { sessionKey },
                  })
                }
                onRemove={() => removeWidget('recent-sessions')}
              />
            ),
          })
          continue
        }

        if (widgetId === 'notifications') {
          items.push({
            id: widgetId,
            size: 'medium',
            node: <NotificationsWidget onRemove={() => removeWidget('notifications')} />,
          })
          continue
        }

        if (widgetId === 'activity-log') {
          items.push({
            id: widgetId,
            size: 'large',
            node: <ActivityLogWidget onRemove={() => removeWidget('activity-log')} />,
          })
        }
      }

      return items
    },
    [navigate, removeWidget, visibleIds],
  )

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
                    <UsageMeterWidget onRemove={() => removeWidget('usage-meter')} />
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

  return (
    <>
      <main
        className="h-full overflow-x-hidden overflow-y-auto bg-primary-100/45 px-4 pt-3 pb-24 pb-[calc(env(safe-area-inset-bottom)+6rem)] text-primary-900 md:px-6 md:pt-8 md:pb-8"
      >
        <section className="mx-auto w-full max-w-[1600px]">
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
                        <div className="relative rounded bg-primary-900 px-2 py-1 text-xs font-medium text-white shadow-md ">
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
                    /* Mobile: simple status dot — tooltip via title */
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

          {/* Activity ticker — keep full banner behavior on desktop */}
          <div className="hidden md:block">
            <ActivityTicker />
          </div>

          {!isMobile && visibleAlerts.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2">
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

          {!isMobile ? (
            <div className="mb-3 md:mb-4">
              <SystemGlance
                sessions={dashboardData.sessions.total}
                activeAgents={dashboardData.agents.active || dashboardData.agents.total}
                costToday={costDisplay}
                uptimeFormatted={dashboardData.uptime.formatted}
                updatedAgo={formatRelativeTime(dashboardData.updatedAt)}
                healthStatus={
                  !dashboardData.connection.connected
                    ? 'offline'
                    : dashboardData.uptime.seconds <= 0
                      ? 'warning'
                      : 'healthy'
                }
                gatewayConnected={dashboardData.connection.connected}
                sessionPercent={dashboardData.usage.contextPercent ?? undefined}
                providers={dashboardData.cost.byProvider}
                currentModel={dashboardData.model.current}
              />
            </div>
          ) : null}

          {/* Inline widget controls — desktop only */}
          {!isMobile && (
            <div className="mb-3 flex items-center justify-end gap-2">
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
          )}

          <div>
            {isMobile ? (
              <div className="flex flex-col gap-3">
                <div className="space-y-1.5">
                  <NowCard
                    gatewayConnected={dashboardData.connection.connected}
                    activeAgents={dashboardData.agents.active || dashboardData.agents.total}
                    activeTasks={dashboardData.cron.inProgress}
                  />
                </div>

                <div className="space-y-1.5">
                  {dashboardData.alerts.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {dashboardData.alerts.map((chip) => (
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
                  <WidgetGrid items={metricItems} className="gap-3" />
                </div>

                <div className="space-y-1.5">
                  {mobileDeepSections.map((section, visibleIndex) => {
                    const canMoveUp = visibleIndex > 0
                    const canMoveDown =
                      visibleIndex < mobileDeepSections.length - 1

                    return (
                      <div key={section.id} className="relative w-full rounded-xl">
                        {mobileEditMode ? (
                          <div className="absolute right-1 top-1 z-10 flex gap-0.5 rounded-full border border-primary-200/80 bg-primary-50/90 p-0.5 shadow-sm">
                            {canMoveUp ? (
                              <button
                                type="button"
                                onClick={() =>
                                  moveMobileSection(visibleIndex, visibleIndex - 1)
                                }
                                className="inline-flex size-5 items-center justify-center rounded-full text-primary-400 transition-colors hover:text-primary-600"
                                aria-label={`Move ${section.label} up`}
                                title={`Move ${section.label} up`}
                              >
                                <HugeiconsIcon
                                  icon={ArrowUp02Icon}
                                  size={12}
                                  strokeWidth={1.8}
                                />
                              </button>
                            ) : null}
                            {canMoveDown ? (
                              <button
                                type="button"
                                onClick={() =>
                                  moveMobileSection(visibleIndex, visibleIndex + 1)
                                }
                                className="inline-flex size-5 items-center justify-center rounded-full text-primary-400 transition-colors hover:text-primary-600"
                                aria-label={`Move ${section.label} down`}
                                title={`Move ${section.label} down`}
                              >
                                <HugeiconsIcon
                                  icon={ArrowDown01Icon}
                                  size={12}
                                  strokeWidth={1.8}
                                />
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
              <WidgetGrid items={desktopWidgetItems} />
            )}
          </div>
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
