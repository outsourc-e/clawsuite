'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchGatewayApprovals,
  resolveGatewayApproval,
  type GatewayApprovalEntry,
} from '@/lib/gateway-api'
import { cn } from '@/lib/utils'
import { toast as showToast } from '@/components/ui/toast'

/**
 * ExecApprovalToast — Global overlay for exec approval requests.
 *
 * - Polls gateway every 3s for pending approvals
 * - Shows stacked cards (up to 3 visible, count badge for overflow)
 * - Each card has a 30s countdown → auto-deny on timeout
 * - Approve (green) / Deny (red) buttons
 * - Fixed position, z-index 9999, always on top
 * - Matches dark theme
 */

type EnrichedApproval = GatewayApprovalEntry & {
  timeoutMs?: number
  timeoutAt?: number
  expiresAt?: number
  deadline?: number
  /** Locally-computed deadline for auto-deny (ms since epoch) */
  _localDeadline?: number
}

const DEFAULT_TIMEOUT_MS = 30_000

function approvalText(approval: GatewayApprovalEntry): string {
  if (typeof approval.action === 'string' && approval.action.trim().length > 0) return approval.action
  if (typeof approval.tool === 'string' && approval.tool.trim().length > 0) return approval.tool
  if (approval.input !== undefined) {
    try {
      return JSON.stringify(approval.input)
    } catch {
      return 'Approval requested'
    }
  }
  return 'Approval requested'
}

function approvalAgent(approval: GatewayApprovalEntry): string {
  return approval.agentName ?? approval.sessionKey ?? 'Agent'
}

function approvalContext(approval: GatewayApprovalEntry): string | null {
  if (typeof approval.context === 'string' && approval.context.trim().length > 0) {
    return approval.context.trim()
  }
  return null
}

function toDeadline(approval: EnrichedApproval): number {
  if (typeof approval.timeoutAt === 'number' && Number.isFinite(approval.timeoutAt)) return approval.timeoutAt
  if (typeof approval.expiresAt === 'number' && Number.isFinite(approval.expiresAt)) return approval.expiresAt
  if (typeof approval.deadline === 'number' && Number.isFinite(approval.deadline)) return approval.deadline
  if (typeof approval.timeoutMs === 'number' && Number.isFinite(approval.timeoutMs)) {
    const requested = approval.requestedAt ?? Date.now()
    return requested + Math.max(0, approval.timeoutMs)
  }
  // Fallback: use local deadline or default 30s from when we first saw it
  if (approval._localDeadline) return approval._localDeadline
  return (approval.requestedAt ?? Date.now()) + DEFAULT_TIMEOUT_MS
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  if (total <= 0) return '0s'
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function riskLevel(text: string): 'low' | 'medium' | 'high' {
  const lower = text.toLowerCase()
  if (/(rm\s+-rf|drop\s+table|truncate|sudo|chown|chmod\s+777|delete\s+all|force)/.test(lower)) return 'high'
  if (/(write|edit|patch|install|deploy|execute|run|kill|terminate|delete|update)/.test(lower)) return 'medium'
  return 'low'
}

const RISK_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', label: 'Low Risk' },
  medium: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', label: 'Med Risk' },
  high: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'High Risk' },
}

