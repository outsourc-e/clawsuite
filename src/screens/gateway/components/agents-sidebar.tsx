import { cn } from '@/lib/utils'

export type AgentRuntime = {
  id: string
  name: string
  role: string
  status: string
  matchedSessions: Array<{ updatedAt?: number | string }>
}

type AgentsSidebarProps = {
  agents: AgentRuntime[]
  selectedAgentId?: string
  onSelectAgent: (agent: AgentRuntime) => void
  onAddAgent: () => void
}

const STATUS_DOT_CLASS: Record<string, string> = {
  active: 'bg-emerald-500',
  idle: 'bg-amber-500',
  available: 'bg-primary-400',
  paused: 'bg-red-500',
}

function readTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }

  return 0
}

function formatRelativeTime(value: unknown): string {
  const timestamp = readTimestamp(value)
  if (!timestamp) return '--'

  const diffMs = Math.max(0, Date.now() - timestamp)
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`

  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function AgentsSidebar({
  agents,
  selectedAgentId,
  onSelectAgent,
  onAddAgent,
}: AgentsSidebarProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-primary-200 px-3 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">
            Squad
          </h2>
          <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-600 dark:bg-neutral-800 dark:text-neutral-300">
            {agents.length}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {agents.map((agent) => {
          const statusDotColor = STATUS_DOT_CLASS[agent.status] ?? 'bg-primary-400'
          const lastUpdated = agent.matchedSessions[0]?.updatedAt

          return (
            <button
              key={agent.id}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors',
                selectedAgentId === agent.id
                  ? 'bg-primary-100 dark:bg-neutral-800/80'
                  : 'hover:bg-primary-50 dark:hover:bg-neutral-800/50',
              )}
              onClick={() => onSelectAgent(agent)}
            >
              <span className={cn('size-2 shrink-0 rounded-full', statusDotColor)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary-900 dark:text-neutral-100">
                  {agent.name}
                </p>
                <p className="truncate text-[11px] text-primary-500">
                  {agent.role} · {agent.status}
                </p>
              </div>
              <span className="shrink-0 text-[10px] text-primary-400">
                {formatRelativeTime(lastUpdated)}
              </span>
            </button>
          )
        })}
      </div>

      <div className="border-t border-primary-200 px-3 py-3">
        <button
          type="button"
          onClick={onAddAgent}
          className="inline-flex w-full items-center justify-center rounded-lg border border-primary-200 bg-white px-3 py-2 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          + Add Agent
        </button>
      </div>
    </div>
  )
}
