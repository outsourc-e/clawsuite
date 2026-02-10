import { Activity01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef } from 'react'
import { DashboardGlassCard } from './dashboard-glass-card'
import { ActivityEventRow } from '@/screens/activity/components/activity-event-row'
import { useActivityEvents } from '@/screens/activity/use-activity-events'
import { cn } from '@/lib/utils'

type ActivityLogWidgetProps = {
  draggable?: boolean
  onRemove?: () => void
}

export function ActivityLogWidget({ draggable = false, onRemove }: ActivityLogWidgetProps) {
  const navigate = useNavigate()
  const { events, isConnected, isLoading } = useActivityEvents({
    initialCount: 20,
    maxEvents: 100,
  })

  const viewportRef = useRef<HTMLDivElement | null>(null)

  const latestEvents = useMemo(function sliceLatestEvents() {
    return events.slice(events.length - 20)
  }, [events])

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
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] tabular-nums',
            isConnected
              ? 'border-emerald-200 bg-emerald-100/70 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400'
              : 'border-red-200 bg-red-100/70 text-red-700',
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
      }
      description="Chronological Gateway and Studio event feed."
      icon={Activity01Icon}
      draggable={draggable}
      onRemove={onRemove}
      className="h-full"
    >
      <div className="mb-1.5 flex justify-end">
        <button
          type="button"
          onClick={() => void navigate({ to: '/activity' })}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-400 hover:text-primary-600"
        >
          View all
          <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={1.5} />
        </button>
      </div>

      {!isConnected ? (
        <div className="mb-2 rounded-lg border border-primary-200 bg-primary-100/60 px-3 py-2.5 text-xs text-primary-600">
          <p className="font-medium">Gateway disconnected</p>
          <p className="mt-0.5">Reconnect to see live events.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-1.5 text-xs font-medium text-primary-800 underline hover:text-primary-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-1 rounded"
            aria-label="Retry connection"
          >
            Retry
          </button>
        </div>
      ) : null}

      {isLoading && latestEvents.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-primary-200 bg-primary-100/40 text-xs text-primary-500">
          Loading activity…
        </div>
      ) : latestEvents.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-primary-200 bg-primary-100/40 text-xs text-primary-500">
          No recent events
        </div>
      ) : (
        <div
          ref={viewportRef}
          className="max-h-[260px] space-y-px overflow-y-auto"
        >
          {latestEvents.map(function mapEvent(event) {
            return <ActivityEventRow key={event.id} event={event} />
          })}
        </div>
      )}
    </DashboardGlassCard>
  )
}