export function ExecApprovalToast() {
  const [gatewayPending, setGatewayPending] = useState<EnrichedApproval[]>([])
  const [resolving, setResolving] = useState<Record<string, 'approve' | 'deny'>>({})
  const [now, setNow] = useState(Date.now())
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const seenRef = useRef<Map<string, number>>(new Map())

  const refresh = useCallback(async () => {
    try {
      const response = await fetchGatewayApprovals()
      const rows = (response.pending ?? response.approvals ?? []) as EnrichedApproval[]
      const pending = rows.filter((entry) => (entry.status ?? 'pending') === 'pending')

      // Assign local deadlines for approvals we haven't seen before
      const seenMap = seenRef.current
      const enriched = pending.map((entry) => {
        if (!seenMap.has(entry.id)) {
          const deadline = (entry.requestedAt ?? Date.now()) + DEFAULT_TIMEOUT_MS
          seenMap.set(entry.id, deadline)
        }
        return { ...entry, _localDeadline: seenMap.get(entry.id) }
      })

      setGatewayPending(enriched)
    } catch {
      // silently ignore fetch errors
    }
  }, [])

  // Poll gateway + tick countdown
  useEffect(() => {
    void refresh()
    const poll = window.setInterval(() => void refresh(), 3_000)
    const ticker = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => {
      window.clearInterval(poll)
      window.clearInterval(ticker)
    }
  }, [refresh])

  // Auto-deny expired approvals
  useEffect(() => {
    for (const approval of gatewayPending) {
      const deadline = toDeadline(approval)
      const remaining = deadline - now
      if (remaining <= 0 && !resolving[approval.id] && !dismissed.has(approval.id)) {
        // Auto-deny
        void resolveGatewayApproval(approval.id, 'deny').then(() => {
          showToast(`Auto-denied: ${approvalText(approval).slice(0, 60)}`, { type: 'warning' })
          void refresh()
        })
        setDismissed((prev) => new Set(prev).add(approval.id))
      }
    }
  }, [gatewayPending, now, resolving, dismissed, refresh])

  // Filter out dismissed/resolved items
  const visibleApprovals = useMemo(() => {
    return gatewayPending
      .filter((entry) => !dismissed.has(entry.id))
      .sort((a, b) => (a.requestedAt ?? 0) - (b.requestedAt ?? 0))
  }, [gatewayPending, dismissed])

  const pendingCount = visibleApprovals.length
  const displayedApprovals = visibleApprovals.slice(0, 3)
  const overflowCount = Math.max(0, pendingCount - 3)

  async function handleResolve(id: string, action: 'approve' | 'deny') {
    setResolving((prev) => ({ ...prev, [id]: action }))
    try {
      const result = await resolveGatewayApproval(id, action)
      if (result.ok) {
        showToast(
          action === 'approve' ? 'Approved ✓' : 'Denied ✕',
          { type: action === 'approve' ? 'success' : 'error' },
        )
      } else {
        showToast('Failed to resolve approval', { type: 'error' })
      }
      setDismissed((prev) => new Set(prev).add(id))
      await refresh()
    } finally {
      setResolving((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  if (pendingCount === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex w-[min(440px,calc(100vw-2rem))] flex-col gap-2">
      {/* Overflow badge */}
      {overflowCount > 0 && (
        <div className="pointer-events-auto self-end rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white shadow-lg">
          +{overflowCount} more pending
        </div>
      )}

      {/* Stacked approval cards (newest at bottom / closest to user) */}
      {displayedApprovals.map((approval, index) => {
        const isTop = index === displayedApprovals.length - 1
        const deadline = toDeadline(approval)
        const remaining = Math.max(0, deadline - now)
        const totalTimeout = DEFAULT_TIMEOUT_MS
        const progressPct = Math.max(0, Math.min(100, (remaining / totalTimeout) * 100))
        const countdown = formatCountdown(remaining)
        const isUrgent = remaining < 10_000
        const text = approvalText(approval)
        const agent = approvalAgent(approval)
        const context = approvalContext(approval)
        const risk = riskLevel(text + ' ' + (context ?? ''))
        const riskBadge = RISK_BADGE[risk]
        const busy = resolving[approval.id]

        return (
          <div
            key={approval.id}
            className={cn(
              'pointer-events-auto overflow-hidden rounded-2xl border shadow-2xl backdrop-blur transition-all duration-300',
              isTop
                ? 'border-amber-300 bg-white/98 dark:border-amber-800/60 dark:bg-neutral-950/98'
                : 'border-neutral-200 bg-white/90 opacity-80 dark:border-neutral-800 dark:bg-neutral-950/90',
              isUrgent && isTop && 'ring-2 ring-red-400/50 border-red-300 dark:border-red-800/60',
            )}
            style={{
              // Slight scale-down for stacked cards behind the front one
              transform: !isTop ? `scale(${0.96 - index * 0.02})` : undefined,
            }}
          >
            {/* Countdown progress bar */}
            <div className="h-[3px] w-full bg-neutral-100 dark:bg-neutral-800">
              <div
                className={cn(
                  'h-full transition-all duration-1000 ease-linear rounded-r-full',
                  isUrgent ? 'bg-red-500' : 'bg-amber-400',
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="p-4">
              {/* Header row: badge + agent + countdown */}
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    ⚡ Exec Approval
                  </span>
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase', riskBadge.bg, riskBadge.text)}>
                    {riskBadge.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'font-mono text-[11px] font-bold tabular-nums',
                    isUrgent ? 'text-red-500 animate-pulse' : 'text-neutral-500 dark:text-neutral-400',
                  )}>
                    {countdown}
                  </span>
                  {pendingCount > 1 && (
                    <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      {pendingCount}
                    </span>
                  )}
                </div>
              </div>

              {/* Agent name */}
              <p className="mb-1 text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                {agent}
              </p>

              {/* Command text */}
              <p className="line-clamp-3 font-mono text-xs font-semibold leading-relaxed text-neutral-900 dark:text-neutral-100">
                {text}
              </p>

              {/* Working directory / context */}
              {context && (
                <p className="mt-1 line-clamp-1 font-mono text-[10px] text-neutral-500 dark:text-neutral-500">
                  📁 {context}
                </p>
              )}

              {/* Action buttons */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleResolve(approval.id, 'approve')}
                  disabled={Boolean(busy)}
                  className={cn(
                    'flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white transition-all hover:bg-emerald-700 active:scale-[0.98]',
                    busy && 'cursor-not-allowed opacity-60',
                  )}
                >
                  {busy === 'approve' ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="size-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Approving…
                    </span>
                  ) : (
                    '✓ Approve'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void handleResolve(approval.id, 'deny')}
                  disabled={Boolean(busy)}
                  className={cn(
                    'flex-1 rounded-lg border border-red-300 bg-white py-2 text-xs font-bold text-red-600 transition-all hover:bg-red-50 active:scale-[0.98] dark:border-red-800/50 dark:bg-neutral-900 dark:text-red-400 dark:hover:bg-red-950/30',
                    busy && 'cursor-not-allowed opacity-60',
                  )}
                >
                  {busy === 'deny' ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="size-3 animate-spin rounded-full border-2 border-red-300 border-t-red-600" />
                      Denying…
                    </span>
                  ) : (
                    '✕ Deny'
                  )}
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
