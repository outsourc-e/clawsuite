'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  PreviewCard,
  PreviewCardPopup,
  PreviewCardTrigger,
} from '@/components/ui/preview-card'

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

function ContextBarComponent({ compact: _compact }: { compact?: boolean }) {
  const [ctx, setCtx] = useState<ContextData>(EMPTY)

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
  // Always show the bar — even at 0% show a minimal indicator so users know it exists
  if (pct <= 0 && ctx.model === '') return <div className="shrink-0 h-6" />

  const isDanger = pct >= 75
  const isWarning = pct >= 50
  const isCritical = pct >= 90

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

  const textColor = isCritical
    ? 'text-red-600'
    : isDanger
      ? 'text-amber-600'
      : isWarning
        ? 'text-amber-500'
        : 'text-primary-600'

  return (
    <PreviewCard>
      <PreviewCardTrigger className="block w-full cursor-pointer">
        <div className={cn('shrink-0 w-full h-1.5 transition-colors duration-300', barBg)}>
          <div
            className={cn('h-full transition-all duration-700 ease-out', barColor)}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </PreviewCardTrigger>

      <PreviewCardPopup
        align="center"
        sideOffset={2}
        className="w-64 px-3 py-2.5 rounded-lg"
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-primary-900">Context Window</span>
            <span className={cn('text-[11px] font-semibold tabular-nums', textColor)}>
              {Math.round(pct)}%
            </span>
          </div>
          <div className={cn('w-full h-2 rounded-full overflow-hidden', barBg)}>
            <div
              className={cn('h-full rounded-full transition-all duration-500', barColor)}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
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
            <p className="text-[10px] text-red-600 font-medium">
              Context almost full — consider starting a new chat
            </p>
          )}
        </div>
      </PreviewCardPopup>
    </PreviewCard>
  )
}

export const ContextBar = memo(ContextBarComponent)
