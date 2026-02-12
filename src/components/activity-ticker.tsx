import { useNavigate } from '@tanstack/react-router'
import { useActivityEvents } from '@/screens/activity/use-activity-events'
import { cn } from '@/lib/utils'
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
  const diff = Math.floor((now - timestamp) / 1000) // seconds

  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
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

  // Show loading state
  if (isLoading) {
    return (
      <div className="h-8 border-b border-primary-200 bg-primary-100/50 dark:border-primary-800 dark:bg-primary-900/50">
        <div className="flex h-full items-center px-4 text-xs text-primary-600 dark:text-primary-400">
          <span>Listening</span>
          <span className="ml-1 animate-pulse">●</span>
        </div>
      </div>
    )
  }

  // Show disconnected state
  if (!isConnected) {
    return (
      <div className="h-8 border-b border-primary-200 bg-primary-100/50 dark:border-primary-800 dark:bg-primary-900/50">
        <div className="flex h-full items-center px-4 text-xs text-orange-600 dark:text-orange-400">
          <span>⚠ Disconnected</span>
        </div>
      </div>
    )
  }

  // Show empty state
  if (events.length === 0) {
    return (
      <div className="h-8 border-b border-primary-200 bg-primary-100/50 dark:border-primary-800 dark:bg-primary-900/50">
        <div className="flex h-full items-center px-4 text-xs text-primary-600 dark:text-primary-400">
          <span>Listening</span>
          <span className="ml-1 animate-pulse">●</span>
        </div>
      </div>
    )
  }

  // Render scrolling events
  return (
    <div
      className="h-8 cursor-pointer overflow-hidden border-b border-primary-200 bg-primary-100/50 dark:border-primary-800 dark:bg-primary-900/50"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick()
        }
      }}
    >
      <div className="ticker-container h-full">
        <div className="ticker-content flex h-full items-center gap-4">
          {/* Duplicate events for seamless loop */}
          {[...events, ...events].map((event, index) => (
            <div
              key={`${event.id}-${index}`}
              className="flex items-center gap-2 whitespace-nowrap text-xs"
            >
              <span className="text-base">{EVENT_EMOJIS[event.type]}</span>
              <span className="text-primary-700 dark:text-primary-300">
                {event.title}
              </span>
              <span className="font-mono text-primary-500 dark:text-primary-500">
                {formatTimeAgo(event.timestamp)}
              </span>
              <span className="text-primary-400 dark:text-primary-600">·</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
