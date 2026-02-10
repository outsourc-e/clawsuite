import {
  Add01Icon,
  AiBookIcon,
  ComputerTerminal02Icon,
  DashboardSquare01Icon,
  RefreshIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout/legacy'
import type { Layout } from 'react-grid-layout'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { AgentStatusWidget } from './components/agent-status-widget'
import { ActivityLogWidget } from './components/activity-log-widget'
import { CostTrackerWidget } from './components/cost-tracker-widget'
import { NotificationsWidget } from './components/notifications-widget'
import { QuickActionsWidget } from './components/quick-actions-widget'
import { RecentSessionsWidget } from './components/recent-sessions-widget'
import { SystemStatusWidget } from './components/system-status-widget'
import { TasksWidget } from './components/tasks-widget'
import { TimeDateWidget } from './components/time-date-widget'
import { UsageMeterWidget } from './components/usage-meter-widget'
import { WeatherWidget } from './components/weather-widget'
import type {
  QuickAction,
  RecentSession,
  SystemStatus,
} from './components/dashboard-types'
import { Button } from '@/components/ui/button'
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

/* ── Layout persistence ── */
const LAYOUT_STORAGE_KEY = 'openclaw-dashboard-layout'

const DEFAULT_LAYOUT: Layout[] = [
  // Row 1: Weather(3) | Quick Actions(6) | Time(3)
  { i: 'weather', x: 0, y: 0, w: 3, h: 3 },
  { i: 'quick-actions', x: 3, y: 0, w: 6, h: 3 },
  { i: 'time-date', x: 9, y: 0, w: 3, h: 3 },
  // Row 2: Usage(6) | Tasks(6)
  { i: 'usage-meter', x: 0, y: 3, w: 6, h: 5 },
  { i: 'tasks', x: 6, y: 3, w: 6, h: 5 },
  // Row 3: Agents(6) | Cost(6)
  { i: 'agent-status', x: 0, y: 8, w: 6, h: 5 },
  { i: 'cost-tracker', x: 6, y: 8, w: 6, h: 5 },
  // Row 4: Sessions(8) | System(4)
  { i: 'recent-sessions', x: 0, y: 13, w: 8, h: 5 },
  { i: 'system-status', x: 8, y: 13, w: 4, h: 5 },
  // Row 5: Notifications(8) | Activity(4)
  { i: 'notifications', x: 0, y: 18, w: 8, h: 4 },
  { i: 'activity-log', x: 8, y: 18, w: 4, h: 4 },
]

function loadLayout(): Layout[] {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Layout[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return DEFAULT_LAYOUT
}

function saveLayout(layout: Layout[]) {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
}

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
  const [gridLayout, setGridLayout] = useState<Layout[]>(loadLayout)
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

  const handleLayoutChange = useCallback((layout: Layout[]) => {
    setGridLayout(layout)
    saveLayout(layout)
  }, [])

  const handleResetLayout = useCallback(() => {
    setGridLayout(DEFAULT_LAYOUT)
    localStorage.removeItem(LAYOUT_STORAGE_KEY)
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
        <header className="mb-6 rounded-2xl border border-primary-200 bg-primary-50/85 p-4 backdrop-blur-xl md:mb-7 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-100/60 px-3 py-1 text-xs text-primary-600 tabular-nums">
              <HugeiconsIcon icon={DashboardSquare01Icon} size={20} strokeWidth={1.5} />
              <span>Studio Overview</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetLayout}
                aria-label="Reset Layout"
              >
                <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.5} />
                Reset Layout
              </Button>
              <Button
                size="sm"
                disabled
                title="Widget picker coming soon"
                aria-label="Add Widget — coming soon"
              >
                <HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={1.5} />
                <span>Add Widget</span>
              </Button>
            </div>
          </div>
          <h1 className="mt-3 text-2xl font-medium text-ink text-balance md:text-3xl">
            OpenClaw Dashboard
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-primary-600 text-pretty md:text-base">
            Design, orchestrate, and monitor AI agent systems from a single command center.
          </p>
        </header>

        <div ref={containerRef}>
          <ResponsiveGridLayout
            className="layout"
            layouts={{ lg: gridLayout }}
            breakpoints={{ lg: 1080, md: 768, sm: 480, xs: 0 }}
            cols={{ lg: 12, md: 8, sm: 4, xs: 4 }}
            rowHeight={70}
            width={containerWidth}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".widget-drag-handle"
            isResizable={false}
            isDraggable
            compactType="vertical"
            margin={[10, 10]}
          >
            <div key="weather" className="h-full">
              <WeatherWidget draggable />
            </div>
            <div key="quick-actions" className="h-full">
              <QuickActionsWidget actions={quickActions} onNavigate={(to) => navigate({ to })} draggable />
            </div>
            <div key="time-date" className="h-full">
              <TimeDateWidget draggable />
            </div>
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
    </main>
  )
}
