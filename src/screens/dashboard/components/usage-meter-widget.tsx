import { ChartLineData02Icon } from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { WidgetShell } from './widget-shell'
import { cn } from '@/lib/utils'

type ProviderUsage = {
  provider: string
  total: number
  inputOutput: number
  cached: number
  cost: number
  directCost: number
  percentUsed?: number
}

export type UsageMeterData = {
  usagePercent?: number
  usageLimit?: number
  totalCost: number
  totalDirectCost: number
  totalUsage: number
  totalInputOutput: number
  totalCached: number
  providers: Array<ProviderUsage>
  sessionCount?: number
}

type UsageApiResponse = {
  ok?: boolean
  usage?: unknown
  unavailable?: boolean
  error?: unknown
}

export type UsageQueryResult =
  | { kind: 'ok'; data: UsageMeterData }
  | { kind: 'unavailable'; message: string }
  | { kind: 'error'; message: string }

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function parseProviderUsage(provider: string, value: unknown): ProviderUsage {
  const source = toRecord(value)
  const input = readNumber(source.input)
  const output = readNumber(source.output)
  const cacheRead = readNumber(source.cacheRead)
  const cacheWrite = readNumber(source.cacheWrite)
  const inputCost = readNumber(source.inputCost)
  const outputCost = readNumber(source.outputCost)

  return {
    provider,
    total: readNumber(source.total),
    inputOutput: input + output,
    cached: cacheRead + cacheWrite,
    cost: readNumber(source.cost),
    directCost: inputCost + outputCost,
    percentUsed: readNumber(source.percentUsed) || undefined,
  }
}

function parseUsagePayload(payload: unknown): UsageMeterData {
  const root = toRecord(payload)
  const totalSource = toRecord(root.total)
  const byProviderSource = toRecord(root.byProvider)

  const providers = Object.entries(byProviderSource)
    .map(function mapProvider([provider, value]) {
      return parseProviderUsage(provider, value)
    })
    .sort(function sortProvidersByUsage(left, right) {
      return right.total - left.total
    })

  const totalUsageRaw = readNumber(totalSource.total)
  const totalUsage =
    totalUsageRaw > 0
      ? totalUsageRaw
      : providers.reduce(function sumUsage(total, provider) {
          return total + provider.total
        }, 0)

  const totalInputOutput = providers.reduce(function sumIO(total, provider) {
    return total + provider.inputOutput
  }, 0)

  const totalCached = providers.reduce(function sumCached(total, provider) {
    return total + provider.cached
  }, 0)

  const totalCostRaw = readNumber(totalSource.cost)
  const totalCost =
    totalCostRaw > 0
      ? totalCostRaw
      : providers.reduce(function sumCost(total, provider) {
          return total + provider.cost
        }, 0)

  const totalDirectCost = providers.reduce(function sumDirectCost(
    total,
    provider,
  ) {
    return total + provider.directCost
  }, 0)

  const totalPercent = readNumber(totalSource.percentUsed)
  const maxProviderPercent = providers.reduce(function readMaxPercent(
    currentMax,
    provider,
  ) {
    if (provider.percentUsed === undefined) return currentMax
    return provider.percentUsed > currentMax ? provider.percentUsed : currentMax
  }, 0)
  const usagePercent =
    totalPercent > 0
      ? totalPercent
      : maxProviderPercent > 0
        ? maxProviderPercent
        : undefined

  const usageLimitRaw =
    readNumber(totalSource.limit) ||
    readNumber(totalSource.max) ||
    readNumber(totalSource.quota) ||
    readNumber(totalSource.tokenLimit)
  const usageLimit = usageLimitRaw > 0 ? usageLimitRaw : undefined

  return {
    usagePercent,
    usageLimit,
    totalCost,
    totalDirectCost,
    totalUsage,
    totalInputOutput,
    totalCached,
    providers,
  }
}

/** Fetch a URL with a hard timeout; returns null on timeout or network error. */
function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { signal: controller.signal })
    .catch(() => null)
    .finally(() => clearTimeout(timer))
}

