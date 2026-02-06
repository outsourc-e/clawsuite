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
import { CostTrackerWidget } from './components/cost-tracker-widget'
import { QuickActionsWidget } from './components/quick-actions-widget'
import { RecentSessionsWidget } from './components/recent-sessions-widget'
import { SystemStatusWidget } from './components/system-status-widget'
import type {
  CostDay,
  QuickAction,
  RecentSession,
  SystemStatus,
} from './components/dashboard-types'
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

const mockSystemStatus: SystemStatus = {
  gateway: {
    connected: true,
    checkedAtIso: '2026-02-06T09:00:00.000Z',
  },
  uptimeSeconds: 122640,
  currentModel: 'gpt-5-codex',
  sessionCount: 14,
}

const mockCostDays: Array<CostDay> = [
  { dateIso: '2026-01-31', amountUsd: 3.42 },
  { dateIso: '2026-02-01', amountUsd: 4.1 },
  { dateIso: '2026-02-02', amountUsd: 2.84 },
  { dateIso: '2026-02-03', amountUsd: 5.22 },
  { dateIso: '2026-02-04', amountUsd: 4.88 },
  { dateIso: '2026-02-05', amountUsd: 3.67 },
  { dateIso: '2026-02-06', amountUsd: 4.53 },
]

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
    return {
      ...mockSystemStatus,
      gateway: {
        connected: gatewayStatusQuery.data?.ok ?? mockSystemStatus.gateway.connected,
        checkedAtIso: nowIso,
      },
      sessionCount: sessionsQuery.data?.length ?? mockSystemStatus.sessionCount,
    }
  }, [gatewayStatusQuery.data?.ok, sessionsQuery.data?.length])

  return (
    <motion.main
      className="min-h-screen bg-surface px-4 py-6 text-primary-900 md:px-6 md:py-8"
      variants={containerMotion}
      initial="hidden"
      animate="visible"
    >
      <section className="mx-auto w-full max-w-[1600px]">
        <header className="mb-6 rounded-2xl border border-primary-200 bg-primary-50/85 p-4 backdrop-blur-xl md:mb-7 md:p-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-100/60 px-3 py-1 text-xs text-primary-600 tabular-nums">
            <HugeiconsIcon icon={DashboardSquare01Icon} size={20} strokeWidth={1.5} />
            <span>Workspace Overview</span>
          </div>
          <h1 className="mt-3 text-2xl font-medium text-ink text-balance md:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-primary-600 text-pretty md:text-base">
            Monitor gateway health, jump into core tools, continue recent chats,
            and track weekly usage cost from one place.
          </p>
        </header>

        <motion.section
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          variants={containerMotion}
        >
          <motion.div variants={cardMotion} className="md:col-span-2 xl:col-span-1">
            <QuickActionsWidget
              actions={quickActions}
              onNavigate={function onNavigate(to) {
                navigate({ to })
              }}
            />
          </motion.div>

          <motion.div variants={cardMotion}>
            <SystemStatusWidget status={systemStatus} />
          </motion.div>

          <motion.div variants={cardMotion} className="md:col-span-2 xl:col-span-2">
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

          <motion.div variants={cardMotion} className="md:col-span-2 xl:col-span-3 2xl:col-span-1">
            <CostTrackerWidget days={mockCostDays} />
          </motion.div>
        </motion.section>
      </section>
    </motion.main>
  )
}
