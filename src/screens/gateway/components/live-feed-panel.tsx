import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  emitFeedEvent,
  onFeedEvent,
  type FeedEvent,
  type FeedEventType,
} from './feed-event-bus'

// 'Activity' = tasks + agents (no health checks), default
// 'Tasks'    = task events only
// 'Agents'   = agent events only
// 'System'   = gateway_health + system events
const FILTERS = ['Activity', 'Tasks', 'Agents', 'System'] as const
type FilterTab = (typeof FILTERS)[number]

type SessionRecord = Record<string, unknown>
type FeedRow = FeedEvent & { baseMessage: string; repeatCount: number }

const TASK_TYPES = new Set<FeedEventType>([
  'mission_started',
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
])

const SYSTEM_TYPES = new Set<FeedEventType>([
  'gateway_health',
  'system',
])

// Activity = all except system/health
const ACTIVITY_TYPES = new Set<FeedEventType>([
  ...TASK_TYPES,
  ...AGENT_TYPES,
])

type EventBadge = { label: string; className: string }

const EVENT_BADGE: Record<FeedEventType, EventBadge> = {
  mission_started: { label: 'MISSION', className: 'bg-orange-950/70 text-orange-400 border border-orange-800/50' },
  task_created:    { label: 'TASK',    className: 'bg-cyan-950/70 text-cyan-400 border border-cyan-800/50' },
  task_moved:      { label: 'MOVE',    className: 'bg-cyan-950/70 text-cyan-400 border border-cyan-800/50' },
  task_completed:  { label: 'DONE',    className: 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/50' },
  task_assigned:   { label: 'ASSIGN',  className: 'bg-cyan-950/70 text-cyan-400 border border-cyan-800/50' },
  agent_active:    { label: 'AGENT',   className: 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/50' },
  agent_idle:      { label: 'IDLE',    className: 'bg-neutral-100 text-neutral-500 border border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700' },
  agent_paused:    { label: 'PAUSE',   className: 'bg-amber-950/70 text-amber-400 border border-amber-800/50' },
  agent_spawned:   { label: 'SPAWN',   className: 'bg-blue-950/70 text-blue-400 border border-blue-800/50' },
  agent_killed:    { label: 'KILL',    className: 'bg-red-950/70 text-red-400 border border-red-800/50' },
  gateway_health:  { label: 'SYS',     className: 'bg-neutral-100 text-neutral-500 border border-neutral-200 dark:bg-neutral-900 dark:text-neutral-600 dark:border-neutral-800' },
  system:          { label: 'SYS',     className: 'bg-orange-950/70 text-orange-400 border border-orange-800/50' },
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

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export function LiveFeedPanel() {
  // Default to 'Activity' to hide noisy health checks
  const [activeFilter, setActiveFilter] = useState<FilterTab>('Activity')
  const [events, setEvents] = useState<Array<FeedRow>>([])
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
            ].slice(0, 100)
          }
          return [
            { ...event, baseMessage: event.message, repeatCount: 1 },
            ...previous,
          ].slice(0, 100)
        }),
      ),
    [],
  )

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
    const interval = window.setInterval(() => void pollSessions(), 10_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const emit = () => emitFeedEvent({ type: 'gateway_health', message: 'Gateway health check' })
    emit()
    const interval = window.setInterval(emit, 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const visibleEvents = useMemo(() => {
    return events.filter((event) => {
      if (activeFilter === 'Tasks') return TASK_TYPES.has(event.type)
      if (activeFilter === 'Agents') return AGENT_TYPES.has(event.type)
      if (activeFilter === 'System') return SYSTEM_TYPES.has(event.type)
      // 'Activity': tasks + agents, no health/system noise
      return ACTIVITY_TYPES.has(event.type)
    })
  }, [activeFilter, events])

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
          Live Feed
        </h2>
        <div className="flex items-center gap-2">
          {events.length > 0 ? (
            <button
              type="button"
              onClick={() => setEvents([])}
              className="rounded px-1.5 py-0.5 text-[10px] text-neutral-600 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
            >
              Clear
            </button>
          ) : null}
          {/* Animated LIVE badge */}
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-800/50 bg-emerald-950/40 px-2 py-0.5 text-[9px] font-bold tracking-wider text-emerald-400">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            LIVE
          </span>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 gap-0.5 border-b border-neutral-200 px-2 py-1.5 dark:border-neutral-800">
        {FILTERS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveFilter(tab)}
            className={cn(
              'rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors',
              activeFilter === tab
                ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-600 dark:hover:bg-neutral-900 dark:hover:text-neutral-300',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Events list ─────────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Top fade overlay */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-white to-transparent dark:from-neutral-950" />

        <div className="h-full overflow-y-auto px-3 pb-3 pt-8">
          {visibleEvents.length === 0 ? (
            <p className="py-8 text-center font-mono text-[10px] text-neutral-700">
              {activeFilter === 'Activity'
                ? `// no activity events yet — start a mission`
                : `// no ${activeFilter.toLowerCase()} events`}
            </p>
          ) : (
            <div className="space-y-1">
              {visibleEvents.map((event) => {
                const message =
                  event.repeatCount > 1
                    ? `${event.baseMessage} ×${event.repeatCount}`
                    : event.baseMessage
                const badge = EVENT_BADGE[event.type] ?? EVENT_BADGE.system

                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-neutral-800/60 dark:bg-neutral-900/40"
                  >
                    {/* Type badge */}
                    <span
                      className={cn(
                        'mt-0.5 shrink-0 rounded px-1 py-px font-mono text-[8px] font-bold tracking-wider',
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </span>

                    {/* Message + agent name */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] leading-tight text-neutral-800 dark:text-neutral-200">{message}</p>
                      {event.agentName ? (
                        <p className="mt-0.5 truncate font-mono text-[9px] text-neutral-700">
                          {event.agentName}
                        </p>
                      ) : null}
                    </div>

                    {/* Timestamp */}
                    <span className="shrink-0 font-mono text-[9px] tabular-nums text-neutral-700">
                      {relativeTime(event.timestamp)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
