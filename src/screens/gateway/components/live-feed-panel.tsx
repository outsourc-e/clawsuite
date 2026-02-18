import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  emitFeedEvent,
  onFeedEvent,
  type FeedEvent,
  type FeedEventType,
} from './feed-event-bus'

const FILTERS = ['All', 'Tasks', 'Agents'] as const
type FilterTab = (typeof FILTERS)[number]

type SessionRecord = Record<string, unknown>
type FeedRow = FeedEvent & { baseMessage: string, repeatCount: number }

const TASK_TYPES = new Set<FeedEventType>([
  'task_created',
  'task_moved',
  'task_completed',
  'task_assigned',
])

const AGENT_TYPES = new Set<FeedEventType>([
  'agent_active',
  'agent_idle',
  'agent_paused',
  'agent_spawned',
  'agent_killed',
  'gateway_health',
])

const EVENT_ICONS: Record<FeedEventType, string> = {
  task_created: '🆕',
  task_moved: '🔀',
  task_completed: '✅',
  task_assigned: '👤',
  agent_active: '🟢',
  agent_idle: '🟡',
  agent_paused: '⏸️',
  agent_spawned: '➕',
  agent_killed: '🛑',
  gateway_health: '💓',
  system: 'ℹ️',
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function sessionIdentity(session: SessionRecord): string {
  return (
    readString(session.key) ||
    readString(session.friendlyId) ||
    readString(session.label) ||
    readString(session.displayName)
  )
}

function sessionName(session: SessionRecord): string {
  return (
    readString(session.label) ||
    readString(session.displayName) ||
    readString(session.title) ||
    readString(session.friendlyId) ||
    readString(session.key)
  )
}

function timeAgo(timestamp: number, now: number): string {
  const delta = Math.max(0, now - timestamp)
  const seconds = Math.floor(delta / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function LiveFeedPanel() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All')
  const [events, setEvents] = useState<Array<FeedRow>>([])
  const [clock, setClock] = useState(Date.now())
  const previousSessionsRef = useRef<Map<string, string> | null>(null)

  useEffect(
    () =>
      onFeedEvent((event) =>
        setEvents((previous) => {
          const latest = previous[0]
          if (
            latest &&
            latest.type === event.type &&
            latest.baseMessage === event.message
          ) {
            return [
              {
                ...latest,
                agentName: event.agentName ?? latest.agentName,
                timestamp: event.timestamp,
                repeatCount: latest.repeatCount + 1,
              },
              ...previous.slice(1),
            ].slice(0, 50)
          }

          return [
            { ...event, baseMessage: event.message, repeatCount: 1 },
            ...previous,
          ].slice(0, 50)
        }),
      ),
    [],
  )

  useEffect(() => {
    const tick = window.setInterval(() => setClock(Date.now()), 30_000)
    return () => window.clearInterval(tick)
  }, [])

  useEffect(() => {
    async function pollSessions() {
      try {
        const response = await fetch('/api/sessions')
        if (!response.ok) return

        const payload = (await response.json()) as { sessions?: Array<SessionRecord> }
        const sessions = Array.isArray(payload.sessions) ? payload.sessions : []
        const next = new Map<string, string>()

        sessions.forEach((session) => {
          const id = sessionIdentity(session)
          if (!id) return
          next.set(id, sessionName(session) || id)
        })

        const previous = previousSessionsRef.current
        if (previous) {
          next.forEach((name, id) => {
            if (!previous.has(id)) {
              emitFeedEvent({ type: 'agent_spawned', message: `Session started: ${name}`, agentName: name })
            }
          })
          previous.forEach((name, id) => {
            if (!next.has(id)) {
              emitFeedEvent({ type: 'agent_killed', message: `Session ended: ${name}`, agentName: name || id })
            }
          })
        }

        previousSessionsRef.current = next
      } catch {
        // Ignore polling errors; feed continues from local events.
      }
    }

    void pollSessions()
    const interval = window.setInterval(() => {
      void pollSessions()
    }, 10_000)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const emitHealth = () => emitFeedEvent({ type: 'gateway_health', message: 'Gateway health check' })
    emitHealth()
    const interval = window.setInterval(emitHealth, 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const visibleEvents = useMemo(() => {
    return events.filter((event) => {
      if (activeFilter === 'Tasks') return TASK_TYPES.has(event.type)
      if (activeFilter === 'Agents') return AGENT_TYPES.has(event.type)
      return true
    })
  }, [activeFilter, events])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-primary-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">Live Feed</h2>
        <span className="flex items-center gap-1 text-[11px] text-emerald-600">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          Live
        </span>
      </div>

      <div className="flex gap-1 border-b border-primary-100 px-4 py-3">
        {FILTERS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveFilter(tab)}
            className={cn(
              'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
              activeFilter === tab
                ? 'bg-primary-100 text-primary-700 dark:bg-neutral-800 dark:text-neutral-200'
                : 'text-primary-500 hover:bg-primary-50 dark:hover:bg-neutral-800/50',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
        {visibleEvents.length === 0 ? (
          <p className="py-8 text-center text-[11px] text-primary-400">Listening for events...</p>
        ) : (
          visibleEvents.map((event) => {
            const message = event.repeatCount > 1
              ? `${event.baseMessage} (x${event.repeatCount})`
              : event.baseMessage

            return (
              <div
                key={event.id}
                className="flex items-start gap-2 rounded-lg border border-primary-200/70 bg-white/80 px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-900/70"
              >
                <span className="mt-0.5 text-sm" aria-hidden>
                  {EVENT_ICONS[event.type] ?? '•'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-primary-900 dark:text-neutral-100">{message}</p>
                  {event.agentName ? (
                    <p className="truncate text-[10px] text-primary-500 dark:text-neutral-400">{event.agentName}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-[10px] text-primary-400">{timeAgo(event.timestamp, clock)}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
