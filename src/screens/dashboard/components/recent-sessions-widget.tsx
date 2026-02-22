import { ArrowRight01Icon, Clock01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DashboardGlassCard } from './dashboard-glass-card'
import type { RecentSession } from './dashboard-types'
import type { SessionInfo } from '../hooks/use-dashboard-data'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type RecentSessionsWidgetProps = {
  onOpenSession: (sessionKey: string) => void
  sessions: SessionInfo[]
  activeCount: number
  loading?: boolean
  draggable?: boolean
  onRemove?: () => void
}

function formatSessionTimestamp(value: number): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function RecentSessionsWidget({
  onOpenSession,
  sessions,
  activeCount,
  loading = false,
  draggable = false,
  onRemove,
}: RecentSessionsWidgetProps) {
  const displaySessions: RecentSession[] = sessions.slice(0, 5).map((session) => ({
    friendlyId: session.friendlyId || session.key,
    title: session.label,
    preview: session.preview || 'New session',
    updatedAt: session.updatedAt,
  }))
  const isLoading = loading && displaySessions.length === 0

  return (
    <DashboardGlassCard
      title="Recent Sessions"
      description=""
      icon={Clock01Icon}
      titleAccessory={
        <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 font-mono text-[11px] font-medium text-neutral-200 tabular-nums">
          {activeCount} active
        </span>
      }
      draggable={draggable}
      onRemove={onRemove}
      className="h-full rounded-xl border-neutral-800 bg-neutral-900 p-4 sm:p-5 shadow-[0_6px_20px_rgba(0,0,0,0.25)] [&_h2]:text-[11px] [&_h2]:font-medium [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-neutral-500 [&_svg]:text-neutral-500"
    >
      {isLoading ? (
        <div className="flex h-32 items-center justify-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950">
          <span
            className="size-4 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-300"
            role="status"
            aria-label="Loading"
          />
          <span className="text-sm text-neutral-400">Loading sessions…</span>
        </div>
      ) : displaySessions.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-lg border border-neutral-800 bg-neutral-950">
          <p className="text-sm font-semibold text-neutral-100">No sessions yet</p>
          <p className="text-xs text-neutral-400">
            Start a conversation to see recent sessions here
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displaySessions.map(function mapSession(session, index) {
            return (
              <Button
                key={session.friendlyId}
                variant="outline"
                className={cn(
                  'group h-auto w-full flex-col items-start rounded-lg border border-neutral-800 px-3.5 py-3 text-left shadow-sm transition-all hover:-translate-y-[1px] hover:border-neutral-700',
                  index % 2 === 0
                    ? 'bg-neutral-950 hover:bg-neutral-900'
                    : 'bg-neutral-950/80 hover:bg-neutral-900/90',
                )}
                onClick={function onSessionClick() {
                  onOpenSession(session.friendlyId)
                }}
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="line-clamp-1 text-sm font-semibold text-neutral-100 text-balance">
                    {session.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 font-mono text-[10px] text-neutral-400 tabular-nums">
                      {formatSessionTimestamp(session.updatedAt)}
                    </span>
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={14}
                      strokeWidth={1.5}
                      className="text-neutral-500 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 w-full text-left text-sm text-neutral-400 text-pretty">
                  {session.preview}
                </p>
              </Button>
            )
          })}
        </div>
      )}
    </DashboardGlassCard>
  )
}
