import {
  Activity01Icon,
  ChartLineData02Icon,
  Timer02Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { DashboardIcon } from './dashboard-types'

type HeroMetric = {
  label: string
  value: string
  icon: DashboardIcon
}

type HeroMetricsRowProps = {
  totalSessions: number
  activeAgents: number
  uptimeSeconds: number
  totalSpend: string
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function HeroMetricsRow({
  totalSessions,
  activeAgents,
  uptimeSeconds,
  totalSpend,
}: HeroMetricsRowProps) {
  const metrics: Array<HeroMetric> = [
    { label: 'Total Sessions', value: `${totalSessions}`, icon: Activity01Icon },
    { label: 'Active Agents', value: `${activeAgents}`, icon: UserGroupIcon },
    { label: 'Uptime', value: formatUptime(uptimeSeconds), icon: Timer02Icon },
    { label: 'Cost', value: totalSpend, icon: ChartLineData02Icon },
  ]

  return (
    <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="flex items-center gap-2.5 rounded-lg border border-primary-200 bg-primary-50/80 px-3 py-2.5 dark:bg-primary-50/90"
        >
          <HugeiconsIcon icon={m.icon} size={15} strokeWidth={1.5} className="shrink-0 text-primary-400" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tabular-nums text-ink leading-tight">
              {m.value}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-primary-400 leading-tight">{m.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
