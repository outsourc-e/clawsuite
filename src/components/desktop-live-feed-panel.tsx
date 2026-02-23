import { Activity01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useMemo, useRef } from 'react'
import { useActivityEvents } from '@/screens/activity/use-activity-events'
import { cn } from '@/lib/utils'

function formatTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return '--:--:--'
  }
}

function formatAgentName(source?: string): string {
  if (!source) return 'System'
  return source
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

export function DesktopLiveFeedPanel() {
  const { events, isConnected, isLoading } = useActivityEvents({
    initialCount: 30,
    maxEvents: 250,
  })
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [events.length])

  const items = useMemo(() => events.slice(-120), [events])

  return (
    <aside className="hidden h-full w-80 border-l border-primary-200/70 bg-card/90 text-primary-900 xl:flex xl:flex-col">
      <div className="flex items-center justify-between border-b border-primary-200/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Activity01Icon} size={16} strokeWidth={1.7} />
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-500">
            Live Feed
          </span>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
            isConnected
              ? 'border-emerald-200 bg-emerald-100/70 text-emerald-700'
              : 'border-amber-200 bg-amber-100/70 text-amber-700',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              isConnected ? 'bg-emerald-500' : 'bg-amber-500',
            )}
          />
          {isConnected ? 'Live' : 'Reconnecting'}
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading && items.length === 0 ? (
          <div className="rounded-lg border border-primary-200/60 bg-muted px-3 py-2 text-xs text-primary-500">
            Loading activity…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-primary-200/60 bg-muted px-3 py-2 text-xs text-primary-500">
            No recent activity
          </div>
        ) : (
          <ul className="space-y-1.5">
            {items.map((event) => (
              <li
                key={event.id}
                className="rounded-lg border border-primary-200/50 bg-muted/70 px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2 text-[10px] text-primary-500">
                  <span className="font-mono tabular-nums">
                    {formatTime(event.timestamp)}
                  </span>
                  <span className="rounded-full border border-primary-200/70 px-1.5 py-0.5 uppercase tracking-wide">
                    {event.type}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs font-semibold text-ink">
                  {formatAgentName(event.source)}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-primary-700">
                  {event.detail || event.title}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
