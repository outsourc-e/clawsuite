import {
  Add01Icon,
  AiBookIcon,
  ComputerTerminal02Icon,
  DashboardSquare01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { useMemo } from 'react'
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

const containerMotion = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.08,
      staggerChildren: 0.07,
    },
  },
}

const cardMotion = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
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
  return 'No preview available yet.'
}

function toSessionUpdatedAt(session: SessionMeta): number {
  if (typeof session.updatedAt === 'number') return session.updatedAt
  if (session.lastMessage) return getMessageTimestamp(session.lastMessage)
  return 0
}

export function DashboardScreen() {
  const navigate = useNavigate()

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
    
    return {
      gateway: {
        connected: gatewayStatusQuery.data?.ok ?? false,
        checkedAtIso: nowIso,
      },
      uptimeSeconds: 0, // Gateway doesn't expose uptime via current API
      currentModel: 'sonnet', // Could be read from session-status if we fix that endpoint
      sessionCount: sessions.length,
    }
  }, [gatewayStatusQuery.data?.ok, sessionsQuery.data])

  return (
    <motion.main
      className="min-h-screen bg-surface px-4 py-6 text-primary-900 md:px-6 md:py-8"
      variants={containerMotion}
      initial="hidden"
      animate="visible"
    >
      <section className="mx-auto w-full max-w-[1600px]">
        <header className="mb-6 rounded-2xl border border-primary-200 bg-primary-50/85 p-4 backdrop-blur-xl md:mb-7 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-100/60 px-3 py-1 text-xs text-primary-600 tabular-nums">
              <HugeiconsIcon icon={DashboardSquare01Icon} size={20} strokeWidth={1.5} />
              <span>Studio Overview</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                Reset Layout
              </Button>
              <Button size="sm">
                <HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={1.5} />
                <span>+ Add Widget</span>
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

        {/* Row 1: Weather | Quick Actions | Time & Date */}
        <motion.section
          className="grid grid-cols-1 gap-4 md:grid-cols-4"
          variants={containerMotion}
        >
          <motion.div variants={cardMotion}>
            <WeatherWidget />
          </motion.div>

          <motion.div variants={cardMotion} className="md:col-span-2">
            <QuickActionsWidget
              actions={quickActions}
              onNavigate={function onNavigate(to) {
                navigate({ to })
              }}
            />
          </motion.div>

          <motion.div variants={cardMotion}>
            <TimeDateWidget />
          </motion.div>
        </motion.section>

        {/* Row 2: Usage Meter | Tasks (Kanban) */}
        <motion.section
          className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2"
          variants={containerMotion}
        >
          <motion.div variants={cardMotion}>
            <UsageMeterWidget />
          </motion.div>

          <motion.div variants={cardMotion}>
            <TasksWidget />
          </motion.div>
        </motion.section>

        {/* Row 3: Active Agents | Cost Tracker */}
        <motion.section
          className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2"
          variants={containerMotion}
        >
          <motion.div variants={cardMotion}>
            <AgentStatusWidget />
          </motion.div>

          <motion.div variants={cardMotion}>
            <CostTrackerWidget />
          </motion.div>
        </motion.section>

        {/* Row 4: Recent Sessions | System Status */}
        <motion.section
          className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3"
          variants={containerMotion}
        >
          <motion.div variants={cardMotion} className="md:col-span-2">
            <RecentSessionsWidget
              sessions={recentSessions}
              onOpenSession={function onOpenSession(sessionKey) {
                navigate({
                  to: '/chat/$sessionKey',
                  params: { sessionKey },
                })
              }}
            />
          </motion.div>

          <motion.div variants={cardMotion}>
            <SystemStatusWidget status={systemStatus} />
          </motion.div>
        </motion.section>

        {/* Row 5: Notifications | Activity Log */}
        <motion.section
          className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3"
          variants={containerMotion}
        >
          <motion.div variants={cardMotion} className="md:col-span-2">
            <NotificationsWidget />
          </motion.div>

          <motion.div variants={cardMotion}>
            <ActivityLogWidget />
          </motion.div>
        </motion.section>
      </section>
    </motion.main>
  )
}
