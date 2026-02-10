import {
  Add01Icon,
  AiBookIcon,
  ComputerTerminal02Icon,
  RefreshIcon,
  Search01Icon,
  Settings01Icon,
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
import { QuickActionsWidget } from './components/quick-actions-widget'
import { RecentSessionsWidget } from './components/recent-sessions-widget'
import { SystemStatusWidget } from './components/system-status-widget'
import { TasksWidget } from './components/tasks-widget'
import { UsageMeterWidget } from './components/usage-meter-widget'
import type {
  QuickAction,
  RecentSession,
} from './components/dashboard-types'
import { ThemeToggle } from '@/components/theme-toggle'
import { HeaderAmbientStatus } from './components/header-ambient-status'
import { SettingsDialog } from './components/settings-dialog'
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

const quickActions: Array<QuickAction> = [
  {
    id: 'new-chat',
    label: 'New Chat',
    description: 'Start a fresh chat session with context reset.',
    to: '/new',
    icon: Add01Icon,
  },
  {
    id: 'open-terminal',
    label: 'Open Terminal',
    description: 'Jump to the full terminal workspace instantly.',
    to: '/terminal',
    icon: ComputerTerminal02Icon,
  },
  {
    id: 'browse-skills',
    label: 'Browse Skills',
    description: 'Review available skills and usage details.',
    to: '/skills',
    icon: AiBookIcon,
  },
  {
    id: 'view-files',
    label: 'View Files',
    description: 'Open the project file explorer and editor.',
    to: '/files',
    icon: Search01Icon,
  },
]

// Removed mockSystemStatus - now built entirely from real API data

const fallbackRecentSessions: Array<RecentSession> = [
  {
    friendlyId: 'main',
    title: 'Main Session',
    preview: 'Workspace is ready. Open a chat to continue from this dashboard.',
    updatedAt: Date.now() - 4 * 60 * 1000,
  },
  {
    friendlyId: 'new',
    title: 'New Session',
    preview: 'Create a new thread to start experimenting with fresh context.',
    updatedAt: Date.now() - 15 * 60 * 1000,
  },
]

function toSessionTitle(session: SessionMeta): string {
  if (session.label) return session.label
  if (session.title) return session.title
  if (session.derivedTitle) return session.derivedTitle
  return `Session ${session.friendlyId}`
}

function toSessionPreview(session: SessionMeta): string {
  if (session.lastMessage) {
    const preview = textFromMessage(session.lastMessage)
    if (preview.length > 0) return preview
  }
  return 'No messages yet — start a conversation'
}

function toSessionUpdatedAt(session: SessionMeta): number {
  if (typeof session.updatedAt === 'number') return session.updatedAt
  if (session.lastMessage) return getMessageTimestamp(session.lastMessage)
  return 0
}

export function DashboardScreen() {
  const navigate = useNavigate()
  const [gridLayouts, setGridLayouts] = useState<ResponsiveLayouts>(loadLayouts)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
  }, [])

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
    <main className="min-h-screen bg-surface px-4 py-6 text-primary-900 md:px-6 md:py-8">
      <section className="mx-auto w-full max-w-[1600px]">
        <header className="relative z-20 mb-4 rounded-xl border border-primary-200 bg-primary-50/90 px-4 py-3 md:mb-5 md:px-5 md:py-3.5">
          {/* Row 1: Brand left, controls right */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <OpenClawStudioIcon className="size-9 shrink-0 rounded-xl shadow-sm md:size-10" />
              <h1 className="text-lg font-semibold leading-tight text-ink md:text-xl">
              OpenClaw <span className="font-medium text-primary-400">Studio</span>
            </h1>
            </div>
            <div className="flex items-center gap-2">
              <HeaderAmbientStatus />
              <ThemeToggle />
              <button
                type="button"
                onClick={handleResetLayout}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-primary-200 bg-white/70 text-primary-500 transition-colors hover:border-primary-300 hover:bg-white hover:text-primary-700 dark:bg-primary-100/50 dark:hover:bg-primary-200/50"
                aria-label="Reset Layout"
                title="Reset Layout"
              >
                <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                disabled
                className="inline-flex size-8 items-center justify-center rounded-lg border border-primary-200 bg-white/70 text-primary-500 opacity-50 dark:bg-primary-100/50"
                aria-label="Add Widget — coming soon"
                title="Add Widget — coming soon"
              >
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-primary-200 bg-white/70 text-primary-500 transition-colors hover:border-primary-300 hover:bg-white hover:text-primary-700 dark:bg-primary-100/50 dark:hover:bg-primary-200/50"
                aria-label="Settings"
                title="Settings"
              >
                <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.5} />
              </button>
            </div>
          </div>
          {/* Row 2: Quick Actions */}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => navigate({ to: action.to })}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary-200 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-primary-600 transition-colors hover:border-primary-300 hover:text-ink dark:bg-primary-100/40 dark:hover:bg-primary-200/40"
              >
                <HugeiconsIcon icon={action.icon} size={13} strokeWidth={1.5} className="shrink-0" />
                {action.label}
              </button>
            ))}
          </div>
        </header>

        <HeroMetricsRow
          currentModel={systemStatus.currentModel}
          uptimeSeconds={systemStatus.uptimeSeconds}
          sessionCount={systemStatus.sessionCount}
          totalSpend={heroCostQuery.data ?? '—'}
          gatewayConnected={systemStatus.gateway.connected}
        />

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
            <div key="usage-meter" className="h-full">
              <UsageMeterWidget draggable />
            </div>
            <div key="tasks" className="h-full">
              <TasksWidget draggable />
            </div>
            <div key="agent-status" className="h-full">
              <AgentStatusWidget draggable />
            </div>
            <div key="cost-tracker" className="h-full">
              <CostTrackerWidget draggable />
            </div>
            <div key="recent-sessions" className="h-full">
              <RecentSessionsWidget
                sessions={recentSessions}
                onOpenSession={(sessionKey) => navigate({ to: '/chat/$sessionKey', params: { sessionKey } })}
                draggable
              />
            </div>
            <div key="system-status" className="h-full">
              <SystemStatusWidget status={systemStatus} draggable />
            </div>
            <div key="notifications" className="h-full">
              <NotificationsWidget draggable />
            </div>
            <div key="activity-log" className="h-full">
              <ActivityLogWidget draggable />
            </div>
          </ResponsiveGridLayout>
        </div>
      </section>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </main>
  )
}
