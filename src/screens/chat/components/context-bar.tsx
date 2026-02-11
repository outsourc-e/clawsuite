'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { UsageDetailsModal } from '@/components/usage-meter/usage-details-modal'
import {
  PreviewCard,
  PreviewCardPopup,
  PreviewCardTrigger,
} from '@/components/ui/preview-card'

const CONTEXT_POLL_MS = 15_000
const PROVIDER_POLL_MS = 30_000
const SESSION_POLL_MS = 10_000

// ---------- types ----------

type ContextData = {
  contextPercent: number
  model: string
  maxTokens: number
  usedTokens: number
  staticTokens: number
  conversationTokens: number
}

type ProviderLine = {
  label: string
  type: string
  format?: string
  used?: number
  limit?: number
}

type ProviderEntry = {
  provider: string
  displayName: string
  plan?: string
  status: string
  lines: ProviderLine[]
}

type SessionUsage = {
  inputTokens: number
  outputTokens: number
  contextPercent: number
  dailyCost: number
  models: any[]
  sessions: any[]
}

const EMPTY_CTX: ContextData = { contextPercent: 0, model: '', maxTokens: 0, usedTokens: 0, staticTokens: 0, conversationTokens: 0 }
const EMPTY_USAGE: SessionUsage = { inputTokens: 0, outputTokens: 0, contextPercent: 0, dailyCost: 0, models: [], sessions: [] }

// ---------- helpers ----------

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function readNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return 0
}

function readPercent(v: unknown): number {
  const n = readNumber(v)
  return Math.max(0, Math.min(n, 100))
}

function parseSessionStatus(payload: unknown): SessionUsage {
  const root = payload && typeof payload === 'object' ? (payload as any) : {}
  const usage = root.today ?? root.usage ?? root.summary ?? root.totals ?? root
  const tokensRoot = usage?.tokens ?? usage?.tokenUsage ?? usage
  return {
    inputTokens: readNumber(tokensRoot?.inputTokens ?? tokensRoot?.input_tokens ?? usage?.inputTokens),
    outputTokens: readNumber(tokensRoot?.outputTokens ?? tokensRoot?.output_tokens ?? usage?.outputTokens),
    contextPercent: readPercent(usage?.contextPercent ?? usage?.context_percent ?? root?.contextPercent),
    dailyCost: readNumber(usage?.costUsd ?? usage?.dailyCost ?? usage?.cost ?? root?.costUsd ?? root?.dailyCost),
    models: [],
    sessions: [],
  }
}

// ---------- component ----------

