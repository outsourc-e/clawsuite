'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const POLL_MS = 15_000

type ContextData = {
  contextPercent: number
  model: string
  maxTokens: number
  usedTokens: number
}

const EMPTY: ContextData = { contextPercent: 0, model: '', maxTokens: 0, usedTokens: 0 }

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function ContextBarComponent({ compact }: { compact?: boolean }) {
  const [ctx, setCtx] = useState<ContextData>(EMPTY)
  const [dismissed, setDismissed] = useState(false)

  const refresh = useCallback(async () => {
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
        })
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(refresh, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const pct = ctx.contextPercent
  if (pct <= 0) return null

  const isDanger = pct >= 75
  const isWarning = pct >= 50
  const isCritical = pct >= 90

  // Bar color
  const barColor = isCritical
    ? 'bg-red-500'
    : isDanger
      ? 'bg-amber-500'
      : isWarning
        ? 'bg-amber-400'
        : 'bg-emerald-500'

  const textColor = isCritical
    ? 'text-red-600'
    : isDanger
      ? 'text-amber-600'
      : isWarning
        ? 'text-amber-600'
        : 'text-primary-500'

  const bgColor = isCritical
    ? 'bg-red-50'
    : isDanger
      ? 'bg-amber-50'
      : 'bg-transparent'

  // Only show expanded warning at thresholds
  const showWarning = pct >= 50 && !dismissed

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 transition-colors duration-300',
        showWarning ? 'py-1.5' : 'py-0.5',
        bgColor,
        compact && 'px-2',
      )}
    >
      {/* Thin progress bar */}
      <div className="flex-1 h-1 rounded-full bg-primary-100 overflow-hidden min-w-0">
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', barColor)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {/* Percentage + token count */}
      <div className={cn('flex items-center gap-1.5 shrink-0', textColor)}>
        <span className="text-[10px] font-medium tabular-nums">
          {Math.round(pct)}%
        </span>
        {!compact && ctx.maxTokens > 0 && (
          <span className="text-[10px] tabular-nums text-primary-400">
            {formatTokens(ctx.usedTokens)}/{formatTokens(ctx.maxTokens)}
          </span>
        )}
      </div>

      {/* Warning message at thresholds */}
      {showWarning && (
        <div className={cn('flex items-center gap-1.5 shrink-0')}>
          <span className={cn('text-[10px] font-medium', textColor)}>
            {isCritical
              ? 'Context almost full — start a new chat'
              : isDanger
                ? 'Context getting full'
                : 'Context 50% used'}
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="text-[10px] text-primary-400 hover:text-primary-600 transition-colors"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

export const ContextBar = memo(ContextBarComponent)
