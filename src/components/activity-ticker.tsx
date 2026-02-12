import { useNavigate } from '@tanstack/react-router'
import { useActivityEvents } from '@/screens/activity/use-activity-events'
import type { ActivityEvent } from '@/types/activity-event'

const EVENT_EMOJIS: Record<ActivityEvent['type'], string> = {
  gateway: '⚡',
  model: '🤖',
  usage: '📊',
  cron: '⏰',
  tool: '🔧',
  error: '❌',
  session: '💬',
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = Math.floor((now - timestamp) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

export function ActivityTicker() {
  const navigate = useNavigate()
  const { events, isConnected, isLoading } = useActivityEvents({
    initialCount: 15,
    maxEvents: 15,
  })

  function handleClick() {
    void navigate({ to: '/activity' })
  }

  const barClass =
    'mb-4 h-9 cursor-pointer overflow-hidden rounded-xl border border-primary-200 bg-primary-50/80 shadow-sm dark:border-primary-800 dark:bg-primary-900/60'

  // Loading / disconnected / empty
  if (isLoading || events.length === 0) {
    return (
      <div className={barClass} onClick={handleClick} role="button" tabIndex={0}>
        <div className="flex h-full items-center px-4 text-xs text-primary-500">
          <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-primary-400" />
          Listening for events…
        </div>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className={barClass}>
        <div className="flex h-full items-center px-4 text-xs text-orange-500">
          ⚠ Gateway disconnected
        </div>
      </div>
    )
  }

  return (
    <div
      className={barClass}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick()
      }}
    >
      <div className="ticker-container h-full">
        <div className="ticker-content flex h-full items-center gap-5 px-4">
          {[...events, ...events].map((event, index) => (
            <span
              key={`${event.id}-${index}`}
              className="flex items-center gap-1.5 whitespace-nowrap text-xs"
            >
              <span>{EVENT_EMOJIS[event.type]}</span>
              <span className="text-primary-700 dark:text-primary-300">
                {event.title}
              </span>
              <span className="font-mono text-[10px] text-primary-400">
                {formatTimeAgo(event.timestamp)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
