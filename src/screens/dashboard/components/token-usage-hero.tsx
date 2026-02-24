import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { DashboardData } from '../hooks/use-dashboard-data'
import { formatMoney, formatTokens } from '../lib/formatters'

type TokenUsageHeroProps = {
  data: DashboardData
  className?: string
}

type SparkPoint = { date: string; value: number }

function MicroSparkBars({ data, accentClass }: { data: SparkPoint[]; accentClass: string }) {
  const slice = data.slice(-10)
  if (slice.length === 0) {
    return <div className="h-8 rounded-md border border-primary-200 dark:border-neutral-800/70 bg-white dark:bg-neutral-900/40" />
  }

  const maxVal = Math.max(...slice.map((p) => p.value), 1)

  return (
    <div className="flex h-8 items-end gap-1">
      {slice.map((point, index) => {
        const rawHeight = Math.round((point.value / maxVal) * 32)
        const height = point.value > 0 ? Math.max(3, rawHeight) : 2
        const isLatest = index === slice.length - 1
        return (
          <div
            key={`${point.date}-${index}`}
            className={cn(
              'flex-1 rounded-[3px] bg-primary-100 dark:bg-neutral-800/90 transition-[height] duration-300',
              isLatest && accentClass,
              point.value === 0 && 'opacity-40',
            )}
            style={{ height }}
            title={`${point.date}: ${point.value}`}
          />
        )
      })}
    </div>
  )
}

function formatCompactInt(n: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Math.max(0, n))
}

function formatCostChangeLabel(points: Array<{ date: string; amount: number }>): string {
  const slice = points.slice(-2)
  const latest = slice.at(-1)?.amount ?? 0
  const previous = slice.at(-2)?.amount ?? 0
  if (previous <= 0) return latest > 0 ? 'new activity' : 'flat'
  const pct = ((latest - previous) / previous) * 100
  if (!Number.isFinite(pct)) return 'flat'
  const rounded = Math.round(Math.abs(pct))
  if (rounded === 0) return 'flat'
  return `${pct >= 0 ? '+' : '-'}${rounded}% vs prev`
}

export function TokenUsageHero({ data, className }: TokenUsageHeroProps) {
  const costPoints = useMemo(
    () => data.timeseries.costByDay.map((point) => ({ date: point.date, value: point.amount })),
    [data.timeseries.costByDay],
  )
  const sessionPoints = useMemo(
    () => data.timeseries.sessionsByDay.map((point) => ({ date: point.date, value: point.count })),
    [data.timeseries.sessionsByDay],
  )

  const activeSessions = data.sessions.active || data.agents.active || data.sessions.total || 0
  const topModels = useMemo(() => {
    const top = data.cost.byModel.slice(0, 3)
    const maxCost = Math.max(1, ...top.map((m) => m.cost))
    return top.map((model, index) => ({
      ...model,
      widthPct: Math.max(6, (model.cost / maxCost) * 100),
      barClass:
        index % 3 === 0
          ? 'bg-blue-400'
          : index % 3 === 1
            ? 'bg-violet-400'
            : 'bg-emerald-400',
    }))
  }, [data.cost.byModel])

  const totalCostToday = data.todayCostUsd ?? data.cost.today

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl border border-primary-200 dark:border-neutral-800 bg-primary-50 dark:bg-neutral-950 p-4 text-primary-900 dark:text-neutral-100 shadow-[0_12px_36px_rgba(0,0,0,0.28)]',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-orange-500 via-orange-400/50 to-transparent"
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-primary-500 dark:text-neutral-400">TOKEN USAGE</p>
          <p className="mt-2 font-mono text-3xl font-semibold leading-none tabular-nums text-primary-900 dark:text-neutral-50 md:text-4xl">
            {formatTokens(data.usage.tokens)}
          </p>
          <p className="mt-1 text-xs text-primary-500 dark:text-neutral-400">tokens used today</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.14em] text-primary-400 dark:text-neutral-500">Today</p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-primary-900 dark:text-neutral-50">
            {formatMoney(totalCostToday)}
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-400">{formatCostChangeLabel(data.timeseries.costByDay)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-primary-200 dark:border-neutral-800 bg-primary-50/80 dark:bg-neutral-900/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-primary-500 dark:text-neutral-400">COST</p>
            <p className="font-mono text-sm tabular-nums text-primary-900 dark:text-neutral-100">{formatMoney(totalCostToday)}</p>
          </div>
          <div className="mt-2">
            <MicroSparkBars data={costPoints} accentClass="bg-emerald-400" />
          </div>
        </div>

        <div className="rounded-xl border border-primary-200 dark:border-neutral-800 bg-primary-50/80 dark:bg-neutral-900/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-primary-500 dark:text-neutral-400">ACTIVE SESSIONS</p>
            <p className="font-mono text-sm tabular-nums text-primary-900 dark:text-neutral-100">{formatCompactInt(activeSessions)}</p>
          </div>
          <div className="mt-2">
            <MicroSparkBars data={sessionPoints} accentClass="bg-blue-400" />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-primary-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-primary-500 dark:text-neutral-400">TOP MODELS</p>
          <p className="text-[11px] text-primary-400 dark:text-neutral-500">sorted by cost</p>
        </div>

        {topModels.length === 0 ? (
          <p className="mt-3 text-xs text-primary-400 dark:text-neutral-500">No model usage yet today.</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {topModels.map((model) => (
              <div key={model.model} className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="truncate text-sm font-medium text-primary-900 dark:text-neutral-100">{model.model}</p>
                  <p className="font-mono text-[11px] tabular-nums text-primary-700 dark:text-neutral-300">
                    {formatTokens(model.tokens)} · {formatMoney(model.cost)}
                  </p>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary-100 dark:bg-neutral-800">
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-500', model.barClass)}
                    style={{ width: `${model.widthPct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
