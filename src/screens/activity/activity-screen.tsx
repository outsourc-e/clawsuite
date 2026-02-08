import { Activity01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useActivityEvents } from './use-activity-events'
import { ActivityEventRow } from './components/activity-event-row'
import { cn } from '@/lib/utils'

export function ActivityScreen() {
  const { events, isConnected, isLoading } = useActivityEvents({
    initialCount: 100,
    maxEvents: 200,
  })

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <HugeiconsIcon icon={Activity01Icon} size={28} strokeWidth={1.5} />
        <h1 className="text-2xl font-bold text-primary-900">Activity Log</h1>
        <span
          className={cn(
            'ml-2 inline-flex size-2.5 rounded-full',
            isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500',
          )}
          title={isConnected ? 'Live' : 'Disconnected'}
        />
      </header>

      {isLoading ? (
        <p className="text-sm text-primary-600">Loading events…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-primary-600">No activity events yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {events
            .slice()
            .reverse()
            .map(function renderEvent(event) {
              return <ActivityEventRow key={event.id} event={event} />
            })}
        </div>
      )}
    </main>
  )
}
