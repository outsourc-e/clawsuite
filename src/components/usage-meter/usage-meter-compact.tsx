'use client'

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const POLL_INTERVAL_MS = 30_000

type UsageLine = {
  type: 'progress' | 'text' | 'badge'
  label: string
  used?: number
  limit?: number
  format?: 'percent' | 'dollars' | 'tokens'
  value?: string
  color?: string
  resetsAt?: string
}

type ProviderUsageEntry = {
  provider: string
  displayName: string
  status: 'ok' | 'missing_credentials' | 'auth_expired' | 'error'
  message?: string
  plan?: string
  lines: Array<UsageLine>
  updatedAt: number
}

type SessionStatusResponse = {
  ok?: boolean
  payload?: unknown
  error?: string
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function readPercent(value: unknown): number {
  const num = readNumber(value)
  if (num <= 1 && num > 0) return num * 100
  return num
}

function parseContextPercent(payload: unknown): number {
  const root = payload && typeof payload === 'object' ? (payload as any) : {}
  const usage = root.today ?? root.usage ?? root.summary ?? root.totals ?? root
  return readPercent(
    usage?.contextPercent ??
      usage?.context_percent ??
      usage?.context ??
      root?.contextPercent ??
      root?.context_percent,
  )
}

function barColor(pct: number): string {
  if (pct >= 80) return 'bg-red-500'
  if (pct >= 60) return 'bg-amber-400'
  return 'bg-emerald-500'
}

function textColor(pct: number): string {
  if (pct >= 80) return 'text-red-500'
  if (pct >= 60) return 'text-amber-500'
  return 'text-emerald-600'
}

type UsageRow = {
  label: string
  pct: number
}

export function UsageMeterCompact() {
  const [contextPct, setContextPct] = useState<number | null>(null)
  const [weeklyPct, setWeeklyPct] = useState<number | null>(null)
  const [providerLabel, setProviderLabel] = useState<string | null>(null)

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session-status')
      if (!res.ok) return
      const data = (await res.json()) as SessionStatusResponse
      const payload = data.payload ?? data
      const pct = parseContextPercent(payload)
      setContextPct(Math.min(100, Math.round(pct)))
    } catch {
      // silent fail — compact meter shows nothing on error
    }
  }, [])

  const fetchProvider = useCallback(async () => {
    try {
      const res = await fetch('/api/provider-usage')
      if (!res.ok) return
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean
        providers?: Array<ProviderUsageEntry>
      } | null
      if (!data?.providers) return

      const primary = data.providers.find(
        (p) => p.status === 'ok' && p.lines.length > 0,
      )
      if (!primary) return

      // Grab the "Weekly" percent line (first one found)
      const weeklyLine = primary.lines.find(
        (l) =>
          l.type === 'progress' &&
          l.format === 'percent' &&
          l.label?.toLowerCase().includes('weekly') &&
          l.used !== undefined,
      )
      if (weeklyLine?.used !== undefined) {
        setWeeklyPct(Math.min(100, Math.round(weeklyLine.used)))
      }

      // Provider label: displayName (first word) + plan if short
      const name = primary.displayName.split(' ')[0]
      const label = primary.plan
        ? `${name} ${primary.plan}`
        : name
      setProviderLabel(label.length > 14 ? name : label)
    } catch {
      // silent fail
    }
  }, [])

  useEffect(() => {
    void fetchSession()
    void fetchProvider()
    const sessionInterval = window.setInterval(fetchSession, POLL_INTERVAL_MS)
    const providerInterval = window.setInterval(fetchProvider, POLL_INTERVAL_MS)
    return () => {
      window.clearInterval(sessionInterval)
      window.clearInterval(providerInterval)
    }
  }, [fetchSession, fetchProvider])

  // Don't render until we have at least session data
  if (contextPct === null) return null

  const rows: UsageRow[] = [
    { label: 'Ctx', pct: contextPct },
    ...(weeklyPct !== null ? [{ label: 'Wkly', pct: weeklyPct }] : []),
  ]

  return (
    <div className="space-y-1.5 px-1">
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-neutral-400">
        {providerLabel ? `Usage · ${providerLabel}` : 'Usage'}
      </p>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-[10px] text-neutral-500">
            {row.label}
          </span>
          <div className="h-1.5 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                barColor(row.pct),
              )}
              style={{ width: `${row.pct}%` }}
            />
          </div>
          <span
            className={cn(
              'w-7 text-right text-[10px] tabular-nums',
              textColor(row.pct),
            )}
          >
            {row.pct}%
          </span>
        </div>
      ))}
    </div>
  )
}
