import {
  ArrowDown01Icon,
  ArrowUp02Icon,
  Moon02Icon,
  PencilEdit02Icon,
  RefreshIcon,
  Settings01Icon,
  Sun02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  type MouseEvent,
  type ReactNode,
  type TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout/legacy'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import {
  GRID_BREAKPOINTS,
  GRID_COLS,
  GRID_MARGIN,
  GRID_ROW_HEIGHT,
  loadLayouts,
  resetLayouts,
  saveLayouts,
} from './constants/grid-config'
import { AgentStatusWidget } from './components/agent-status-widget'
import { ActivityLogWidget } from './components/activity-log-widget'
import { CollapsibleWidget } from './components/collapsible-widget'
import { HeroMetricsRow } from './components/hero-metrics-row'
import { NowCard } from './components/now-card'
import { NotificationsWidget } from './components/notifications-widget'
import { RecentSessionsWidget } from './components/recent-sessions-widget'
import { SkillsWidget, fetchInstalledSkills } from './components/skills-widget'
// SystemInfoWidget removed — not useful enough for dashboard real estate
import { TasksWidget } from './components/tasks-widget'
import { UsageMeterWidget, fetchUsage } from './components/usage-meter-widget'
import { AddWidgetPopover } from './components/add-widget-popover'
import { ActivityTicker } from '@/components/activity-ticker'
import { HeaderAmbientStatus } from './components/header-ambient-status'
import { NotificationsPopover } from './components/notifications-popover'
import { useVisibleWidgets } from './hooks/use-visible-widgets'
import type { ResponsiveLayouts } from 'react-grid-layout'
import { OpenClawStudioIcon } from '@/components/icons/clawsuite'
import { ThemeToggle } from '@/components/theme-toggle'
import { SettingsDialog } from '@/components/settings-dialog'
import { DashboardOverflowPanel } from '@/components/dashboard-overflow-panel'
import {
  chatQueryKeys,
  fetchGatewayStatus,
  fetchSessions,
} from '@/screens/chat/chat-queries'
import { fetchCronJobs } from '@/lib/cron-api'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { useSettingsStore } from '@/hooks/use-settings'
import {
  type DashboardWidgetOrderId,
  useWidgetReorder,
} from '@/hooks/use-widget-reorder'

type SessionStatusPayload = {
  ok?: boolean
  payload?: {
    model?: string
    currentModel?: string
    modelAlias?: string
    sessions?: {
      defaults?: { model?: string; contextTokens?: number }
      count?: number
      recent?: Array<{ age?: number; model?: string; percentUsed?: number }>
    }
  }
}

type DashboardCostSummaryPayload = {
  ok?: boolean
  cost?: {
    timeseries?: Array<{
      date?: string
      amount?: number | string
    }>
  }
}

type MobileWidgetSection = {
  id: DashboardWidgetOrderId
  label: string
  content: ReactNode
}

const PULL_REFRESH_THRESHOLD = 60
const PULL_REFRESH_MAX_DISTANCE = 96

