import { Clock01Icon } from '@hugeicons/core-free-icons'
import { DashboardGlassCard } from './dashboard-glass-card'
import type { RecentSession } from './dashboard-types'
import { Button } from '@/components/ui/button'

type RecentSessionsWidgetProps = {
  sessions: Array<RecentSession>
  onOpenSession: (sessionKey: string) => void
  draggable?: boolean
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
  sessions,
  onOpenSession,
  draggable = false,
}: RecentSessionsWidgetProps) {
  return (
    <DashboardGlassCard
      title="Recent Sessions"
      description="Resume work from your latest chat conversations."
      icon={Clock01Icon}
      draggable={draggable}
      className="h-full"
    >
      <div className="space-y-2">
        {sessions.map(function mapSession(session) {
          return (
            <Button
              key={session.friendlyId}
              variant="outline"
              className="h-auto w-full flex-col items-start rounded-xl border-primary-200 bg-primary-50/80 px-3 py-2.5 hover:bg-primary-100/70"
              onClick={function onSessionClick() {
                onOpenSession(session.friendlyId)
              }}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <span className="line-clamp-1 text-sm font-medium text-ink text-balance">
                  {session.title}
                </span>
                <span className="shrink-0 text-[11px] text-primary-600 tabular-nums">
                  {formatSessionTimestamp(session.updatedAt)}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 w-full text-left text-xs text-primary-600 text-pretty">
                {session.preview}
              </p>
            </Button>
          )
        })}
      </div>
    </DashboardGlassCard>
  )
}
