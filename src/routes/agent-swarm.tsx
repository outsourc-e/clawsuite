import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { BotIcon, Rocket01Icon } from '@hugeicons/core-free-icons'
import { motion, AnimatePresence } from 'motion/react'
import { usePageTitle } from '@/hooks/use-page-title'
import { useSwarmStore, type SwarmSession } from '@/stores/agent-swarm-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/agent-swarm')({
  component: AgentSwarmRoute,
})

const statusConfig = {
  thinking: { color: 'bg-amber-400', pulse: true, label: 'Thinking' },
  running: { color: 'bg-blue-400', pulse: true, label: 'Running' },
  idle: { color: 'bg-gray-400', pulse: false, label: 'Idle' },
  complete: { color: 'bg-emerald-400', pulse: false, label: 'Complete' },
  failed: { color: 'bg-red-400', pulse: false, label: 'Failed' },
} as const

function formatTokens(n?: number): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatCost(cost?: number): string {
  if (!cost) return '$0.00'
  return `$${cost.toFixed(4)}`
}

function formatAge(staleness: number): string {
  const seconds = Math.floor(staleness / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function SessionCard({ session }: { session: SwarmSession }) {
  const config = statusConfig[session.swarmStatus]
  const tokens = session.usage?.totalTokens ?? session.totalTokens ?? session.tokenCount ?? 0
  const cost = session.usage?.cost ?? session.cost ?? 0
  const name = session.derivedTitle ?? session.title ?? session.label ?? session.key ?? 'Unknown'
  const kind = session.kind ?? 'session'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-primary-200 bg-primary-50/80 p-4 shadow-sm backdrop-blur"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className={cn('size-2.5 rounded-full', config.color, config.pulse && 'animate-pulse')} />
            <span className="text-xs font-medium text-primary-500">{config.label}</span>
            <span className="rounded-full border border-primary-200 bg-primary-100/60 px-2 py-0.5 text-[10px] text-primary-500">
              {kind}
            </span>
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold text-primary-900">{name}</h3>
        </div>
      </div>

      {/* Task */}
      {session.task && (
        <p className="mt-2 line-clamp-2 text-xs text-primary-600">{session.task}</p>
      )}

      {/* Stats */}
      <div className="mt-3 flex items-center gap-4 text-[11px] text-primary-500">
        {session.model && (
          <span className="truncate rounded bg-primary-100/80 px-1.5 py-0.5 font-mono text-[10px]">
            {session.model}
          </span>
        )}
        <span>{formatTokens(tokens)} tokens</span>
        <span>{formatCost(cost)}</span>
        <span className="ml-auto">{formatAge(session.staleness)}</span>
      </div>
    </motion.div>
  )
}

function AgentSwarmRoute() {
  usePageTitle('Agent Swarm')
  const { sessions, isConnected, error, startPolling, stopPolling } = useSwarmStore()

  useEffect(() => {
    startPolling(5000)
    return () => stopPolling()
  }, [startPolling, stopPolling])

  const activeSessions = sessions.filter(s => s.swarmStatus === 'running' || s.swarmStatus === 'thinking')
  const otherSessions = sessions.filter(s => s.swarmStatus !== 'running' && s.swarmStatus !== 'thinking')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22 }}
      className="h-full overflow-auto bg-surface px-3 py-3 sm:px-4 sm:py-4"
    >
      <div className="mx-auto max-w-[1200px]">
        {/* Page Header */}
        <header className="mb-6 rounded-2xl border border-primary-200 bg-primary-50/85 p-4 shadow-sm backdrop-blur-xl sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-100/70 px-3 py-1 text-xs text-primary-600 tabular-nums">
                <HugeiconsIcon icon={BotIcon} size={16} strokeWidth={1.5} />
                <span>Orchestration</span>
              </div>
              <h1 className="mt-2 text-xl font-semibold text-balance text-primary-900 sm:text-2xl">
                Agent Swarm
              </h1>
              <p className="mt-1 text-sm text-pretty text-primary-600">
                Real-time monitoring of all active agent sessions.
              </p>
            </div>

            {/* Connection Status */}
            <div className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
              isConnected
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-red-300 bg-red-50 text-red-700'
            )}>
              <div className={cn(
                'size-2 rounded-full',
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
              )} />
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          {/* Quick Stats */}
          {sessions.length > 0 && (
            <div className="mt-4 flex gap-4 text-xs text-primary-600">
              <span className="font-medium">{sessions.length} total sessions</span>
              <span>{activeSessions.length} active</span>
              <span>
                {formatTokens(sessions.reduce((sum, s) => sum + (s.usage?.totalTokens ?? s.totalTokens ?? 0), 0))} total tokens
              </span>
            </div>
          )}
        </header>

        {/* Session Lists */}
        {sessions.length > 0 ? (
          <div className="space-y-6">
            {/* Active Sessions */}
            {activeSessions.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-primary-800">
                  Active ({activeSessions.length})
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence mode="popLayout">
                    {activeSessions.map(session => (
                      <SessionCard key={session.key ?? session.friendlyId} session={session} />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            )}

            {/* Other Sessions */}
            {otherSessions.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-primary-800">
                  All Sessions ({otherSessions.length})
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence mode="popLayout">
                    {otherSessions.map(session => (
                      <SessionCard key={session.key ?? session.friendlyId} session={session} />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-primary-200 bg-primary-50/60 px-6 py-16 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary-100 text-primary-500">
              <HugeiconsIcon icon={Rocket01Icon} size={32} strokeWidth={1.5} />
            </div>
            <h2 className="mb-2 text-lg font-medium text-primary-900">
              {isConnected ? 'No active sessions' : 'Connecting to gateway...'}
            </h2>
            <p className="mb-6 max-w-md text-sm text-primary-600">
              {isConnected
                ? 'Sessions will appear here when agents are spawned. Start a conversation and let the AI orchestrate sub-agents.'
                : 'Make sure the OpenClaw gateway is running and ClawSuite is connected.'}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  )
}
