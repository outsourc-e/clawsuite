import { cn } from '@/lib/utils'
import type { DashboardData } from '../hooks/use-dashboard-data'
import { formatMoney } from '../lib/formatters'

type CockpitMetricsGridProps = {
  data: DashboardData
  uptimeDisplay: string
  className?: string
}

type MetricTile = {
  label: string
  value: string
  tone?: 'default' | 'accent' | 'muted'
}

function MetricTile({ label, value, tone = 'default' }: MetricTile) {
  return (
    <div className="rounded-xl border border-primary-200/80 bg-primary-100 p-2.5 dark:bg-primary-50">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-primary-500">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-mono text-sm font-medium tabular-nums',
          tone === 'accent' && 'text-accent-500 dark:text-accent-400',
          tone === 'muted' && 'text-primary-500',
          tone === 'default' && 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  )
}

export function CockpitMetricsGrid({
  data,
  uptimeDisplay,
  className,
}: CockpitMetricsGridProps) {
  const activeSessions = data.sessions.active || data.agents.active || 0
  const gatewayValue = data.connection.connected ? 'Connected' : 'Offline'

  return (
    <section
      className={cn(
        'grid grid-cols-2 gap-2 rounded-2xl border border-primary-200 bg-primary-50 p-2.5 dark:bg-primary-100',
        className,
      )}
      aria-label="Cockpit metrics"
    >
      <MetricTile label="Cost Today" value={formatMoney(data.todayCostUsd ?? data.cost.today)} />
      <MetricTile label="Active Sessions" value={String(activeSessions)} />
      <MetricTile
        label="Gateway Status"
        value={gatewayValue}
        tone={data.connection.connected ? 'accent' : 'muted'}
      />
      <MetricTile label="Uptime" value={uptimeDisplay} />
    </section>
  )
}