function ContextBarComponent({ compact: _compact }: { compact?: boolean }) {
  const [ctx, setCtx] = useState<ContextData>(EMPTY_CTX)
  const [providers, setProviders] = useState<ProviderEntry[]>([])
  const [sessionUsage, setSessionUsage] = useState<SessionUsage>(EMPTY_USAGE)
  const [providerUpdatedAt, setProviderUpdatedAt] = useState<number | null>(null)
  const [usageOpen, setUsageOpen] = useState(false)

  const refreshContext = useCallback(async () => {
    try {
      const res = await fetch('/api/context-usage')
      if (!res.ok) return
      const data = await res.json()
      if (data.ok) {
        setCtx({
          contextPercent: data.contextPercent ?? 0,
          model: data.model ?? '',
          maxTokens: data.maxTokens ?? 0,
          usedTokens: data.usedTokens ?? 0,
          staticTokens: data.staticTokens ?? 0,
          conversationTokens: data.conversationTokens ?? 0,
        })
      }
    } catch { /* ignore */ }
  }, [])

  const refreshProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/provider-usage')
      const data = await res.json().catch(() => null)
      if (data?.ok !== false) {
        setProviders(data?.providers ?? [])
        setProviderUpdatedAt(data?.updatedAt ?? Date.now())
      }
    } catch { /* ignore */ }
  }, [])

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session-status')
      if (!res.ok) return
      const data = await res.json()
      setSessionUsage(parseSessionStatus(data.payload ?? data))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    void refreshContext()
    void refreshProviders()
    void refreshSession()
    const c = window.setInterval(refreshContext, CONTEXT_POLL_MS)
    const p = window.setInterval(refreshProviders, PROVIDER_POLL_MS)
    const s = window.setInterval(refreshSession, SESSION_POLL_MS)
    return () => { window.clearInterval(c); window.clearInterval(p); window.clearInterval(s) }
  }, [refreshContext, refreshProviders, refreshSession])

  const pct = ctx.contextPercent
  const isDanger = pct >= 75
  const isWarning = pct >= 50
  const isCritical = pct >= 90

  // Bar fills the full width — color shifts as it fills
  const barColor = isCritical
    ? 'bg-red-500'
    : isDanger
      ? 'bg-amber-500'
      : isWarning
        ? 'bg-amber-400'
        : 'bg-emerald-500/80'

  const barBg = isCritical
    ? 'bg-red-100'
    : isDanger
      ? 'bg-amber-50'
      : 'bg-primary-100'

  // Provider data
  const primaryProvider = providers.find(p => p.status === 'ok' && p.lines.length > 0)
  const progressLines = useMemo(() =>
    primaryProvider?.lines.filter(l => l.type === 'progress').slice(0, 4) ?? [],
    [primaryProvider],
  )
  // Use highest provider % for the second bar
  const providerMaxPct = useMemo(() => {
    if (!primaryProvider) return 0
    const percents = primaryProvider.lines
      .filter(l => l.type === 'progress' && l.format === 'percent' && l.used !== undefined)
      .map(l => l.used ?? 0)
    return percents.length > 0 ? Math.max(...percents) : 0
  }, [primaryProvider])

  const providerBarColor = providerMaxPct >= 75
    ? 'bg-red-500'
    : providerMaxPct >= 50
      ? 'bg-amber-400'
      : 'bg-orange-400'

  const detailProps = useMemo(
    () => ({
      usage: sessionUsage,
      error: null as string | null,
      providerUsage: providers as any,
      providerError: null as string | null,
      providerUpdatedAt,
    }),
    [sessionUsage, providers, providerUpdatedAt],
  )

  // Don't render until we have data
  if (pct <= 0 && !primaryProvider) return null

  return (
    <DialogRoot open={usageOpen} onOpenChange={setUsageOpen}>
      <PreviewCard>
        <PreviewCardTrigger className="block w-full cursor-pointer">
          <div className="flex flex-col">
            {/* Context bar — top line */}
            {pct > 0 && (
              <div className={cn('w-full h-1 transition-colors duration-300', barBg)}>
                <div
                  className={cn('h-full transition-all duration-700 ease-out', barColor)}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            )}
            {/* Provider bar — bottom line (orange brand color) */}
            {primaryProvider && providerMaxPct > 0 && (
              <div className="w-full h-1 bg-primary-50">
                <div
                  className={cn('h-full transition-all duration-700 ease-out', providerBarColor)}
                  style={{ width: `${Math.min(providerMaxPct, 100)}%` }}
                />
              </div>
            )}
          </div>
        </PreviewCardTrigger>

        {/* Hover popover with details */}
        <PreviewCardPopup
          align="center"
          sideOffset={2}
          className="w-72 px-3 py-2.5 rounded-lg"
        >
          <div className="space-y-2.5">
            {/* Context usage */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-primary-900">Context Window</span>
                <span className={cn(
                  'text-[11px] font-semibold tabular-nums',
                  isCritical ? 'text-red-600' : isDanger ? 'text-amber-600' : isWarning ? 'text-amber-500' : 'text-primary-600',
                )}>
                  {Math.round(pct)}%
                </span>
              </div>
              <div className={cn('w-full h-2 rounded-full overflow-hidden', barBg)}>
                <div
                  className={cn('h-full rounded-full transition-all duration-500', barColor)}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-primary-500 tabular-nums">
                  {formatTokens(ctx.usedTokens)} / {formatTokens(ctx.maxTokens)} tokens
                </span>
                {ctx.model && (
                  <span className="text-[10px] text-primary-400 truncate max-w-[100px]">
                    {ctx.model}
                  </span>
                )}
              </div>
              {isCritical && (
                <p className="text-[10px] text-red-600 font-medium mt-1">
                  Context almost full — consider starting a new chat
                </p>
              )}
            </div>

            {/* Provider usage */}
            {primaryProvider && (
              <div className="border-t border-primary-100 pt-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[11px] font-medium text-primary-900">
                    {primaryProvider.displayName}
                  </span>
                  {primaryProvider.plan && (
                    <span className="text-[9px] uppercase font-medium text-primary-500 bg-primary-100 px-1.5 py-0.5 rounded">
                      {primaryProvider.plan}
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {progressLines.map((line, i) => {
                    const val = line.used ?? 0
                    const lineColor = val >= 75 ? 'bg-red-500' : val >= 50 ? 'bg-amber-400' : 'bg-emerald-500'
                    return (
                      <div key={`${line.label}-${i}`}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-primary-600">{line.label}</span>
                          <span className="text-[10px] font-medium tabular-nums text-primary-700">
                            {line.format === 'dollars' && line.used !== undefined
                              ? `$${line.used >= 1000 ? `${(line.used / 1000).toFixed(1)}k` : line.used.toFixed(0)}`
                              : line.used !== undefined ? `${Math.round(line.used)}%` : '—'}
                          </span>
                        </div>
                        {line.format === 'percent' && (
                          <div className="w-full h-1 rounded-full bg-primary-100 overflow-hidden">
                            <div
                              className={cn('h-full rounded-full', lineColor)}
                              style={{ width: `${Math.min(val, 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Click for full details */}
            <DialogTrigger className="w-full text-center text-[10px] text-primary-400 hover:text-primary-600 transition-colors pt-1 border-t border-primary-100">
              Click for full usage details
            </DialogTrigger>
          </div>
        </PreviewCardPopup>
      </PreviewCard>

      <DialogContent className="w-[min(720px,94vw)]">
        <UsageDetailsModal {...detailProps} />
      </DialogContent>
    </DialogRoot>
  )
}

export const ContextBar = memo(ContextBarComponent)
