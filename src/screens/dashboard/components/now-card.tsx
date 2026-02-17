import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ActivityEvent } from '@/types/activity-event'
import { cn } from '@/lib/utils'

type RecentActivityResponse = {
  events?: Array<unknown>
  connected?: unknown
}

type NowCardProps = {
  gatewayConnected: boolean
  activeAgents: number
  activeTasks: number
  className?: string
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

function normalizeRecentEvent(value: unknown): ActivityEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const id = readString(source.id)
  const title = readString(source.title)
  const timestamp = readNumber(source.timestamp)
  const detail = readString(source.detail) || undefined
  const type = source.type as ActivityEvent['type'] | undefined
  const level = source.level as ActivityEvent['level'] | undefined

  if (!id || !title || timestamp <= 0 || !type || !level) return null

  return {
    id,
    title,
    timestamp,
    detail,
    type,
    level,
  }
}

async function fetchNowCardActivity(): Promise<{
  connected: boolean | null
  latest: ActivityEvent | null
}> {
  const response = await fetch('/api/events/recent?count=12')
  if (!response.ok) throw new Error('Unable to load activity')

  const payload = (await response.json()) as RecentActivityResponse
  const rows = Array.isArray(payload.events) ? payload.events : []
  const events = rows
    .map(normalizeRecentEvent)
    .filter((event): event is ActivityEvent => event !== null)
    .sort((left, right) => right.timestamp - left.timestamp)

  return {
    connected:
      typeof payload.connected === 'boolean' ? payload.connected : null,
    latest: events[0] ?? null,
  }
}

/** Sanitize event detail — strip raw JSON payloads that leak from gateway */
function sanitizeDetail(text: string): string {
  const trimmed = text.trim()
  // If it looks like raw JSON, don't show it
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return ''
  // Truncate overly long details
  if (trimmed.length > 120) return `${trimmed.slice(0, 117)}…`
  return trimmed
}

function toRelativeTime(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - timestamp)
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function NowCard({
  gatewayConnected,
  activeAgents,
  activeTasks,
  className,
}: NowCardProps) {
  const navigate = useNavigate()

  const recentActivityQuery = useQuery({
    queryKey: ['dashboard', 'now-card-activity'],
    queryFn: fetchNowCardActivity,
    retry: false,
    refetchInterval: 15_000,
  })

  const latestEvent = recentActivityQuery.data?.latest ?? null
  const streamConnected = recentActivityQuery.data?.connected ?? null

  const connectionState = !gatewayConnected
    ? 'offline'
    : streamConnected === false || recentActivityQuery.isError
      ? 'degraded'
      : 'connected'

  const connectionLabel =
    connectionState === 'connected'
      ? 'Connected'
      : connectionState === 'degraded'
        ? 'Degraded'
        : 'Offline'

  const connectionDotClass =
    connectionState === 'connected'
      ? 'bg-emerald-500'
      : connectionState === 'degraded'
        ? 'bg-amber-500'
        : 'bg-red-500'

  const connectionTextClass =
    connectionState === 'connected'
      ? 'text-emerald-700'
      : connectionState === 'degraded'
        ? 'text-amber-700'
        : 'text-red-700'

  return (
    <section
      className={cn(
        'rounded-xl border border-primary-200 bg-white p-3 shadow-sm dark:bg-gray-900 md:hidden',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-100/70 px-2 py-0.5 text-xs font-medium',
            connectionTextClass,
          )}
        >
          <span className={cn('size-1.5 rounded-full', connectionDotClass)} />
          {connectionLabel}
        </span>
        <span className="text-[11px] text-primary-500">Now</span>
      </div>

      <p className="mt-2 text-xs text-primary-600">
        {activeAgents} agents active • {activeTasks} in progress
      </p>

      <p className="mt-2 line-clamp-1 text-sm font-medium text-ink">
        {latestEvent
          ? `${sanitizeDetail(latestEvent.detail ?? '') || latestEvent.title} • ${toRelativeTime(latestEvent.timestamp)}`
          : 'No recent activity yet'}
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void navigate({ to: '/agent-swarm' })}
          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100"
        >
          Open Agent Hub
          <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => void navigate({ to: '/activity' })}
          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-primary-200 bg-primary-50/80 px-2.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100"
        >
          View Activity
          <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.5} />
        </button>
      </div>
    </section>
  )
}
