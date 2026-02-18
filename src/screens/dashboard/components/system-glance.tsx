import { GlanceCard, HealthBadge, ProviderPill, StatBlock } from './glance-card'
import { useState } from 'react'

type SystemGlanceProps = {
  sessions: number
  activeAgents: number
  costToday: string
  uptimeFormatted: string
  updatedAgo: string
  healthStatus: 'healthy' | 'warning' | 'critical' | 'offline'
  gatewayConnected: boolean
  sessionPercent?: number
  costPercent?: number
  providers?: Array<{ name: string; cost: number; tokens: number }>
  currentModel?: string
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function SystemGlance({
  sessions,
  activeAgents,
  costToday,
  uptimeFormatted,
  updatedAgo,
  healthStatus,
  gatewayConnected,
  sessionPercent,
  costPercent,
  providers = [],
  currentModel,
}: SystemGlanceProps) {
  const [activeProvider, setActiveProvider] = useState<string | null>(null)

  const filteredProviders = activeProvider
    ? providers.filter((p) => p.name === activeProvider)
    : providers

  return (
    <GlanceCard className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-500 text-sm font-bold text-white shadow-sm">
            CS
          </div>
          <div>
            <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-50">
              ClawSuite
            </h2>
            <p className="text-[10px] text-neutral-400">AI Agent Monitor</p>
          </div>
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

      {/* Provider pills */}
      {providers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {providers.map((p) => (
            <ProviderPill
              key={p.name}
              name={p.name}
              active={activeProvider === p.name}
              onClick={() =>
                setActiveProvider((prev) => (prev === p.name ? null : p.name))
              }
            />
          ))}
        </div>
      )}

      {/* Updated timestamp + model */}
      <div className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-orange-500/15 text-[10px] font-bold text-orange-500">
          S
        </span>
        <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
          Updated {updatedAgo}
        </span>
        {currentModel && (
          <span className="ml-auto rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            {currentModel}
          </span>
        )}
      </div>

      {/* Main stat grid — 2 rings + health */}
      <div className="grid grid-cols-3 gap-3">
        <StatBlock
          label="SESSION"
          value={sessions}
          percent={sessionPercent}
          badge={healthStatus}
          sublabel={`${sessions} active`}
        />
        <StatBlock
          label="COST"
          value={costToday}
          percent={costPercent}
          sublabel={costToday}
        />
        <StatBlock
          label="AGENTS"
          value={activeAgents}
          sublabel={`${activeAgents} running`}
        />
      </div>

      {/* GPU-style bar — uptime */}
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

      {/* Provider cost breakdown (when filtered) */}
      {filteredProviders.length > 0 && (
        <div className="space-y-1.5">
          {filteredProviders.map((p) => (
            <div
              key={p.name}
              className="flex items-center justify-between rounded-lg bg-neutral-50/50 px-3 py-1.5 dark:bg-neutral-800/50"
            >
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                {p.name}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] tabular-nums text-neutral-400">
                  {formatCompact(p.tokens)} tok
                </span>
                <span className="text-xs font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
                  ${p.cost.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlanceCard>
  )
}
