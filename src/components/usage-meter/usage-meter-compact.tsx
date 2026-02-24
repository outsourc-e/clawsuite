'use client'

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const POLL_INTERVAL_MS = 30_000
const PREFERRED_PROVIDER_KEY = 'clawsuite-preferred-provider'

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

// ── localStorage helpers ─────────────────────────────────────────────────────

function getStoredPreferredProvider(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(PREFERRED_PROVIDER_KEY)
  } catch {
    return null
  }
}

function savePreferredProvider(provider: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFERRED_PROVIDER_KEY, provider)
  } catch {
    /* ignore */
  }
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

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
  const root = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const usage =
    (root.today as Record<string, unknown> | undefined) ??
    (root.usage as Record<string, unknown> | undefined) ??
    (root.summary as Record<string, unknown> | undefined) ??
    (root.totals as Record<string, unknown> | undefined) ??
    root
  return readPercent(
    (usage as Record<string, unknown>)?.contextPercent ??
      (usage as Record<string, unknown>)?.context_percent ??
      (usage as Record<string, unknown>)?.context ??
      root?.contextPercent ??
      root?.context_percent,
  )
}

function parseCurrentModel(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const model =
    root.model ??
    (root.payload as Record<string, unknown> | undefined)?.model ??
    (root.today as Record<string, unknown> | undefined)?.model ??
    (root.usage as Record<string, unknown> | undefined)?.model
  return model && typeof model === 'string' ? model : null
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

// ── Component ─────────────────────────────────────────────────────────────────

export function UsageMeterCompact() {
  const [contextPct, setContextPct] = useState<number | null>(null)
  const [progressRows, setProgressRows] = useState<UsageRow[]>([])
  const [providerLabel, setProviderLabel] = useState<string | null>(null)
  const [providers, setProviders] = useState<ProviderUsageEntry[]>([])
  const [preferredProvider, setPreferredProviderState] = useState<string | null>(
    getStoredPreferredProvider,
  )
  const [currentModel, setCurrentModel] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [settingDefault, setSettingDefault] = useState(false)

  // ── Derived primary provider ─────────────────────────────────────────────

  const getPrimary = useCallback(
    (allProviders: ProviderUsageEntry[], preferred: string | null) => {
      if (preferred) {
        const match = allProviders.find(
          (p) => p.provider === preferred && p.status === 'ok' && p.lines.length > 0,
        )
        if (match) return match
      }
      return allProviders.find((p) => p.status === 'ok' && p.lines.length > 0) ?? null
    },
    [],
  )

  // ── Fetch session status ─────────────────────────────────────────────────

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session-status')
      if (!res.ok) return
      const data = (await res.json()) as SessionStatusResponse
      const payload = data.payload ?? data
      const pct = parseContextPercent(payload)
      setContextPct(Math.min(100, Math.round(pct)))
      const model = parseCurrentModel(payload)
      if (model) setCurrentModel(model)
    } catch {
      // silent — compact meter shows nothing on error
    }
  }, [])

  // ── Fetch provider usage (accepts override for preferred) ────────────────

  const fetchProvider = useCallback(
    async (preferred: string | null) => {
      try {
        const res = await fetch('/api/provider-usage')
        if (!res.ok) return
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean
          providers?: Array<ProviderUsageEntry>
        } | null
        if (!data?.providers) return

        setProviders(data.providers)
        const primary = getPrimary(data.providers, preferred)
        if (!primary) return

        // All progress lines → one bar each
        const rows: UsageRow[] = primary.lines
          .filter((l) => l.type === 'progress' && l.used !== undefined)
          .map((l) => ({
            label: l.label.slice(0, 6),
            pct: Math.min(100, Math.round(l.used as number)),
          }))
        setProgressRows(rows)

        // Provider header label
        const name = primary.displayName.split(' ')[0]
        const label = primary.plan ? `${name} ${primary.plan}` : name
        setProviderLabel(label.length > 14 ? name : label)
      } catch {
        // silent
      }
    },
    [getPrimary],
  )

  // ── Preferred provider change ────────────────────────────────────────────

  const handleProviderChange = useCallback(
    (provider: string) => {
      setPreferredProviderState(provider)
      savePreferredProvider(provider)
      void fetchProvider(provider)
    },
    [fetchProvider],
  )

  // ── Set session default model ────────────────────────────────────────────

  const handleSetDefaultModel = useCallback(async () => {
    if (!currentModel || settingDefault) return
    setSettingDefault(true)
    try {
      await fetch('/api/session-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: currentModel }),
      })
    } catch {
      // silent
    } finally {
      setSettingDefault(false)
    }
  }, [currentModel, settingDefault])

  // ── Polling effects ──────────────────────────────────────────────────────

  useEffect(() => {
    void fetchSession()
    const id = window.setInterval(fetchSession, POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [fetchSession])

  useEffect(() => {
    void fetchProvider(preferredProvider)
    const id = window.setInterval(() => fetchProvider(preferredProvider), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [fetchProvider, preferredProvider])

  // ── Render ───────────────────────────────────────────────────────────────

  if (contextPct === null) return null

  // Build the rows to display: session context row + all provider progress rows
  const ctxRow: UsageRow = { label: 'Ctx', pct: contextPct }
  const allRows: UsageRow[] =
    progressRows.length > 0
      ? // If provider already includes a context/session line, skip the synthetic one
        progressRows
      : [ctxRow]

  const headerLabel = providerLabel ? `Usage · ${providerLabel}` : 'Usage'

  return (
    <div className="space-y-0 px-1">
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'mb-1 flex w-full items-center justify-between',
          'text-[9px] font-semibold uppercase tracking-widest text-neutral-400',
          'hover:text-neutral-500 transition-colors cursor-pointer',
        )}
        aria-expanded={expanded}
      >
        <span>{headerLabel}</span>
        <span className="text-neutral-300">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Bars — always visible */}
      <div className="space-y-1.5">
        {allRows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[10px] text-neutral-500">
              {row.label}
            </span>
            <div className="h-1.5 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700">
              <div
                className={cn('h-full rounded-full transition-all', barColor(row.pct))}
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

      {/* Expanded section: provider selector + set default */}
      {expanded && (
        <div className="mt-1.5 space-y-1">
          {/* Provider selector */}
          {providers.filter((p) => p.status === 'ok').length > 0 && (
            <select
              value={preferredProvider ?? ''}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1 text-[10px] text-neutral-700 dark:text-neutral-300"
            >
              {providers
                .filter((p) => p.status === 'ok')
                .map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.displayName}
                  </option>
                ))}
            </select>
          )}

          {/* Set as session default model */}
          {currentModel && (
            <button
              onClick={() => void handleSetDefaultModel()}
              disabled={settingDefault}
              className={cn(
                'text-[9px] text-accent-500 hover:underline mt-0.5 block',
                settingDefault && 'opacity-50 cursor-not-allowed',
              )}
            >
              {settingDefault ? 'Setting…' : 'Set as session default'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