export async function fetchUsage(): Promise<UsageQueryResult> {
  try {
    // Fire both in parallel, each with a hard timeout to prevent hanging.
    // session-status is lower priority — give usage a longer window.
    const [usageRes, ssRes] = await Promise.all([
      fetchWithTimeout('/api/usage', 10_000),
      fetchWithTimeout('/api/session-status', 8_000),
    ])

    const usagePayload = usageRes
      ? ((await usageRes.json().catch(() => ({}))) as UsageApiResponse)
      : ({} as UsageApiResponse)

    if (usageRes?.status === 501 || usagePayload.unavailable) {
      return {
        kind: 'unavailable',
        message: 'Unavailable on this Gateway version',
      }
    }

    // Parse lifetime data
    const data = usagePayload.usage
      ? parseUsagePayload(usagePayload.usage)
      : parseUsagePayload({})

    // Overlay today's data from session-status if available
    if (ssRes?.ok) {
      const ssPayload = (await ssRes.json().catch(() => ({}))) as Record<
        string,
        unknown
      >
      const payload = (ssPayload.payload ?? ssPayload) as Record<
        string,
        unknown
      >
      const dailyCost = readNumber(payload.dailyCost ?? payload.costUsd)
      const dailyTokens = readNumber(payload.totalTokens)
      const sessions = Array.isArray(payload.sessions)
        ? (payload.sessions as Array<Record<string, unknown>>)
        : []
      const oneDayAgo = Date.now() - 86_400_000
      const activeSessions = sessions.filter((s) => {
        if (typeof s.updatedAt === 'number' && (s.updatedAt as number) <= oneDayAgo) return false
        const key = readString(s.key ?? '')
        const label = readString(s.label ?? '')
        // Exclude subagent sessions from the count
        return (
          !key.startsWith('agent:main:subagent:') &&
          !key.includes('subagent') &&
          !label.toLowerCase().includes('subagent')
        )
      })

      // Override with today's data — this is what matters
      if (dailyCost > 0) data.totalCost = dailyCost
      if (dailyTokens > 0) data.totalUsage = dailyTokens

      // Build provider breakdown from models array if available
      const models = payload.models as
        | Array<Record<string, unknown>>
        | undefined
      if (models && models.length > 0) {
        data.providers = models
          .filter((m) => readString(m.provider) || readString(m.model))
          .map((m) => ({
            provider: readString(m.provider) || readString(m.model),
            total:
              readNumber(m.inputTokens) +
              readNumber(m.outputTokens),
            inputOutput:
              readNumber(m.inputTokens) +
              readNumber(m.outputTokens),
            cached: 0,
            cost: readNumber(m.costUsd),
            directCost: readNumber(m.costUsd),
            percentUsed: undefined,
          }))
          .sort((a, b) => b.cost - a.cost)
      }

      // Clear meaningless usage% — we only show cost + tokens
      data.usagePercent = undefined
      data.usageLimit = undefined

      // Store active session count for display
      data.sessionCount = activeSessions.length
    }

    return { kind: 'ok', data }
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Usage unavailable',
    }
  }
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return new Intl.NumberFormat().format(Math.max(0, Math.round(tokens)))
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function getProviderBarColor(provider: string): string {
  const p = provider.toLowerCase()
  if (p.includes('anthropic')) return 'bg-purple-500'
  if (p.includes('openrouter')) return 'bg-emerald-500'
  if (p.includes('openclaw')) return 'bg-blue-500'
  if (p.includes('openai')) return 'bg-amber-500'
  if (p.includes('google')) return 'bg-red-500'
  if (p.includes('gemini')) return 'bg-red-500'
  return 'bg-neutral-500'
}

function getProviderTextColor(provider: string): string {
  const p = provider.toLowerCase()
  if (p.includes('anthropic')) return 'text-purple-600 dark:text-purple-400'
  if (p.includes('openrouter')) return 'text-emerald-600 dark:text-emerald-400'
  if (p.includes('openclaw')) return 'text-blue-600 dark:text-blue-400'
  if (p.includes('openai')) return 'text-amber-600 dark:text-amber-400'
  if (p.includes('google')) return 'text-red-600 dark:text-red-400'
  if (p.includes('gemini')) return 'text-red-600 dark:text-red-400'
  return 'text-neutral-600 dark:text-neutral-400'
}

