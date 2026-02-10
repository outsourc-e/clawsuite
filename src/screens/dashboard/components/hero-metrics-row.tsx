import {
  Activity01Icon,
  AiChipIcon,
  ChartLineData02Icon,
  Timer02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { DashboardIcon } from './dashboard-types'

type HeroMetric = {
  label: string
  value: string
  icon: DashboardIcon
  accent?: 'green' | 'amber' | 'blue' | 'default'
}

type HeroMetricsRowProps = {
  currentModel: string
  uptimeSeconds: number
  sessionCount: number
  totalSpend: string
  gatewayConnected: boolean
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

const accentColors = {
  green: 'border-emerald-200 bg-emerald-50/60',
  amber: 'border-amber-200 bg-amber-50/60',
  blue: 'border-blue-200 bg-blue-50/60',
  default: 'border-primary-200 bg-primary-50/60',
} as const

export function HeroMetricsRow({
  currentModel,
  uptimeSeconds,
  sessionCount,
  totalSpend,
  gatewayConnected,
}: HeroMetricsRowProps) {
  const metrics: HeroMetric[] = [
    {
      label: 'Current Model',
      value: currentModel || '—',
      icon: AiChipIcon,
      accent: 'blue',
    },
    {
      label: 'Sessions',
      value: `${sessionCount}`,
      icon: Activity01Icon,
      accent: gatewayConnected ? 'green' : 'default',
    },
    {
      label: 'Uptime',
      value: formatUptime(uptimeSeconds),
      icon: Timer02Icon,
      accent: 'default',
    },
    {
      label: 'Period Spend',
      value: totalSpend,
      icon: ChartLineData02Icon,
      accent: 'amber',
    },
  ]

  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className={`flex items-center gap-3 rounded-xl border p-3 backdrop-blur-sm transition-colors ${accentColors[m.accent ?? 'default']}`}
        >
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary-200/50 bg-white/70 text-primary-600">
            <HugeiconsIcon icon={m.icon} size={16} strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tabular-nums text-ink leading-tight">
              {m.value}
            </p>
            <p className="text-[11px] text-primary-500 leading-tight">{m.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
