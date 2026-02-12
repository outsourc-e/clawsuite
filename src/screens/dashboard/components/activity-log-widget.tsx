import { Activity01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef } from 'react'
import { DashboardGlassCard } from './dashboard-glass-card'
import type { ActivityEvent } from '@/types/activity-event'
import { useActivityEvents } from '@/screens/activity/use-activity-events'
import { cn } from '@/lib/utils'

type ActivityLogWidgetProps = {
  draggable?: boolean
  onRemove?: () => void
}

function getEventLevelDot(level: ActivityEvent['level']): string {
  if (level === 'error') return 'bg-red-500'
  if (level === 'warn') return 'bg-accent-500'
  if (level === 'info') return 'bg-accent-400'
  return 'bg-primary-300'
}

function getEventTypeLabel(type: ActivityEvent['type']): string {
  if (type === 'gateway') return 'Gateway'
  if (type === 'model') return 'Model'
  if (type === 'usage') return 'Usage'
  if (type === 'cron') return 'Cron'
  if (type === 'tool') return 'Tool'
  if (type === 'error') return 'Error'
  return 'Session'
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - timestamp)
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ActivityLogWidget({
  draggable = false,
  onRemove,
}: ActivityLogWidgetProps) {
  const navigate = useNavigate()
  const { events, isConnected, isLoading } = useActivityEvents({
    initialCount: 20,
    maxEvents: 100,
  })

  const viewportRef = useRef<HTMLDivElement | null>(null)

  const latestEvents = useMemo(
    function sliceLatestEvents() {
      return events.slice(events.length - 20)
    },
    [events],
  )
  const eventCount = latestEvents.length

  useEffect(
    function autoScrollToLatest() {
      const viewport = viewportRef.current
      if (!viewport) return
      viewport.scrollTop = viewport.scrollHeight
    },
    [latestEvents.length],
  )

  return (
    <DashboardGlassCard
      title="Activity Log"
      titleAccessory={
        <span className="inline-flex items-center rounded-full border border-primary-200 bg-primary-100/70 px-2 py-0.5 text-[11px] font-medium text-primary-500 tabular-nums">
          {eventCount}
        </span>
      }
      tier="tertiary"
      description=""
      icon={Activity01Icon}
      draggable={draggable}
      onRemove={onRemove}
      className="h-full rounded-xl border-primary-200 p-4 shadow-sm [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:normal-case [&_h2]:text-ink"
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums',
            isConnected
              ? 'border-emerald-200 bg-emerald-100/70 text-emerald-700'
              : 'border-red-200 bg-red-100/80 text-red-700',
          )}
        >
          <span
            className={cn(
              'inline-flex size-1.5 rounded-full',
              isConnected ? 'animate-pulse bg-emerald-500' : 'bg-red-500',
            )}
          />
          {isConnected ? 'Live' : 'Disconnected'}
        </span>
        <button
          type="button"
          onClick={() => void navigate({ to: '/activity' })}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary-400 transition-colors hover:text-accent-600"
        >
          View all
          <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.5} />
        </button>
      </div>

      {!isConnected ? (
        <div className="mb-2 rounded-lg border border-primary-200 bg-primary-100/60 px-3 py-2.5 text-sm text-primary-600">
          <p className="font-semibold text-ink">Gateway disconnected</p>
          <p className="mt-0.5">Reconnect to see live events.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-1.5 rounded text-xs font-medium text-accent-600 underline underline-offset-2 hover:text-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-300 focus:ring-offset-1"
            aria-label="Retry connection"
          >
            Retry
          </button>
        </div>
      ) : null}

      {isLoading && latestEvents.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-primary-200 bg-primary-100/45 text-sm text-primary-600">
          Loading activity…
        </div>
      ) : latestEvents.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-primary-200 bg-primary-100/45 text-sm text-primary-600">
          No recent events
        </div>
      ) : (
        <div
          ref={viewportRef}
          className="max-h-[260px] space-y-2 overflow-y-auto"
        >
          {latestEvents.map(function mapEvent(event, index) {
            return (
              <article
                key={event.id}
                className={cn(
                  'rounded-lg border border-primary-200 px-3.5 py-2.5',
                  index % 2 === 0 ? 'bg-primary-50/90' : 'bg-primary-100/55',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        getEventLevelDot(event.level),
                      )}
                    />
                    <span className="text-xs font-medium text-primary-600">
                      {getEventTypeLabel(event.type)}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-primary-400 tabular-nums">
                    {formatRelativeTime(event.timestamp)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm font-semibold text-ink text-pretty">
                  {event.title}
                </p>
                {event.detail ? (
                  <p className="mt-1 line-clamp-2 text-sm text-primary-600 text-pretty">
                    {event.detail}
                  </p>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </DashboardGlassCard>
  )
}
