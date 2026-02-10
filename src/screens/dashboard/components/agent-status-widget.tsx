import { UserGroupIcon } from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { DashboardGlassCard } from './dashboard-glass-card'
import { cn } from '@/lib/utils'
import type { SessionMeta } from '@/screens/chat/types'

type SessionsApiResponse = {
  sessions?: Array<Record<string, unknown>>
}

type AgentRow = {
  id: string
  name: string
  task: string
  model: string
  status: string
  progress: number
  elapsedSeconds: number
}

type SessionAgentSource = SessionMeta & Record<string, unknown>

type AgentStatusWidgetProps = {
  draggable?: boolean
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function readTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000
  }
  if (typeof value === 'string') {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) {
      return asNumber > 1_000_000_000_000 ? asNumber : asNumber * 1000
    }
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}

function toFriendlyId(key: string): string {
  if (key.length === 0) return 'main'
  const parts = key.split(':')
  const tail = parts[parts.length - 1]
  return tail && tail.trim().length > 0 ? tail.trim() : key
}

function normalizeStatus(value: unknown): string {
  const status = readString(value).toLowerCase()
  if (status.length === 0) return 'running'
  if (status === 'in_progress') return 'running'
  if (status === 'streaming') return 'running'
  return status
}

function deriveProgress(status: string, value: unknown): number {
  const raw = readNumber(value)
  if (raw > 0 && raw <= 1) return Math.round(raw * 100)
  if (raw > 1) return Math.max(2, Math.min(100, Math.round(raw)))

  const defaults: Record<string, number> = {
    queued: 16,
    pending: 22,
    indexing: 44,
    running: 66,
    validating: 82,
    complete: 100,
    completed: 100,
    done: 100,
  }
  return defaults[status] ?? 58
}

function deriveName(session: SessionAgentSource): string {
  return (
    readString(session.label) ||
    readString(session.derivedTitle) ||
    readString(session.title) ||
    `Agent-${session.friendlyId}`
  )
}

function deriveTask(session: SessionAgentSource): string {
  return (
    readString(session.task) ||
    readString(session.initialMessage) ||
    readString(session.title) ||
    readString(session.derivedTitle) ||
    'Active Task'
  )
}

function deriveModel(session: SessionAgentSource): string {
  const lastMessage =
    session.lastMessage && typeof session.lastMessage === 'object'
      ? (session.lastMessage as Record<string, unknown>)
      : {}
  const details =
    lastMessage.details && typeof lastMessage.details === 'object'
      ? (lastMessage.details as Record<string, unknown>)
      : {}

  return (
    readString(session.model) ||
    readString(session.currentModel) ||
    readString(details.model) ||
    readString(details.agentModel) ||
    'unknown'
  )
}

function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  return [hours, minutes, seconds]
    .map(function pad(value) {
      return value.toString().padStart(2, '0')
    })
    .join(':')
}

function compareSessionRecency(a: SessionAgentSource, b: SessionAgentSource): number {
  const aTime =
    readTimestamp(a.updatedAt) || readTimestamp(a.startedAt) || readTimestamp(a.createdAt)
  const bTime =
    readTimestamp(b.updatedAt) || readTimestamp(b.startedAt) || readTimestamp(b.createdAt)
  return bTime - aTime
}

function toAgentRow(session: SessionAgentSource, now: number): AgentRow {
  const status = normalizeStatus(session.status)
  const startedAt =
    readTimestamp(session.startedAt) ||
    readTimestamp(session.createdAt) ||
    readTimestamp(session.updatedAt)
  const elapsedSeconds =
    startedAt > 0 ? Math.floor(Math.max(0, now - startedAt) / 1000) : 0

  return {
    id: readString(session.key) || readString(session.friendlyId) || `agent-${now}`,
    name: deriveName(session),
    task: deriveTask(session),
    model: deriveModel(session),
    status,
    progress: deriveProgress(status, session.progress),
    elapsedSeconds,
  }
}

async function fetchSessions(): Promise<Array<SessionAgentSource>> {
  const response = await fetch('/api/sessions')
  if (!response.ok) return []

  const payload = (await response.json()) as SessionsApiResponse
  const rows = Array.isArray(payload.sessions) ? payload.sessions : []

  return rows.map(function mapSession(row, index) {
    const key = readString(row.key) || `session-${index + 1}`
    const friendlyId = readString(row.friendlyId) || toFriendlyId(key)
    const label = readString(row.label) || undefined
    const title = readString(row.title) || undefined
    const derivedTitle = readString(row.derivedTitle) || undefined
    const updatedAtValue = readTimestamp(row.updatedAt)

    return {
      ...row,
      key,
      friendlyId,
      label,
      title,
      derivedTitle,
      updatedAt: updatedAtValue > 0 ? updatedAtValue : undefined,
    } as SessionAgentSource
  })
}

export function AgentStatusWidget({ draggable = false }: AgentStatusWidgetProps) {
  const sessionsQuery = useQuery({
    queryKey: ['dashboard', 'active-agent-sessions'],
    queryFn: fetchSessions,
    refetchInterval: 15_000,
  })

  const agents = useMemo(function buildAgents() {
    const rows = Array.isArray(sessionsQuery.data) ? sessionsQuery.data : []
    if (rows.length === 0) return []

    const now = Date.now()
    return [...rows].sort(compareSessionRecency).map(function mapAgent(session) {
      return toAgentRow(session, now)
    })
  }, [sessionsQuery.data])

  return (
    <DashboardGlassCard
      title="Active Agents"
      description="Running agent sessions, model, and live progress."
      icon={UserGroupIcon}
      draggable={draggable}
      className="h-full"
    >
      {agents.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-primary-200 bg-primary-100/45 text-sm text-primary-600 text-pretty">
          No active agent sessions
        </div>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {agents.map(function renderAgent(agent) {
            return (
              <article
                key={agent.id}
                className="rounded-xl border border-primary-200 bg-primary-100/45 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 line-clamp-1 text-sm font-medium text-ink text-pretty">
                    {agent.name}
                    <span className="text-primary-500"> / </span>
                    <span className="text-primary-700">{agent.task}</span>
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5 tabular-nums">
                    <span className="rounded-md border border-primary-200 bg-primary-50/80 px-2 py-0.5 text-xs text-primary-700">
                      {agent.model}
                    </span>
                    <span className="text-xs text-primary-600">
                      {formatElapsed(agent.elapsedSeconds)}
                    </span>
                  </div>
                </div>

                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.5 text-xs text-pretty',
                        agent.status === 'validating' && 'bg-amber-100 text-amber-800',
                        agent.status === 'running' && 'bg-amber-100 text-amber-700',
                        agent.status === 'indexing' && 'bg-amber-50 text-amber-700',
                        agent.status !== 'validating' &&
                          agent.status !== 'running' &&
                          agent.status !== 'indexing' &&
                          'bg-primary-100 text-primary-700',
                      )}
                    >
                      {agent.status}
                    </span>
                    <span className="text-xs text-primary-600 tabular-nums">
                      {agent.progress}%
                    </span>
                  </div>
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-primary-200/70"
                    role="progressbar"
                    aria-label={`${agent.name} progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={agent.progress}
                  >
                    <span
                      className="block h-full rounded-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${agent.progress}%` }}
                    />
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </DashboardGlassCard>
  )
}
