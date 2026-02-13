import { RefreshIcon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { HeroMetricsRow } from './components/hero-metrics-row'
import { NotificationsWidget } from './components/notifications-widget'
import { RecentSessionsWidget } from './components/recent-sessions-widget'
import { SkillsWidget } from './components/skills-widget'
// SystemInfoWidget removed — not useful enough for dashboard real estate
import { TasksWidget } from './components/tasks-widget'
import { UsageMeterWidget } from './components/usage-meter-widget'
import { AddWidgetPopover } from './components/add-widget-popover'
import { ActivityTicker } from '@/components/activity-ticker'
import { HeaderAmbientStatus } from './components/header-ambient-status'
import { NotificationsPopover } from './components/notifications-popover'
import { useVisibleWidgets } from './hooks/use-visible-widgets'
import type { ResponsiveLayouts } from 'react-grid-layout'
import { OpenClawStudioIcon } from '@/components/icons/clawsuite'
import { ThemeToggle } from '@/components/theme-toggle'
import { SettingsDialog } from '@/components/settings-dialog'
import {
  chatQueryKeys,
  fetchGatewayStatus,
  fetchSessions,
} from '@/screens/chat/chat-queries'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

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
  const { visibleIds, addWidget, removeWidget, resetVisible } =
    useVisibleWidgets()
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(1200)

  useEffect(() => {
    if (!containerRef.current) return
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
  }, [resetVisible])

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

  const _handleRefreshAll = useCallback(
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
          connected: gatewayStatusQuery.data?.ok ?? false,
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

  return (
    <>
    <main className="h-full overflow-y-auto bg-primary-100/45 px-4 py-6 text-primary-900 md:px-6 md:py-8">
      <section className="mx-auto w-full max-w-[1600px]">
        <header className="relative z-20 mb-4 rounded-xl border border-primary-200 bg-primary-50/95 px-4 py-3 shadow-sm md:mb-5 md:px-5">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo + name + status */}
            <div className="flex items-center gap-3">
              <OpenClawStudioIcon className="size-8 shrink-0 rounded-xl shadow-sm" />
              <div className="flex items-center gap-2.5">
                <h1 className="text-base font-semibold text-ink text-balance">ClawSuite</h1>
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
                      systemStatus.gateway.connected ? 'bg-emerald-500' : 'bg-red-500',
                    )}
                  />
                  {systemStatus.gateway.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            {/* Right: Clock → Theme → Bell → Gear */}
            <div className="ml-auto flex items-center gap-3">
              <HeaderAmbientStatus />
              <ThemeToggle />
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
            </div>
          </div>
        </header>

        {/* Activity ticker — real-time event stream */}
        <ActivityTicker />

        <HeroMetricsRow
          totalSessions={systemStatus.totalSessions}
          activeAgents={systemStatus.activeAgents}
          uptimeSeconds={systemStatus.uptimeSeconds}
          totalSpend={heroCostQuery.data ?? '—'}
          costError={heroCostQuery.isError}
          onRetryCost={() => heroCostQuery.refetch()}
        />

        {/* Inline widget controls — belongs with the grid, not the header */}
        <div className="mb-4 flex items-center justify-end gap-2">
          <AddWidgetPopover visibleIds={visibleIds} onAdd={addWidget} />
          <button
            type="button"
            onClick={handleResetLayout}
            className="inline-flex items-center gap-1 rounded-lg border border-primary-200 dark:border-gray-700 bg-primary-50 dark:bg-gray-800 px-2.5 py-1 text-[11px] text-primary-600 dark:text-primary-400 transition-colors hover:border-accent-200 dark:hover:border-accent-600 hover:text-accent-600 dark:hover:text-accent-400"
            aria-label="Reset Layout"
            title="Reset Layout"
          >
            <HugeiconsIcon icon={RefreshIcon} size={20} strokeWidth={1.5} />
            <span>Reset</span>
          </button>
        </div>

        <div ref={containerRef}>
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
                <SkillsWidget draggable onRemove={() => removeWidget('skills')} />
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
                <TasksWidget draggable onRemove={() => removeWidget('tasks')} />
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
        </div>
      </section>
    </main>

    <SettingsDialog open={dashSettingsOpen} onOpenChange={setDashSettingsOpen} />
    </>
  )
}
