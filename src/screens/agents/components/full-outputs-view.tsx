import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/screens/dashboard/lib/formatters'
import type { OperationsAgent, OperationsOutputItem } from '../hooks/use-operations'

type Props = {
  agents: OperationsAgent[]
  items: OperationsOutputItem[]
}

type OutputFilter = 'all' | 'session' | 'cron'

function FilterPill({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl px-3.5 py-2 text-sm font-medium transition-all',
        active
          ? 'bg-[var(--theme-accent)] text-primary-950'
          : 'border border-[var(--theme-border)] bg-white text-[var(--theme-muted)] hover:bg-[var(--theme-card2)]',
      )}
    >
      {label}
    </button>
  )
}

function OutputCard({
  item,
  agent,
}: {
  item: OperationsOutputItem
  agent?: OperationsAgent
}) {
  const [expanded, setExpanded] = useState(false)
  const text = item.summary.trim()
  const shouldCollapse = text.length > 220
  const visible = !shouldCollapse || expanded ? text : `${text.slice(0, 220).trimEnd()}…`

  return (
    <article className="rounded-[1.5rem] border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-[0_20px_60px_color-mix(in_srgb,var(--theme-shadow)_12%,transparent)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[var(--theme-text)]">
            <span className="text-xl leading-none">{agent?.meta.emoji ?? '🤖'}</span>
            <h3 className="text-base font-semibold">{agent?.name ?? item.agentId}</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--theme-muted)]">
            {item.source === 'cron' ? 'Scheduled output' : 'Session output'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--theme-muted)] sm:justify-end">
          <span>{formatRelativeTime(item.timestamp)}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-white px-2.5 py-1 font-medium text-[var(--theme-text)]">
            <span>{item.source === 'cron' ? '⏰' : '💬'}</span>
            <span>{item.source === 'cron' ? 'Cron' : 'Session'}</span>
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-[1.1rem] border border-[var(--theme-border)] bg-white/75 px-4 py-3 text-sm text-[var(--theme-text)]">
        <p className="whitespace-pre-wrap">{visible || 'No output text available.'}</p>
      </div>

      {shouldCollapse ? (
        <div className="mt-4 flex justify-end">
          <Button
            variant="secondary"
            className="border border-[var(--theme-border)] bg-white text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
            onClick={() => setExpanded((value) => !value)}
          >
            <HugeiconsIcon
              icon={expanded ? ArrowUp01Icon : ArrowDown01Icon}
              size={16}
              strokeWidth={1.8}
            />
            {expanded ? 'Collapse' : 'Expand'}
          </Button>
        </div>
      ) : null}
    </article>
  )
}

export function FullOutputsView({ agents, items }: Props) {
  const [filter, setFilter] = useState<OutputFilter>('all')

  const filtered = useMemo(() => {
    const base = [...items].sort((left, right) => right.timestamp - left.timestamp)
    if (filter === 'all') return base
    return base.filter((item) => item.source === filter)
  }, [filter, items])

  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent] as const)),
    [agents],
  )

  return (
    <section className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-[0_24px_80px_var(--theme-shadow)] md:p-5">
      <div className="rounded-[1.5rem] border border-[var(--theme-border)] bg-white/90 p-3 backdrop-blur-sm md:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <FilterPill active={filter === 'all'} label="All" onClick={() => setFilter('all')} />
            <FilterPill active={filter === 'session'} label="Session" onClick={() => setFilter('session')} />
            <FilterPill active={filter === 'cron'} label="Cron" onClick={() => setFilter('cron')} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between px-1">
        <div>
          <h2 className="text-lg font-semibold text-[var(--theme-text)]">Outputs</h2>
          <p className="mt-1 text-sm text-[var(--theme-muted-2)]">
            {filtered.length} recent {filtered.length === 1 ? 'run' : 'runs'} across the team
          </p>
        </div>
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-12 text-center text-sm text-[var(--theme-muted)]">
            No agent outputs yet. Configure cron jobs in agent settings to get started.
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((item) => (
              <OutputCard key={item.id} item={item} agent={agentsById.get(item.agentId)} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