function capitalizeProvider(name: string): string {
  if (!name) return '—'
  // Keep known names clean
  const lower = name.toLowerCase()
  if (lower === 'anthropic') return 'Anthropic'
  if (lower === 'openrouter') return 'OpenRouter'
  if (lower === 'openclaw') return 'OpenClaw'
  if (lower === 'openai') return 'OpenAI'
  if (lower === 'google') return 'Google'
  if (lower === 'gemini') return 'Gemini'
  return name.charAt(0).toUpperCase() + name.slice(1)
}

type UsageMeterWidgetProps = {
  draggable?: boolean
  onRemove?: () => void
  editMode?: boolean
}

export function UsageMeterWidget({
  draggable: _draggable = false,
  onRemove,
  editMode,
}: UsageMeterWidgetProps) {
  const [view, setView] = useState<'tokens' | 'cost'>('cost')
  const [timedOut, setTimedOut] = useState(false)
  const usageQuery = useQuery({
    queryKey: ['dashboard', 'usage'],
    queryFn: fetchUsage,
    retry: false,
    refetchInterval: 30_000,
  })

  const isLoading = usageQuery.isLoading || (usageQuery.isFetching && !usageQuery.data)
  const queryResult = usageQuery.data
  const usageData = queryResult?.kind === 'ok' ? queryResult.data : null
  // Show skeleton while the very first fetch is in flight (no data at all yet)
  const showSkeleton = isLoading && !queryResult

  // 15s hard timeout — stops infinite skeleton
  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false)
      return
    }
    const timer = window.setTimeout(() => setTimedOut(true), 15_000)
    return () => window.clearTimeout(timer)
  }, [isLoading])

  const topProviders = useMemo(() => {
    if (!usageData || usageData.providers.length === 0) return []
    const maxCost = Math.max(...usageData.providers.map((p) => p.cost))
    return usageData.providers.slice(0, 5).map((p) => ({
      ...p,
      barWidth: maxCost > 0 ? (p.cost / maxCost) * 100 : 0,
    }))
  }, [usageData])

  const tabSwitcher = (
    <div className="hidden items-center gap-0.5 rounded-full border border-primary-200 bg-primary-100/70 p-0.5 text-[10px] md:inline-flex">
      {(['cost', 'tokens'] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setView(tab)
          }}
          className={cn(
            'rounded-full px-2 py-0.5 font-medium transition-colors',
            view === tab
              ? 'bg-accent-100 text-accent-700 shadow-sm'
              : 'text-primary-500 hover:text-primary-700',
          )}
        >
          {tab === 'tokens' ? 'Tokens' : 'Cost'}
        </button>
      ))}
    </div>
  )

  const showTimeoutOrError = (showSkeleton && timedOut) || queryResult?.kind === 'error' || queryResult?.kind === 'unavailable'

  return (
    <WidgetShell
      size="medium"
      title="Usage Today"
      icon={ChartLineData02Icon}
      action={!showSkeleton ? tabSwitcher : undefined}
      onRemove={onRemove}
      editMode={editMode}
      loading={showSkeleton && !timedOut}
      className="h-full"
    >
      {showTimeoutOrError ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-3 dark:border-amber-900/40 dark:bg-amber-950/15">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Usage unavailable</p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            {queryResult?.kind === 'unavailable'
              ? queryResult.message
              : timedOut
                ? 'Request timed out. Check gateway connection.'
                : (queryResult as { kind: 'error'; message: string } | undefined)?.message ?? 'Could not load usage data.'}
          </p>
          <button
            type="button"
            onClick={() => { setTimedOut(false); void usageQuery.refetch() }}
            className="rounded-md border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
          >
            Retry
          </button>
        </div>
      ) : !usageData ? null : (
        <>
          {/* Mobile layout */}
          <div className="space-y-3 md:hidden">
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold leading-none tabular-nums text-neutral-900 dark:text-neutral-50">
                {view === 'cost' ? formatUsd(usageData.totalCost) : formatTokens(usageData.totalUsage)}
              </p>
              <span className="text-xs text-neutral-400">{view === 'cost' ? 'today' : 'tokens'}</span>
            </div>

            <div className="inline-flex rounded-full bg-neutral-100/70 p-1 dark:bg-neutral-800/50 gap-1">
              {(['cost', 'tokens'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setView(tab)
                  }}
                  className={cn(
                    'px-3 py-1 text-xs rounded-full transition-colors',
                    view === tab
                      ? 'bg-white shadow-sm dark:bg-neutral-900'
                      : 'text-neutral-600 dark:text-neutral-300',
                  )}
                >
                  {tab === 'tokens' ? 'Tokens' : 'Cost'}
                </button>
              ))}
            </div>

            {/* Mobile provider bars */}
            {topProviders.length > 0 && (
              <div className="space-y-2">
                {topProviders.map((p) => (
                  <div key={p.provider} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className={cn('text-[11px] font-semibold', getProviderTextColor(p.provider))}>
                        {capitalizeProvider(p.provider)}
                      </span>
                      <span className="text-[11px] tabular-nums text-neutral-700 dark:text-neutral-300">
                        {view === 'cost' ? formatUsd(p.cost) : formatTokens(p.total)}
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-200/60 dark:bg-neutral-800/60">
                      <div
                        className={cn('h-1 rounded-full transition-[width] duration-500', getProviderBarColor(p.provider))}
                        style={{ width: `${p.barWidth}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desktop layout */}
          <div className="hidden space-y-3 md:block">
            {/* Hero numbers */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-2xl font-bold leading-none text-ink tabular-nums">
                  {view === 'cost' ? formatUsd(usageData.totalCost) : formatTokens(usageData.totalUsage)}
                </p>
                <p className="mt-1 text-[11px] text-primary-500">
                  {view === 'cost' ? 'today\'s spend' : 'tokens today'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-semibold tabular-nums text-neutral-700 dark:text-neutral-300">
                  {view === 'cost' ? formatTokens(usageData.totalUsage) : formatUsd(usageData.totalCost)}
                </p>
                <p className="mt-0.5 text-[11px] text-primary-400">
                  {view === 'cost' ? 'tokens' : 'spend'}
                </p>
              </div>
            </div>

            {/* Provider breakdown bars */}
            {topProviders.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                  By Provider
                </p>
                {topProviders.map((p) => (
                  <div key={p.provider} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('text-[11px] font-semibold', getProviderTextColor(p.provider))}>
                        {capitalizeProvider(p.provider)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] tabular-nums text-neutral-400">
                          {formatTokens(p.total)} tok
                        </span>
                        <span className="text-[11px] font-semibold tabular-nums text-neutral-800 dark:text-neutral-200">
                          {formatUsd(p.cost)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200/80 dark:bg-neutral-700/70">
                      <div
                        className={cn(
                          'h-1.5 rounded-full transition-[width] duration-500',
                          getProviderBarColor(p.provider),
                        )}
                        style={{ width: `${p.barWidth}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {view === 'cost' ? (
                  <p className="text-xs text-primary-600">
                    Direct: {formatUsd(usageData.totalDirectCost)} • Total: {formatUsd(usageData.totalCost)}
                  </p>
                ) : (
                  <p className="text-xs text-primary-600">
                    In/Out: {formatTokens(usageData.totalInputOutput)} • Cached: {formatTokens(usageData.totalCached)}
                  </p>
                )}
              </div>
            )}

            {/* Session count if available */}
            {typeof usageData.sessionCount === 'number' && usageData.sessionCount > 0 && (
              <p className="text-[10px] text-neutral-400">
                {usageData.sessionCount} active session{usageData.sessionCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </>
      )}
    </WidgetShell>
  )
}
