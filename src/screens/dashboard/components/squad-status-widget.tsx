import { BotIcon } from '@hugeicons/core-free-icons'
import { useNavigate } from '@tanstack/react-router'
import { WidgetShell } from './widget-shell'
import type { AgentInfo } from '../hooks/use-dashboard-data'
import { cn } from '@/lib/utils'

type SquadStatusWidgetProps = {
  editMode?: boolean
  agents: AgentInfo[]
  loading?: boolean
}
type AgentStatus = 'active' | 'idle' | 'available' | 'paused'
type SquadAgentRow = { id: string; name: string; status: AgentStatus; taskPreview: string; timeAgo: string; modelShort: string; updatedAt: number; tokens: number }

const STATUS_LABEL: Record<AgentStatus, string> = { active: 'Active', idle: 'Idle', available: 'Available', paused: 'Paused' }
const STATUS_DOT: Record<AgentStatus, string> = { active: 'bg-emerald-500', idle: 'bg-yellow-500', available: 'bg-neutral-400', paused: 'bg-red-500' }

function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}
function formatRelativeTime(timestamp: number, now: number): string {
  if (!timestamp) return '—'
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}
function formatTokenCompact(n: number): string {
  if (n <= 0) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function SquadStatusWidget({
  editMode,
  agents,
  loading = false,
}: SquadStatusWidgetProps) {
  const navigate = useNavigate()
  const now = Date.now()
  const rows: SquadAgentRow[] = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    status: agent.status,
    taskPreview: truncateText(agent.taskPreview, 30),
    timeAgo: formatRelativeTime(agent.updatedAt, now),
    modelShort: agent.modelFormatted || '—',
    updatedAt: agent.updatedAt,
    tokens: agent.tokens,
  }))
  const visibleAgents = rows.slice(0, 6)

  return (
    <WidgetShell
      size="medium"
      title="Squad Status"
      icon={BotIcon}
      editMode={editMode}
      action={<span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[11px] font-medium text-neutral-300 tabular-nums">{agents.length}</span>}
      className="h-full rounded-xl border-neutral-800 bg-neutral-900 p-4 sm:p-5 shadow-[0_6px_20px_rgba(0,0,0,0.25)] [&_h2]:text-[11px] [&_h2]:font-medium [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-neutral-500 [&_svg]:text-neutral-500"
    >
      {loading && rows.length === 0 ? (
        <div className="flex h-[150px] items-center justify-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950">
          <span className="size-4 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-300" />
          <span className="text-sm text-neutral-400">Loading squad…</span>
        </div>
      ) : visibleAgents.length === 0 ? (
        <div className="flex h-[150px] flex-col items-center justify-center gap-1 rounded-xl border border-neutral-800 bg-neutral-950 text-center">
          <p className="text-sm font-semibold text-neutral-100">No agents yet</p>
          <p className="text-xs text-neutral-500">Agent sessions will appear here</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {visibleAgents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2 rounded-lg border border-transparent bg-neutral-950/70 px-2 py-1.5 transition-colors hover:border-neutral-800 hover:bg-neutral-950">
              <span className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[agent.status])} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-100">{agent.name}</p>
                <p className="truncate text-[11px] text-neutral-500">{STATUS_LABEL[agent.status]}</p>
              </div>
              <p className="hidden max-w-[120px] truncate text-[11px] italic text-neutral-500 sm:block">{agent.taskPreview || '—'}</p>
              <span className="shrink-0 text-[11px] text-neutral-400 tabular-nums">{agent.timeAgo}</span>
              {agent.tokens > 0 && (
                <span className="shrink-0 text-[10px] tabular-nums text-neutral-400">{formatTokenCompact(agent.tokens)}</span>
              )}
              <span className="shrink-0 rounded-full border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium text-neutral-300">{agent.modelShort}</span>
            </div>
          ))}
          {rows.length > 6 ? (
            <button type="button" onClick={() => void navigate({ to: '/agents' })} className="mt-1 inline-flex text-[11px] font-medium text-neutral-400 transition-colors hover:text-neutral-200">
              View all →
            </button>
          ) : null}
        </div>
      )}
    </WidgetShell>
  )
}
