import { GlanceCard, HealthBadge, StatBlock } from './glance-card'
import { cn } from '@/lib/utils'

type SystemGlanceProps = {
  sessions: number
  activeAgents: number
  costToday: string
  uptimeFormatted: string
  updatedAgo: string
  healthStatus: 'healthy' | 'warning' | 'critical' | 'offline'
  gatewayConnected: boolean
  /** Context usage % from API (e.g. 47.3) — shown as MEMORY ring */
  sessionPercent?: number
  providers?: Array<{ name: string; cost: number; tokens: number }>
  currentModel?: string
  /** Compact single-row layout for mobile */
  compact?: boolean
}

// ─── Compact mobile variant ───────────────────────────────────────────────────

function SystemGlanceCompact({
  sessions,
  costToday,
  uptimeFormatted,
  healthStatus,
}: SystemGlanceProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/70 px-3 py-2 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/60">
      {/* Health dot */}
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          healthStatus === 'healthy' && 'animate-pulse bg-emerald-500',
          healthStatus === 'warning' && 'bg-amber-500',
          healthStatus === 'critical' && 'animate-pulse bg-red-500',
          healthStatus === 'offline' && 'bg-neutral-400',
        )}
      />

      {/* Stats — condensed for mobile */}
      <div className="flex flex-1 items-center justify-center gap-x-3">
        <span className="text-sm font-bold tabular-nums text-neutral-900 dark:text-neutral-50">{costToday}</span>
        <span className="text-neutral-300 dark:text-neutral-600">·</span>
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">{sessions} sessions</span>
        <span className="text-neutral-300 dark:text-neutral-600">·</span>
        <span className="text-xs text-neutral-400">{uptimeFormatted}</span>
      </div>
    </div>
  )
}

// ─── Full desktop variant ─────────────────────────────────────────────────────

export function SystemGlance(props: SystemGlanceProps) {
  const {
    costToday,
    uptimeFormatted,
    updatedAgo,
    healthStatus,
    gatewayConnected: gatewayConnected,
    sessionPercent: sessionPercent,
    currentModel: currentModel,
    compact = false,
  } = props

  if (compact) {
    return <SystemGlanceCompact {...props} />
  }

  return (
    <GlanceCard className="space-y-4">
      {/* Row 1: Updated timestamp + model badge | Syncing + health badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
            Updated {updatedAgo}
          </span>
          {currentModel && (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {currentModel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {gatewayConnected && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-500">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              Syncing…
            </span>
          )}
          <HealthBadge status={healthStatus} />
        </div>
      </div>

      {/* Row 2: Three stat blocks — Memory ring | Cost | Model */}
      {/* Note: Agents & Uptime are shown with detail in the metric cards row below */}
      <div className="grid grid-cols-3 gap-3">
        <StatBlock
          label="MEMORY"
          value=""
          percent={sessionPercent}
          sublabel="of context window"
        />
        <StatBlock
          label="COST"
          value={costToday}
          sublabel="today"
        />
        <StatBlock
          label="MODEL"
          value={currentModel || '—'}
          sublabel="active"
        />
      </div>

      {/* Row 3: Uptime bar */}
      <div className="rounded-xl border border-neutral-200/50 bg-neutral-50/50 p-3 dark:border-neutral-700/50 dark:bg-neutral-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
              UPTIME
            </span>
            <HealthBadge status={gatewayConnected ? 'healthy' : 'offline'} />
          </div>
          <span className="text-lg font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
            {uptimeFormatted}
          </span>
        </div>
      </div>
    </GlanceCard>
  )
}
