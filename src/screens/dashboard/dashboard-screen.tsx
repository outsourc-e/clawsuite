import {
  RefreshIcon,
  Settings01Icon,
  ArrowDown01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { OpenClawStudioIcon } from '@/components/icons/openclaw-studio'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout/legacy'
import type { ResponsiveLayouts } from 'react-grid-layout'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import {
  GRID_BREAKPOINTS,
  GRID_COLS,
  GRID_ROW_HEIGHT,
  GRID_MARGIN,
  loadLayouts,
  saveLayouts,
  resetLayouts,
} from './constants/grid-config'
import { AgentStatusWidget } from './components/agent-status-widget'
import { ActivityLogWidget } from './components/activity-log-widget'
import { CostTrackerWidget } from './components/cost-tracker-widget'
import { HeroMetricsRow } from './components/hero-metrics-row'
import { NotificationsWidget } from './components/notifications-widget'
import { RecentSessionsWidget } from './components/recent-sessions-widget'
import { TasksWidget } from './components/tasks-widget'
import { UsageMeterWidget } from './components/usage-meter-widget'
import type {
  RecentSession,
} from './components/dashboard-types'
import { ThemeToggle } from '@/components/theme-toggle'
import { AddWidgetPopover } from './components/add-widget-popover'
import { HeaderAmbientStatus } from './components/header-ambient-status'
import { NotificationsPopover } from './components/notifications-popover'
import { SettingsDialog } from './components/settings-dialog'
import { useVisibleWidgets } from './hooks/use-visible-widgets'
import type { SessionMeta } from '@/screens/chat/types'
import { getMessageTimestamp, textFromMessage } from '@/screens/chat/utils'
import { chatQueryKeys, fetchGatewayStatus, fetchSessions } from '@/screens/chat/chat-queries'

type SessionStatusPayload = {
  ok?: boolean
  payload?: {
    sessions?: {
      defaults?: { model?: string; contextTokens?: number }
      count?: number
      recent?: Array<{ age?: number; model?: string; percentUsed?: number }>
    }
  }
}

async function fetchSessionStatus(): Promise<SessionStatusPayload> {
  const response = await fetch('/api/session-status')
  if (!response.ok) return {}
  return response.json() as Promise<SessionStatusPayload>
}

async function fetchHeroCost(): Promise<string> {
  try {
    const response = await fetch('/api/cost')
    if (!response.ok) return '—'
    const data = (await response.json()) as Record<string, unknown>
    const cost = data?.cost as Record<string, unknown> | undefined
    const total = cost?.total as Record<string, unknown> | undefined
    const amount = total?.amount
    if (typeof amount === 'number') return `$${amount.toFixed(2)}`
    if (typeof amount === 'string') return `$${amount}`
    return '—'
  } catch {
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

// Quick Actions removed — navigation lives in the WorkspaceShell sidebar.
// Dashboard provides "Workspace →" to cross-link.

// Removed mockSystemStatus - now built entirely from real API data

const fallbackRecentSessions: Array<RecentSession> = [
  {
    friendlyId: 'main',
    title: 'Main Session',
    preview: 'Studio is ready. Open a chat to get started.',
    updatedAt: Date.now() - 4 * 60 * 1000,
  },
  {
    friendlyId: 'new',
    title: 'New Session',
    preview: 'Create a new thread to start experimenting with fresh context.',
    updatedAt: Date.now() - 15 * 60 * 1000,
  },
]

function cleanTitle(raw: string): string {
  if (!raw) return ''
  // Strip system prompt leaks
  if (/^a new session was started/i.test(raw)) return ''
  // Strip bracketed timestamps
  let cleaned = raw.replace(/^\[.*?\]\s*/, '')
  // Strip message_id references
  cleaned = cleaned.replace(/\[?message_id:\s*\S+\]?/gi, '').trim()
  return cleaned
}

function toSessionTitle(session: SessionMeta): string {
  const label = cleanTitle(session.label ?? '')
  if (label) return label
  const title = cleanTitle(session.title ?? '')
  if (title) return title
  const derived = cleanTitle(session.derivedTitle ?? '')
  if (derived) return derived
  return session.friendlyId === 'main' ? 'Main Session' : `Session ${session.friendlyId}`
}

function toSessionPreview(session: SessionMeta): string {
  if (session.lastMessage) {
    const preview = textFromMessage(session.lastMessage)
    // Don't show raw system prompt text as preview
    if (preview.length > 0 && !/^a new session was started/i.test(preview)) {
      return preview.length > 120 ? `${preview.slice(0, 117)}…` : preview
    }
  }
  // Cron sessions: show "Cron job" instead of generic placeholder
  const title = (session.label ?? session.title ?? '').toLowerCase()
  if (title.startsWith('cron:') || title.includes('cron')) return 'Scheduled task'
  return 'New session'
}

function toSessionUpdatedAt(session: SessionMeta): number {
  if (typeof session.updatedAt === 'number') return session.updatedAt
  if (session.lastMessage) return getMessageTimestamp(session.lastMessage)
  return 0
}

/* ── Mode Selector (Studio / Dashboard) ── */
function ModeSelector({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 rounded-md border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-600 transition-colors hover:border-primary-300 hover:text-ink dark:border-primary-300 dark:bg-transparent dark:hover:text-primary-200"
      >
        Dashboard
        <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={1.5} />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-[9999] mt-1 w-36 rounded-lg border border-primary-200 bg-primary-50 py-1 shadow-lg dark:bg-primary-100">
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs font-medium text-ink"
            onClick={() => setOpen(false)}
          >
            Dashboard
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-primary-600 hover:text-ink"
            onClick={() => {
              setOpen(false)
              navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'main' } })
            }}
          >
            Studio
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function DashboardScreen() {
  const navigate = useNavigate()
  const [gridLayouts, setGridLayouts] = useState<ResponsiveLayouts>(loadLayouts)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { visibleIds, addWidget, removeWidget, resetVisible } = useVisibleWidgets()
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

  const handleLayoutChange = useCallback((_current: unknown, allLayouts: ResponsiveLayouts) => {
    setGridLayouts(allLayouts)
    saveLayouts(allLayouts)
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

  const recentSessions = useMemo(function buildRecentSessions() {
    const sessions = Array.isArray(sessionsQuery.data) ? sessionsQuery.data : []
    if (sessions.length === 0) return fallbackRecentSessions

    return [...sessions]
      .sort(function sortByMostRecent(a, b) {
        return toSessionUpdatedAt(b) - toSessionUpdatedAt(a)
      })
      .slice(0, 5)
      .map(function mapSession(session) {
        return {
          friendlyId: session.friendlyId,
          title: toSessionTitle(session),
          preview: toSessionPreview(session),
          updatedAt: toSessionUpdatedAt(session),
        }
      })
  }, [sessionsQuery.data])

  const systemStatus = useMemo(function buildSystemStatus() {
    const nowIso = new Date().toISOString()
    const sessions = Array.isArray(sessionsQuery.data) ? sessionsQuery.data : []
    const ssPayload = sessionStatusQuery.data?.payload?.sessions
    
    // Get active model from main session, fall back to gateway default
    const mainSessionModel = ssPayload?.recent?.[0]?.model ?? ''
    const rawModel = mainSessionModel || ssPayload?.defaults?.model || ''
    const currentModel = formatModelName(rawModel)
    
    // Derive uptime from main session age (milliseconds → seconds)
    const mainSession = ssPayload?.recent?.[0]
    const uptimeSeconds = mainSession?.age ? Math.floor(mainSession.age / 1000) : 0
    
    // Session count from session-status (canonical) or fallback to sessions list
    const sessionCount = ssPayload?.count ?? sessions.length
    
    return {
      gateway: {
        connected: gatewayStatusQuery.data?.ok ?? false,
        checkedAtIso: nowIso,
      },
      uptimeSeconds,
      currentModel,
      sessionCount,
    }
  }, [gatewayStatusQuery.data?.ok, sessionsQuery.data, sessionStatusQuery.data])

  return (
    <main className="h-full overflow-y-auto bg-surface px-4 py-6 text-primary-900 md:px-6 md:py-8">
      <section className="mx-auto w-full max-w-[1600px]">
        <header className="relative z-20 mb-4 rounded-lg border border-primary-200 bg-primary-50/90 px-4 py-2.5 md:mb-5 md:px-5">
          <div className="flex items-center justify-between gap-4">
            {/* LEFT — Logo + title + mode selector */}
            <div className="flex items-center gap-3">
              <OpenClawStudioIcon className="mt-0.5 size-7 shrink-0 rounded-lg" />
              <div className="flex flex-col leading-tight">
                <h1 className="text-sm font-semibold text-ink">
                  OpenClaw <span className="font-medium text-primary-400">Studio</span>
                </h1>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-primary-400">
                  <span className="inline-flex items-center gap-1">
                    <span className={`size-1.5 shrink-0 rounded-full ${systemStatus.gateway.connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span>{systemStatus.gateway.connected ? 'Connected' : 'Disconnected'}</span>
                  </span>
                  <span className="text-primary-300">·</span>
                  <span className="text-primary-500">{systemStatus.currentModel || '—'}</span>
                </p>
              </div>
              <ModeSelector navigate={navigate} />
            </div>

            {/* RIGHT — time/weather … notifications/theme/settings */}
            <div className="flex items-center gap-4">
              <HeaderAmbientStatus />
              <div className="flex items-center gap-1">
                <NotificationsPopover />
                <ThemeToggle />
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="inline-flex size-7 items-center justify-center rounded-md text-primary-400 transition-colors hover:text-primary-700 dark:hover:text-primary-300"
                  aria-label="Settings"
                  title="Settings"
                >
                  <HugeiconsIcon icon={Settings01Icon} size={15} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </div>
        </header>

        <HeroMetricsRow
          currentModel={systemStatus.currentModel}
          uptimeSeconds={systemStatus.uptimeSeconds}
          sessionCount={systemStatus.sessionCount}
          totalSpend={heroCostQuery.data ?? '—'}
          gatewayConnected={systemStatus.gateway.connected}
        />

        {/* Inline widget controls — belongs with the grid, not the header */}
        <div className="mb-3 flex items-center justify-end gap-2">
          <AddWidgetPopover visibleIds={visibleIds} onAdd={addWidget} />
          <button
            type="button"
            onClick={handleResetLayout}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-primary-400 transition-colors hover:text-primary-700 dark:hover:text-primary-300"
            aria-label="Reset Layout"
            title="Reset Layout"
          >
            <HugeiconsIcon icon={RefreshIcon} size={13} strokeWidth={1.5} />
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
            {visibleIds.includes('usage-meter') ? (
              <div key="usage-meter" className="h-full">
                <UsageMeterWidget draggable onRemove={() => removeWidget('usage-meter')} />
              </div>
            ) : null}
            {visibleIds.includes('tasks') ? (
              <div key="tasks" className="h-full">
                <TasksWidget draggable onRemove={() => removeWidget('tasks')} />
              </div>
            ) : null}
            {visibleIds.includes('agent-status') ? (
              <div key="agent-status" className="h-full">
                <AgentStatusWidget draggable onRemove={() => removeWidget('agent-status')} />
              </div>
            ) : null}
            {visibleIds.includes('cost-tracker') ? (
              <div key="cost-tracker" className="h-full">
                <CostTrackerWidget draggable onRemove={() => removeWidget('cost-tracker')} />
              </div>
            ) : null}
            {visibleIds.includes('recent-sessions') ? (
              <div key="recent-sessions" className="h-full">
                <RecentSessionsWidget
                  sessions={recentSessions}
                  onOpenSession={(sessionKey) => navigate({ to: '/chat/$sessionKey', params: { sessionKey } })}
                  draggable
                  onRemove={() => removeWidget('recent-sessions')}
                />
              </div>
            ) : null}
            {visibleIds.includes('notifications') ? (
              <div key="notifications" className="h-full">
                <NotificationsWidget draggable onRemove={() => removeWidget('notifications')} />
              </div>
            ) : null}
            {visibleIds.includes('activity-log') ? (
              <div key="activity-log" className="h-full">
                <ActivityLogWidget draggable onRemove={() => removeWidget('activity-log')} />
              </div>
            ) : null}
          </ResponsiveGridLayout>
        </div>
      </section>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </main>
  )
}
