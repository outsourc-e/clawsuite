import { UserGroupIcon, SidebarLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useMemo, useState } from 'react'
import { useCliAgents } from '@/hooks/use-cli-agents'
import { useDashboardData } from '@/screens/dashboard/hooks/use-dashboard-data'
import { cn } from '@/lib/utils'

type RosterPresence = 'online' | 'busy' | 'idle' | 'offline'

type RosterRow = {
  id: string
  name: string
  status: RosterPresence
  subtitle: string
}

const COLLAPSED_KEY = 'clawsuite-desktop-agent-roster-collapsed'

const STATUS_DOT_CLASS: Record<RosterPresence, string> = {
  online: 'bg-emerald-500',
  busy: 'bg-orange-500',
  idle: 'bg-amber-400',
  offline: 'bg-neutral-500',
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase()
}

export function DesktopAgentRosterSidebar() {
  const { data } = useDashboardData()
  const cliAgentsQuery = useCliAgents()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === 'true')
    } catch {
      setCollapsed(false)
    }
  }, [])

  const rows = useMemo<Array<RosterRow>>(() => {
    const cliAgents = cliAgentsQuery.data ?? []
    const runningByName = new Map<string, string>()

    for (const agent of cliAgents) {
      runningByName.set(normalizeName(agent.name), agent.task || 'Working')
    }

    const merged = new Map<string, RosterRow>()
    for (const agent of data.agents.roster) {
      const key = normalizeName(agent.name)
      const cliTask = runningByName.get(key)
      const status: RosterPresence = cliTask
        ? 'busy'
        : agent.status === 'active'
          ? 'online'
          : agent.status === 'idle'
            ? 'idle'
            : 'offline'

      merged.set(key || agent.id, {
        id: agent.id,
        name: agent.name,
        status,
        subtitle: cliTask || agent.modelFormatted || 'Ready',
      })
    }

    for (const cliAgent of cliAgents) {
      const key = normalizeName(cliAgent.name)
      if (merged.has(key)) continue
      merged.set(key || String(cliAgent.pid), {
        id: `cli-${cliAgent.pid}`,
        name: cliAgent.name,
        status: cliAgent.status === 'running' ? 'busy' : 'offline',
        subtitle: cliAgent.task || 'CLI agent',
      })
    }

    return Array.from(merged.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [cliAgentsQuery.data, data.agents.roster])

  return (
    <aside
      className={cn(
        'hidden h-full border-r border-primary-200/70 bg-card/90 text-primary-900 lg:flex lg:flex-col',
        collapsed ? 'w-14' : 'w-64',
      )}
      aria-label="Agent roster"
    >
      <div
        className={cn(
          'flex items-center border-b border-primary-200/60 px-2 py-2',
          collapsed ? 'justify-center' : 'justify-between gap-2 px-3',
        )}
      >
        {!collapsed ? (
          <div className="flex min-w-0 items-center gap-2">
            <HugeiconsIcon icon={UserGroupIcon} size={16} strokeWidth={1.7} />
            <span className="truncate text-xs font-semibold uppercase tracking-wide text-primary-500">
              Agents
            </span>
            <span className="rounded-full border border-primary-200 bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-primary-600">
              {rows.length}
            </span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setCollapsed((prev) => {
              const next = !prev
              try {
                localStorage.setItem(COLLAPSED_KEY, String(next))
              } catch {}
              return next
            })
          }}
          className="inline-flex size-7 items-center justify-center rounded-md text-primary-500 transition-colors hover:bg-muted hover:text-primary-700"
          aria-label={collapsed ? 'Expand agent roster' : 'Collapse agent roster'}
          title={collapsed ? 'Expand agent roster' : 'Collapse agent roster'}
        >
          <HugeiconsIcon
            icon={SidebarLeft01Icon}
            size={16}
            strokeWidth={1.6}
            className={cn(collapsed && 'rotate-180')}
          />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {rows.length === 0 ? (
          <div
            className={cn(
              'rounded-lg border border-primary-200/60 bg-muted px-2 py-2 text-xs text-primary-500',
              collapsed && 'px-0 text-center',
            )}
          >
            {collapsed ? '0' : 'No agents'}
          </div>
        ) : (
          <ul className="space-y-1">
            {rows.map((row) => (
              <li key={row.id}>
                <div
                  className={cn(
                    'flex items-center rounded-lg border border-transparent bg-muted/60 transition-colors hover:border-primary-200/50 hover:bg-muted',
                    collapsed ? 'justify-center px-1 py-2' : 'gap-2 px-2 py-1.5',
                  )}
                  title={collapsed ? `${row.name} • ${row.status}` : undefined}
                >
                  <span className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-200/70 text-xs font-semibold text-primary-700">
                    {row.name.slice(0, 1).toUpperCase()}
                    <span
                      className={cn(
                        'absolute -right-0.5 -bottom-0.5 size-2 rounded-full border border-card',
                        STATUS_DOT_CLASS[row.status],
                      )}
                    />
                  </span>
                  {!collapsed ? (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {row.name}
                      </span>
                      <span className="block truncate text-[11px] text-primary-500">
                        {row.subtitle}
                      </span>
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
