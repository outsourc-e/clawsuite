import { cn } from '@/lib/utils'

type NowCardProps = {
  gatewayConnected: boolean
  activeAgents: number
  activeTasks: number
  sessions?: number
  updatedAgo?: string
  className?: string
  editMode?: boolean
  onRemove?: () => void
}

export function NowCard({
  gatewayConnected,
  activeAgents,
  activeTasks,
  sessions,
  updatedAgo,
  className,
}: NowCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50/95 px-3 py-2 shadow-sm backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/60',
        className,
      )}
    >
      {/* Status dot */}
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          gatewayConnected ? 'animate-pulse bg-emerald-500' : 'bg-red-500',
        )}
      />

      <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
        Welcome back
      </span>

      <span className="text-xs text-neutral-400">·</span>

      <span className="text-xs text-neutral-600 dark:text-neutral-400">
        {activeAgents} agent{activeAgents !== 1 ? 's' : ''}
      </span>

      {activeTasks > 0 ? (
        <>
          <span className="text-xs text-neutral-400">·</span>
          <span className="text-xs text-neutral-600 dark:text-neutral-400">
            {activeTasks} task{activeTasks !== 1 ? 's' : ''} running
          </span>
        </>
      ) : null}

      {sessions !== undefined && sessions > 0 ? (
        <>
          <span className="text-xs text-neutral-400">·</span>
          <span className="text-xs text-neutral-600 dark:text-neutral-400">
            {sessions} session{sessions !== 1 ? 's' : ''}
          </span>
        </>
      ) : null}

      <span className="ml-auto flex items-center gap-1.5 text-xs font-medium">
        {gatewayConnected ? (
          <span className="text-emerald-600 dark:text-emerald-400">Connected</span>
        ) : (
          <span className="text-red-600 dark:text-red-400">Offline</span>
        )}
        {updatedAgo ? (
          <span className="text-neutral-400">· {updatedAgo}</span>
        ) : null}
      </span>
    </div>
  )
}