function readNumeric(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatUpdatedAgo(checkedAtIso: string, nowMs: number): string {
  const timestamp = Date.parse(checkedAtIso)
  if (Number.isNaN(timestamp)) return 'just now'

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - timestamp) / 1000))
  if (elapsedSeconds < 45) return 'just now'
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}m ago`
  if (elapsedSeconds < 86_400) return `${Math.floor(elapsedSeconds / 3600)}h ago`
  return `${Math.floor(elapsedSeconds / 86_400)}d ago`
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatTokenCount(amount: number): string {
  return new Intl.NumberFormat().format(Math.max(0, Math.round(amount)))
}

function toTaskSummaryStatus(
  job: Awaited<ReturnType<typeof fetchCronJobs>>[number],
): 'backlog' | 'in_progress' | 'review' | 'done' {
  if (!job.enabled) return 'backlog'
  const status = job.lastRun?.status
  if (status === 'running' || status === 'queued') return 'in_progress'
  if (status === 'error') return 'review'
  if (status === 'success') return 'done'
  return 'backlog'
}

async function fetchCostTimeseries(): Promise<
  Array<{ date: string; amount: number }>
> {
  const response = await fetch('/api/cost')
  if (!response.ok) throw new Error('Unable to load cost summary')
  const payload = (await response.json()) as DashboardCostSummaryPayload
  if (!payload.ok || !payload.cost) throw new Error('Unable to load cost summary')

  const rows = Array.isArray(payload.cost.timeseries) ? payload.cost.timeseries : []
  return rows
    .map(function mapCostPoint(point) {
      return {
        date: typeof point.date === 'string' ? point.date : '',
        amount: readNumeric(point.amount),
      }
    })
    .filter(function hasDate(point) {
      return point.date.length > 0
    })
}

async function fetchSessionStatus(): Promise<SessionStatusPayload> {
  try {
    const response = await fetch('/api/session-status')
    if (!response.ok) {
      toast('Failed to fetch session status', { type: 'error' })
      return {}
    }
    return response.json() as Promise<SessionStatusPayload>
  } catch (err) {
    toast('Failed to fetch session status', { type: 'error' })
    return {}
  }
}

async function fetchHeroCost(): Promise<string> {
  try {
    const response = await fetch('/api/cost')
    if (!response.ok) {
      toast('Failed to fetch cost data', { type: 'error' })
      return '—'
    }
    const data = (await response.json()) as Record<string, unknown>
    const cost = data.cost as Record<string, unknown> | undefined
    const total = cost?.total as Record<string, unknown> | undefined
    const amount = total?.amount
    if (typeof amount === 'number') return `$${amount.toFixed(2)}`
    if (typeof amount === 'string') return `$${amount}`
    return '—'
  } catch {
    toast('Failed to fetch cost data', { type: 'error' })
    return '—'
  }
}

function formatModelName(raw: string): string {
  if (!raw) return '—'
  // claude-opus-4-6 → Opus 4.6, claude-sonnet-4-5 → Sonnet 4.5, gpt-5.2-codex → GPT-5.2 Codex
  const lower = raw.toLowerCase()
  if (lower.includes('opus')) {
    const match = raw.match(/opus[- ]?(\d+)[- ]?(\d+)/i)
    return match ? `Opus ${match[1]}.${match[2]}` : 'Opus'
  }
  if (lower.includes('sonnet')) {
    const match = raw.match(/sonnet[- ]?(\d+)[- ]?(\d+)/i)
    return match ? `Sonnet ${match[1]}.${match[2]}` : 'Sonnet'
  }
  if (lower.includes('gpt')) return raw.replace('gpt-', 'GPT-')
  if (lower.includes('gemini')) return raw.split('/').pop() ?? raw
  return raw
}

/* Layout config imported from ./constants/grid-config */

// Removed mockSystemStatus - now built entirely from real API data

export function DashboardScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [gridLayouts, setGridLayouts] = useState<ResponsiveLayouts>(loadLayouts)
  const [dashSettingsOpen, setDashSettingsOpen] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const { visibleIds, addWidget, removeWidget, resetVisible } =
    useVisibleWidgets()
  const { order: widgetOrder, moveWidget, resetOrder } = useWidgetReorder()
  const theme = useSettingsStore((state) => state.settings.theme)
  const updateSettings = useSettingsStore((state) => state.updateSettings)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileEditMode, setMobileEditMode] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [showLogoTip, setShowLogoTip] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem('clawsuite-logo-tip-seen') !== 'true'
    } catch {
      return false
    }
  })
  const [pullDistance, setPullDistance] = useState(0)
  const [isPullRefreshing, setIsPullRefreshing] = useState(false)
  const pullStartRef = useRef<{ x: number; y: number } | null>(null)
  const pullHorizontalRef = useRef(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(interval)
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

  useEffect(() => {
    if (!containerRef.current) return
    // Measure immediately on mount to avoid flash at wrong width
    setContainerWidth(containerRef.current.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(e.contentRect.width)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const handleLayoutChange = useCallback(function handleLayoutChange(
    _current: unknown,
    allLayouts: ResponsiveLayouts,
  ) {
    setGridLayouts(function mergeLayoutChanges(previousLayouts) {
      const mergedLayouts = {
        ...previousLayouts,
        ...allLayouts,
      }
      saveLayouts(mergedLayouts)
      return mergedLayouts
    })
  }, [])

  const handleResetLayout = useCallback(() => {
    const fresh = resetLayouts()
    setGridLayouts(fresh)
    resetVisible()
    resetOrder()
    setMobileEditMode(false)
  }, [resetOrder, resetVisible])

  const sessionsQuery = useQuery({
    queryKey: chatQueryKeys.sessions,
    queryFn: fetchSessions,
    refetchInterval: 30_000,
  })

  const gatewayStatusQuery = useQuery({
    queryKey: ['gateway', 'dashboard-status'],
    queryFn: fetchGatewayStatus,
    retry: false,
    refetchInterval: 15_000,
  })

  const sessionStatusQuery = useQuery({
    queryKey: ['gateway', 'session-status'],
    queryFn: fetchSessionStatus,
    retry: false,
    refetchInterval: 30_000,
  })

  const heroCostQuery = useQuery({
    queryKey: ['dashboard', 'hero-cost'],
    queryFn: fetchHeroCost,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const cronJobsQuery = useQuery({
    queryKey: ['cron', 'jobs'],
    queryFn: fetchCronJobs,
    retry: false,
    refetchInterval: 30_000,
  })

  const skillsSummaryQuery = useQuery({
    queryKey: ['dashboard', 'skills'],
    queryFn: fetchInstalledSkills,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const usageSummaryQuery = useQuery({
    queryKey: ['dashboard', 'usage'],
    queryFn: fetchUsage,
    retry: false,
    refetchInterval: 30_000,
  })

  const costTimeseriesQuery = useQuery({
    queryKey: ['dashboard', 'cost-timeseries'],
    queryFn: fetchCostTimeseries,
    retry: false,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const handleRefreshAll = useCallback(
    async function handleRefreshAll() {
      await Promise.allSettled([
        sessionsQuery.refetch(),
        gatewayStatusQuery.refetch(),
        sessionStatusQuery.refetch(),
        heroCostQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.sessions }),
      ])
    },
    [
      gatewayStatusQuery,
      heroCostQuery,
      queryClient,
      sessionStatusQuery,
      sessionsQuery,
    ],
  )

  const systemStatus = useMemo(
    function buildSystemStatus() {
      const nowIso = new Date().toISOString()
      const sessions = Array.isArray(sessionsQuery.data)
        ? sessionsQuery.data
        : []
      const ssPayload = sessionStatusQuery.data?.payload?.sessions

      // Get active model from main session, fall back to gateway default
      const mainSessionModel = ssPayload?.recent?.[0]?.model ?? ''
      const payloadModel = sessionStatusQuery.data?.payload?.model ?? ''
      const payloadCurrentModel =
        sessionStatusQuery.data?.payload?.currentModel ?? ''
      const payloadAlias = sessionStatusQuery.data?.payload?.modelAlias ?? ''
      const rawModel =
        mainSessionModel ||
        payloadModel ||
        payloadCurrentModel ||
        payloadAlias ||
        ssPayload?.defaults?.model ||
        ''
      const currentModel = formatModelName(rawModel)

      // Derive uptime from main session age (milliseconds → seconds)
      const mainSession = ssPayload?.recent?.[0]
      const uptimeSeconds = mainSession?.age
        ? Math.floor(mainSession.age / 1000)
        : 0

      const totalSessions = ssPayload?.count ?? sessions.length
      const activeAgents = ssPayload?.recent?.length ?? sessions.length

      return {
        gateway: {
          connected: gatewayStatusQuery.data?.ok ?? !gatewayStatusQuery.isError,
          checkedAtIso: nowIso,
        },
        uptimeSeconds,
        currentModel,
        totalSessions,
        activeAgents,
      }
    },
    [gatewayStatusQuery.data?.ok, sessionsQuery.data, sessionStatusQuery.data],
  )

  const taskSummary = useMemo(
    function buildTaskSummary() {
      const jobs = Array.isArray(cronJobsQuery.data) ? cronJobsQuery.data : []
      const counts = {
        backlog: 0,
        inProgress: 0,
        done: 0,
      }

      for (const job of jobs) {
        const status = toTaskSummaryStatus(job)
        if (status === 'backlog') counts.backlog += 1
        if (status === 'in_progress') counts.inProgress += 1
        if (status === 'done') counts.done += 1
      }

      return counts
    },
    [cronJobsQuery.data],
  )

  const enabledSkillsCount = useMemo(
    function countEnabledSkills() {
      const skills = Array.isArray(skillsSummaryQuery.data)
        ? skillsSummaryQuery.data
        : []
      return skills.filter((skill) => skill.enabled).length
    },
    [skillsSummaryQuery.data],
  )

  const usageSummary = useMemo(
    function buildUsageSummary() {
      const usage = usageSummaryQuery.data
      if (usageSummaryQuery.isError || usage?.kind === 'error' || usage?.kind === 'unavailable') {
        return {
          state: 'error' as const,
          text: 'Usage unavailable',
          tokensToday: 0,
          todayCost: 0,
        }
      }

      if (!usage || usage.kind !== 'ok') {
        return {
          state: 'loading' as const,
          text: 'Usage: loading…',
          tokensToday: 0,
          todayCost: 0,
        }
      }

      const tokensToday = usage.data.totalUsage
      const todayDateKey = toLocalDateKey(new Date(nowMs))
      const timeseries = Array.isArray(costTimeseriesQuery.data)
        ? costTimeseriesQuery.data
        : []
      const todayPoint =
        timeseries.find((point) => point.date.startsWith(todayDateKey)) ??
        timeseries[timeseries.length - 1]
      const todayCost = todayPoint ? Math.max(0, todayPoint.amount) : 0

      return {
        state: 'ok' as const,
        text: `Usage: ${formatCurrency(todayCost)} today • ${formatTokenCount(tokensToday)} tokens`,
        tokensToday,
        todayCost,
      }
    },
    [costTimeseriesQuery.data, nowMs, usageSummaryQuery.data, usageSummaryQuery.isError],
  )

  const greetingUpdatedText = useMemo(
    function buildGreetingUpdatedText() {
      return formatUpdatedAgo(systemStatus.gateway.checkedAtIso, nowMs)
    },
    [nowMs, systemStatus.gateway.checkedAtIso],
  )

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

  const retryUsageSummary = useCallback(
    function retryUsageSummary(event?: MouseEvent<HTMLButtonElement>) {
      event?.stopPropagation()
      void Promise.allSettled([usageSummaryQuery.refetch(), costTimeseriesQuery.refetch()])
    },
    [costTimeseriesQuery, usageSummaryQuery],
  )

  const visibleWidgetSet = useMemo(() => {
    return new Set(visibleIds)
  }, [visibleIds])

  const mobileSections = useMemo<Array<MobileWidgetSection>>(
    function buildMobileSections() {
      const sections: Array<MobileWidgetSection> = []

      for (const widgetId of widgetOrder) {
        if (widgetId === 'now-card') {
          sections.push({
            id: widgetId,
            label: 'Now',
            content: (
              <NowCard
                gatewayConnected={systemStatus.gateway.connected}
                activeAgents={systemStatus.activeAgents}
                activeTasks={taskSummary.inProgress}
              />
            ),
          })
          continue
        }

        if (widgetId === 'metrics') {
          sections.push({
            id: widgetId,
            label: 'Metrics',
            content: (
              <HeroMetricsRow
                totalSessions={systemStatus.totalSessions}
                activeAgents={systemStatus.activeAgents}
                uptimeSeconds={systemStatus.uptimeSeconds}
                totalSpend={heroCostQuery.data ?? '—'}
                costError={heroCostQuery.isError}
                onRetryCost={() => heroCostQuery.refetch()}
              />
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
                  summary={`Skills: ${enabledSkillsCount} enabled`}
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
                  summary={usageSummary.text}
                  defaultOpen={false}
                  action={
                    usageSummary.state === 'error' ? (
                      <button
                        type="button"
                        onClick={retryUsageSummary}
                        className="rounded-md border border-red-200 bg-red-50/80 px-1.5 py-0.5 text-[10px] font-medium text-red-700 transition-colors hover:bg-red-100"
                      >
                        Retry
                      </button>
                    ) : null
                  }
                >
                  {usageSummary.state === 'error' ? (
                    <div className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-sm text-red-700">
                      <p className="font-medium">Usage unavailable</p>
                      <button
                        type="button"
                        onClick={retryUsageSummary}
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
                  summary={`Tasks: ${taskSummary.backlog} backlog • ${taskSummary.inProgress} in progress • ${taskSummary.done} done`}
                  defaultOpen
                >
                  <TasksWidget onRemove={() => removeWidget('tasks')} />
                </CollapsibleWidget>
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
                <AgentStatusWidget onRemove={() => removeWidget('agent-status')} />
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

        if (widgetId === 'notifications') {
          if (!visibleWidgetSet.has('notifications')) continue
          sections.push({
            id: widgetId,
            label: 'Notifications',
            content: (
              <div className="w-full">
                <NotificationsWidget onRemove={() => removeWidget('notifications')} />
              </div>
            ),
          })
          continue
        }

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
        }
      }

      return sections
    },
    [
      enabledSkillsCount,
      heroCostQuery.data,
      heroCostQuery.isError,
      navigate,
      removeWidget,
      retryUsageSummary,
      systemStatus.activeAgents,
      systemStatus.gateway.connected,
      systemStatus.totalSessions,
      systemStatus.uptimeSeconds,
      taskSummary.backlog,
      taskSummary.done,
      taskSummary.inProgress,
      usageSummary.state,
      usageSummary.text,
      visibleWidgetSet,
      widgetOrder,
      heroCostQuery.refetch,
    ],
  )

  const moveMobileSection = useCallback(
    (fromVisibleIndex: number, toVisibleIndex: number) => {
      const fromSection = mobileSections[fromVisibleIndex]
      const toSection = mobileSections[toVisibleIndex]
      if (!fromSection || !toSection || fromSection.id === toSection.id) return

      const fromOrderIndex = widgetOrder.indexOf(fromSection.id)
      const toOrderIndex = widgetOrder.indexOf(toSection.id)
      if (fromOrderIndex === -1 || toOrderIndex === -1) return

      moveWidget(fromOrderIndex, toOrderIndex)
    },
    [mobileSections, moveWidget, widgetOrder],
  )

  const handlePullTouchStart = useCallback(
    function handlePullTouchStart(event: TouchEvent<HTMLElement>) {
      if (!isMobile || isPullRefreshing || event.touches.length === 0) return
      if (event.currentTarget.scrollTop !== 0) {
        pullStartRef.current = null
        pullHorizontalRef.current = false
        return
      }

      const touch = event.touches[0]
      pullStartRef.current = { x: touch.clientX, y: touch.clientY }
      pullHorizontalRef.current = false
    },
    [isMobile, isPullRefreshing],
  )

  const handlePullTouchMove = useCallback(
    function handlePullTouchMove(event: TouchEvent<HTMLElement>) {
      if (!isMobile || isPullRefreshing || event.touches.length === 0) return
      const start = pullStartRef.current
      if (!start) return

      const touch = event.touches[0]
      const deltaX = touch.clientX - start.x
      const deltaY = touch.clientY - start.y

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        pullHorizontalRef.current = true
      }
      if (pullHorizontalRef.current) {
        setPullDistance(0)
        return
      }
      if (event.currentTarget.scrollTop > 0 || deltaY <= 0) {
        setPullDistance(0)
        return
      }

      const nextDistance = Math.min(
        PULL_REFRESH_MAX_DISTANCE,
        Math.max(0, deltaY * 0.5),
      )
      setPullDistance(nextDistance)
      if (nextDistance > 0) event.preventDefault()
    },
    [isMobile, isPullRefreshing],
  )

  const handlePullTouchEnd = useCallback(
    function handlePullTouchEnd() {
      if (!isMobile) return
      const shouldRefresh =
        !pullHorizontalRef.current && pullDistance > PULL_REFRESH_THRESHOLD

      pullStartRef.current = null
      pullHorizontalRef.current = false
      setPullDistance(0)

      if (!shouldRefresh || isPullRefreshing) return
      setIsPullRefreshing(true)
      void handleRefreshAll().finally(() => setIsPullRefreshing(false))
    },
    [handleRefreshAll, isMobile, isPullRefreshing, pullDistance],
  )

  return (
    <>
      <main
        className="h-full overflow-x-hidden overflow-y-auto bg-primary-100/45 px-3 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] text-primary-900 md:px-6 md:pt-8 md:pb-8"
        onTouchStart={isMobile ? handlePullTouchStart : undefined}
        onTouchMove={isMobile ? handlePullTouchMove : undefined}
        onTouchEnd={isMobile ? handlePullTouchEnd : undefined}
        onTouchCancel={isMobile ? handlePullTouchEnd : undefined}
      >
        {isMobile &&
        (isPullRefreshing || pullDistance > PULL_REFRESH_THRESHOLD) ? (
          <div className="pointer-events-none sticky top-1 z-30 mb-1 flex h-5 items-center justify-center">
            <div
              className={cn(
                'size-4 rounded-full border-2 border-primary-300 border-t-accent-600',
                (isPullRefreshing || pullDistance > PULL_REFRESH_THRESHOLD) &&
                  'animate-spin',
              )}
              style={{
                opacity: isPullRefreshing
                  ? 1
                  : Math.min(pullDistance / PULL_REFRESH_THRESHOLD, 1),
              }}
            />
          </div>
        ) : null}
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
                          <button
                            type="button"
                            className="whitespace-nowrap"
                            onClick={markLogoTipSeen}
                            aria-label="Dismiss quick menu tip"
                          >
                            Tap for quick menu
                          </button>
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
                        systemStatus.gateway.connected
                          ? 'bg-emerald-500'
                          : 'bg-red-500',
                      )}
                      title={systemStatus.gateway.connected ? 'Connected' : 'Disconnected'}
                    />
                  ) : (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                        systemStatus.gateway.connected
                          ? 'border-emerald-200 bg-emerald-100/70 text-emerald-700'
                          : 'border-red-200 bg-red-100/80 text-red-700',
                      )}
                    >
                      <span
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          systemStatus.gateway.connected
                            ? 'bg-emerald-500'
                            : 'bg-red-500',
                        )}
                      />
                      {systemStatus.gateway.connected ? 'Connected' : 'Disconnected'}
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

            {isMobile ? (
              <div className="mt-1.5 border-t border-primary-200/60 pt-1.5">
                <p className="text-[13px] font-medium text-ink">Welcome back</p>
                <p className="text-[11px] text-primary-400 truncate">
                  {systemStatus.currentModel !== '—' ? `${systemStatus.currentModel} • ` : ''}
                  {systemStatus.totalSessions} sessions • {systemStatus.activeAgents}{' '}
                  agents • {greetingUpdatedText}
                </p>
              </div>
            ) : null}
          </header>

          {/* Activity ticker — keep full banner behavior on desktop */}
          <div className="hidden md:block">
            <ActivityTicker />
          </div>

          {!isMobile ? (
            <HeroMetricsRow
              totalSessions={systemStatus.totalSessions}
              activeAgents={systemStatus.activeAgents}
              uptimeSeconds={systemStatus.uptimeSeconds}
              totalSpend={heroCostQuery.data ?? '—'}
              costError={heroCostQuery.isError}
              onRetryCost={() => heroCostQuery.refetch()}
            />
          ) : null}

          {/* Inline widget controls — desktop only (mobile controls are in header) */}
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

          <div ref={containerRef}>
            {isMobile ? (
              <div className="space-y-3">
                {mobileSections.map((section, visibleIndex) => {
                  const canMoveUp = visibleIndex > 0
                  const canMoveDown = visibleIndex < mobileSections.length - 1

                  return (
                    <div key={section.id} className="relative w-full rounded-xl">
                      {mobileEditMode ? (
                      <div className="absolute top-1 right-1 z-10 flex gap-0.5 rounded-full border border-primary-200/80 bg-primary-50/90 p-0.5 shadow-sm">
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
            ) : containerWidth != null && containerWidth > 0 ? (
              <ResponsiveGridLayout
                className="layout"
                layouts={gridLayouts}
                breakpoints={GRID_BREAKPOINTS}
                cols={GRID_COLS}
                rowHeight={GRID_ROW_HEIGHT}
                width={containerWidth}
                onLayoutChange={handleLayoutChange}
                draggableHandle=".widget-drag-handle"
                isResizable={false}
                isDraggable
                compactType="vertical"
                margin={GRID_MARGIN}
              >
                {visibleIds.includes('skills') ? (
                  <div key="skills" className="h-full">
                    <SkillsWidget
                      draggable
                      onRemove={() => removeWidget('skills')}
                    />
                  </div>
                ) : null}
                {visibleIds.includes('usage-meter') ? (
                  <div key="usage-meter" className="h-full">
                    <UsageMeterWidget
                      draggable
                      onRemove={() => removeWidget('usage-meter')}
                    />
                  </div>
                ) : null}
                {visibleIds.includes('tasks') ? (
                  <div key="tasks" className="h-full">
                    <TasksWidget
                      draggable
                      onRemove={() => removeWidget('tasks')}
                    />
                  </div>
                ) : null}
                {visibleIds.includes('agent-status') ? (
                  <div key="agent-status" className="h-full">
                    <AgentStatusWidget
                      draggable
                      onRemove={() => removeWidget('agent-status')}
                    />
                  </div>
                ) : null}
                {visibleIds.includes('recent-sessions') ? (
                  <div key="recent-sessions" className="h-full">
                    <RecentSessionsWidget
                      onOpenSession={(sessionKey) =>
                        navigate({
                          to: '/chat/$sessionKey',
                          params: { sessionKey },
                        })
                      }
                      draggable
                      onRemove={() => removeWidget('recent-sessions')}
                    />
                  </div>
                ) : null}
                {visibleIds.includes('notifications') ? (
                  <div key="notifications" className="h-full">
                    <NotificationsWidget
                      draggable
                      onRemove={() => removeWidget('notifications')}
                    />
                  </div>
                ) : null}
                {visibleIds.includes('activity-log') ? (
                  <div key="activity-log" className="h-full">
                    <ActivityLogWidget
                      draggable
                      onRemove={() => removeWidget('activity-log')}
                    />
                  </div>
                ) : null}
              </ResponsiveGridLayout>
            ) : (
              <div className="flex h-64 items-center justify-center text-primary-400">
                Loading dashboard…
              </div>
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
