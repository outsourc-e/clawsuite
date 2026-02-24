import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
} from '@hugeicons/core-free-icons'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import { useCostAnalytics } from './use-cost-analytics'

type SessionSortKey = 'costUsd' | 'totalTokens' | 'lastActiveAt'
type SessionSortDir = 'asc' | 'desc'

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 3 : 2,
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value)
}

function formatTokens(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return Math.round(value).toString()
}

function formatDelta(value: number, pct: number | null) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  const amount = `${sign}${formatMoney(Math.abs(value))}`
  if (pct == null) return `${amount} vs yesterday`
  return `${amount} (${sign}${Math.abs(pct).toFixed(1)}%)`
}

function formatDateTime(ts: number | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function KpiCard({
  label,
  value,
  sub,
  delta,
}: {
  label: string
  value: string
  sub?: string
  delta?: { value: number; text: string }
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-primary-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent-500 via-accent-400/50 to-transparent"
      />
      <div className="text-[11px] uppercase tracking-wider text-primary-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-primary-900 dark:text-neutral-100">{value}</div>
      {sub ? <div className="mt-1 text-xs text-primary-500 dark:text-neutral-400">{sub}</div> : null}
      {delta ? (
        <div
          className={cn(
            'mt-2 inline-flex rounded-md px-2 py-1 text-xs font-medium',
            delta.value <= 0
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-red-500/15 text-red-300',
          )}
        >
          {delta.text}
        </div>
      ) : null}
    </div>
  )
}

export function CostsScreen() {
  const { analytics, isLoading, isFetching, isError, error, refetch } =
    useCostAnalytics()
  const [sortKey, setSortKey] = useState<SessionSortKey>('costUsd')
  const [sortDir, setSortDir] = useState<SessionSortDir>('desc')

  const modelMaxTokens = useMemo(
    () => Math.max(1, ...analytics.models.map((m) => m.totalTokens)),
    [analytics.models],
  )

  const topSessionsSorted = useMemo(() => {
    const rows = [...analytics.sessions]
    rows.sort((a, b) => {
      const av = a[sortKey] ?? 0
      const bv = b[sortKey] ?? 0
      const base = Number(av) - Number(bv)
      return sortDir === 'asc' ? base : -base
    })
    return rows.slice(0, 10)
  }, [analytics.sessions, sortDir, sortKey])

  const handleSort = (key: SessionSortKey) => {
    setSortKey((current) => {
      if (current === key) {
        setSortDir((dir) => (dir === 'desc' ? 'asc' : 'desc'))
        return current
      }
      setSortDir('desc')
      return key
    })
  }

  return (
    <div className="min-h-full bg-surface px-4 pt-5 pb-24 md:px-6 md:pt-8 text-primary-900 dark:text-neutral-100">
      <div className="mx-auto w-full max-w-[1200px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50/80 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
          <div>
            <h1 className="text-base font-semibold text-primary-900 dark:text-neutral-100">Cost & Token Analytics</h1>
            <p className="text-xs text-primary-500 dark:text-neutral-400">
              Model spend, token usage, and session-level cost breakdown.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isFetching && !isLoading ? (
              <span className="text-xs text-primary-500 dark:text-neutral-400">Refreshing…</span>
            ) : null}
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-lg border border-primary-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm text-primary-800 dark:text-neutral-200 hover:bg-primary-100 dark:hover:bg-neutral-800"
            >
              Refresh
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="rounded-xl border border-primary-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-sm text-primary-700 dark:text-neutral-300">
            Loading analytics…
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-6">
            <p className="text-sm text-red-200">
              {error instanceof Error ? error.message : 'Failed to load analytics'}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Today's Spend"
                value={formatMoney(analytics.kpis.todaySpend)}
                sub={formatMoney(analytics.kpis.yesterdaySpend) + ' yesterday'}
                delta={{
                  value: analytics.kpis.todayDelta,
                  text: formatDelta(
                    analytics.kpis.todayDelta,
                    analytics.kpis.todayDeltaPct,
                  ),
                }}
              />
              <KpiCard
                label="Month-to-Date"
                value={formatMoney(analytics.kpis.monthToDate)}
                sub="Running total"
              />
              <KpiCard
                label="Projected EOM"
                value={formatMoney(analytics.kpis.projectedEom)}
                sub="Linear projection"
              />
              <KpiCard
                label="Active Sessions"
                value={String(analytics.kpis.activeSessions)}
                sub={`${analytics.models.length} models tracked`}
              />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <section className="relative overflow-hidden rounded-xl border border-primary-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent-500 via-accent-400/50 to-transparent"
                />
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">
                    Per-Model Usage
                  </h2>
                  <div className="text-xs text-primary-500 dark:text-neutral-400">
                    Sorted by cost desc
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-[minmax(0,1.4fr)_110px_100px_minmax(120px,1fr)] gap-3 px-2 text-[11px] uppercase tracking-wider text-primary-400 dark:text-neutral-500">
                    <div>Model</div>
                    <div className="text-right">Tokens</div>
                    <div className="text-right">Cost</div>
                    <div>Usage Mix</div>
                  </div>
                  <div className="space-y-1">
                    {analytics.models.map((row) => {
                      const inputPct = (row.inputTokens / modelMaxTokens) * 100
                      const outputPct =
                        (row.outputTokens / modelMaxTokens) * 100
                      return (
                        <div
                          key={row.model}
                          className="grid grid-cols-[minmax(0,1.4fr)_110px_100px_minmax(120px,1fr)] items-center gap-3 rounded-lg border border-primary-200 dark:border-neutral-800/80 bg-primary-50 dark:bg-neutral-950/60 px-2 py-2"
                        >
                          <div className="truncate text-sm text-primary-900 dark:text-neutral-100">
                            {row.model}
                          </div>
                          <div className="text-right text-sm tabular-nums text-primary-700 dark:text-neutral-300">
                            {formatTokens(row.totalTokens)}
                          </div>
                          <div className="text-right text-sm tabular-nums text-primary-800 dark:text-neutral-200">
                            {formatMoney(row.costUsd)}
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-primary-100 dark:bg-neutral-800">
                            <div className="flex h-full w-full">
                              <div
                                className="bg-blue-500"
                                style={{ width: `${Math.min(100, inputPct)}%` }}
                                title={`Input: ${formatTokens(row.inputTokens)}`}
                              />
                              <div
                                className="bg-purple-500"
                                style={{
                                  width: `${Math.min(100, outputPct)}%`,
                                }}
                                title={`Output: ${formatTokens(row.outputTokens)}`}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {analytics.models.length === 0 ? (
                      <div className="rounded-lg border border-primary-200 dark:border-neutral-800 px-3 py-6 text-center text-sm text-primary-500 dark:text-neutral-400">
                        No model usage data available.
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-primary-500 dark:text-neutral-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-blue-500" />
                    Input tokens
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-purple-500" />
                    Output tokens
                  </span>
                </div>
              </section>

              <section className="relative overflow-hidden rounded-xl border border-primary-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent-500 via-accent-400/50 to-transparent"
                />
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">
                    Daily Cost Trend
                  </h2>
                  <div className="text-xs text-primary-500 dark:text-neutral-400">Last 30 days</div>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.daily}>
                      <CartesianGrid stroke="#262626" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#a3a3a3', fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: '#404040' }}
                        interval={4}
                      />
                      <YAxis
                        tick={{ fill: '#a3a3a3', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number | string) => `$${v}`}
                        width={44}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                        contentStyle={{
                          background: '#171717',
                          border: '1px solid #262626',
                          borderRadius: '0.75rem',
                          color: '#e5e5e5',
                        }}
                      />
                      <Bar
                        dataKey="amount"
                        fill="#22c55e"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>

            <section className="relative overflow-hidden rounded-xl border border-primary-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent-500 via-accent-400/50 to-transparent"
              />
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">
                    Session Cost Breakdown
                  </h2>
                  <p className="mt-1 text-xs text-primary-500 dark:text-neutral-400">
                    Top 10 most expensive sessions
                  </p>
                </div>
                <div className="text-xs text-primary-500 dark:text-neutral-400">
                  Total tracked: {formatTokens(analytics.totals.tokens)} tokens ·{' '}
                  {formatMoney(analytics.totals.costUsd)}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-primary-200 dark:border-neutral-800 text-left text-[11px] uppercase tracking-wider text-primary-400 dark:text-neutral-500">
                      <th className="px-2 py-2 font-medium">Session Key</th>
                      <th className="px-2 py-2 font-medium">Model</th>
                      <th className="px-2 py-2 font-medium text-right">
                        <button
                          type="button"
                          onClick={() => handleSort('totalTokens')}
                          className="inline-flex items-center gap-1"
                        >
                          Tokens
                        </button>
                      </th>
                      <th className="px-2 py-2 font-medium text-right">
                        <button
                          type="button"
                          onClick={() => handleSort('costUsd')}
                          className="inline-flex items-center gap-1"
                        >
                          Cost
                          {sortKey === 'costUsd' ? (
                            <HugeiconsIcon
                              icon={
                                sortDir === 'desc'
                                  ? ArrowDown01Icon
                                  : ArrowUp01Icon
                              }
                              size={12}
                              strokeWidth={2}
                            />
                          ) : null}
                        </button>
                      </th>
                      <th className="px-2 py-2 font-medium text-right">
                        <button
                          type="button"
                          onClick={() => handleSort('lastActiveAt')}
                          className="inline-flex items-center gap-1"
                        >
                          Last Active
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSessionsSorted.map((row) => (
                      <tr
                        key={row.sessionKey}
                        className="border-b border-primary-200/80 dark:border-neutral-900/80 hover:bg-primary-50/80 dark:hover:bg-neutral-950/60"
                      >
                        <td className="px-2 py-2 font-mono text-xs text-primary-700 dark:text-neutral-300">
                          <div className="max-w-[280px] truncate">{row.sessionKey}</div>
                        </td>
                        <td className="px-2 py-2 text-primary-800 dark:text-neutral-200">{row.model}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-primary-700 dark:text-neutral-300">
                          {formatTokens(row.totalTokens)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-primary-900 dark:text-neutral-100">
                          {formatMoney(row.costUsd)}
                        </td>
                        <td className="px-2 py-2 text-right text-primary-500 dark:text-neutral-400">
                          {formatDateTime(row.lastActiveAt)}
                        </td>
                      </tr>
                    ))}
                    {topSessionsSorted.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-2 py-6 text-center text-sm text-primary-500 dark:text-neutral-400"
                        >
                          No session data available.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
