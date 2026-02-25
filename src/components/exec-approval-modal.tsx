'use client'

/**
 * ExecApprovalModal — Full-screen modal overlay for exec approval requests.
 *
 * This is an alternative to ExecApprovalToast for cases where you want
 * a blocking modal experience rather than a corner toast. Both components
 * use the same gateway API and can coexist.
 *
 * Features:
 * - SSE-driven via gateway polling (fetchGatewayApprovals)
 * - Shows agent name, command, working directory
 * - Approve (green) / Deny (red) buttons
 * - Auto-expires with 30s countdown → auto-deny on timeout
 * - Multiple pending approvals stack in a queue
 * - Dark theme compatible
 * - z-index: 9999, fixed position
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchGatewayApprovals,
  resolveGatewayApproval,
  type GatewayApprovalEntry,
} from '@/lib/gateway-api'
import { cn } from '@/lib/utils'
import { toast as showToast } from '@/components/ui/toast'

type EnrichedApproval = GatewayApprovalEntry & {
  timeoutMs?: number
  timeoutAt?: number
  expiresAt?: number
  deadline?: number
  _localDeadline?: number
}

const DEFAULT_TIMEOUT_MS = 30_000

function approvalCommand(approval: GatewayApprovalEntry): string {
  if (typeof approval.action === 'string' && approval.action.trim().length > 0) return approval.action
  if (typeof approval.tool === 'string' && approval.tool.trim().length > 0) return approval.tool
  if (approval.input !== undefined) {
    try { return JSON.stringify(approval.input, null, 2) } catch { return 'Approval requested' }
  }
  return 'Approval requested'
}

function approvalAgent(approval: GatewayApprovalEntry): string {
  return approval.agentName ?? approval.sessionKey ?? 'Agent'
}

function approvalWorkDir(approval: GatewayApprovalEntry): string | null {
  if (typeof approval.context === 'string' && approval.context.trim().length > 0) return approval.context.trim()
  return null
}

function computeDeadline(approval: EnrichedApproval): number {
  if (typeof approval.timeoutAt === 'number' && Number.isFinite(approval.timeoutAt)) return approval.timeoutAt
  if (typeof approval.expiresAt === 'number' && Number.isFinite(approval.expiresAt)) return approval.expiresAt
  if (typeof approval.deadline === 'number' && Number.isFinite(approval.deadline)) return approval.deadline
  if (typeof approval.timeoutMs === 'number' && Number.isFinite(approval.timeoutMs)) {
    return (approval.requestedAt ?? Date.now()) + Math.max(0, approval.timeoutMs)
  }
  if (approval._localDeadline) return approval._localDeadline
  return (approval.requestedAt ?? Date.now()) + DEFAULT_TIMEOUT_MS
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  if (total <= 0) return '0s'
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function ExecApprovalModal() {
  const [pending, setPending] = useState<EnrichedApproval[]>([])
  const [resolving, setResolving] = useState<Record<string, 'approve' | 'deny'>>({})
  const [now, setNow] = useState(Date.now())
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [activeIndex, setActiveIndex] = useState(0)
  const seenRef = useRef<Map<string, number>>(new Map())

  const refresh = useCallback(async () => {
    try {
      const response = await fetchGatewayApprovals()
      const rows = (response.pending ?? response.approvals ?? []) as EnrichedApproval[]
      const pendingRows = rows.filter((entry) => (entry.status ?? 'pending') === 'pending')
      const seenMap = seenRef.current
      const enriched = pendingRows.map((entry) => {
        if (!seenMap.has(entry.id)) {
          seenMap.set(entry.id, (entry.requestedAt ?? Date.now()) + DEFAULT_TIMEOUT_MS)
        }
        return { ...entry, _localDeadline: seenMap.get(entry.id) }
      })
      setPending(enriched)
    } catch {
      // silently ignore
    }
  }, [])

  useEffect(() => {
    void refresh()
    const poll = window.setInterval(() => void refresh(), 3_000)
    const ticker = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => { window.clearInterval(poll); window.clearInterval(ticker) }
  }, [refresh])

  // Auto-deny expired
  useEffect(() => {
    for (const approval of pending) {
      const deadline = computeDeadline(approval)
      if (deadline - now <= 0 && !resolving[approval.id] && !dismissed.has(approval.id)) {
        void resolveGatewayApproval(approval.id, 'deny').then(() => {
          showToast(`Auto-denied: ${approvalCommand(approval).slice(0, 60)}`, { type: 'warning' })
          void refresh()
        })
        setDismissed((prev) => new Set(prev).add(approval.id))
      }
    }
  }, [pending, now, resolving, dismissed, refresh])

  const visible = useMemo(() => {
    return pending
      .filter((e) => !dismissed.has(e.id))
      .sort((a, b) => (a.requestedAt ?? 0) - (b.requestedAt ?? 0))
  }, [pending, dismissed])

  // Clamp active index
  useEffect(() => {
    if (activeIndex >= visible.length) setActiveIndex(Math.max(0, visible.length - 1))
  }, [visible.length, activeIndex])

  async function handleResolve(id: string, action: 'approve' | 'deny') {
    setResolving((prev) => ({ ...prev, [id]: action }))
    try {
      const result = await resolveGatewayApproval(id, action)
      if (result.ok) {
        showToast(action === 'approve' ? 'Approved ✓' : 'Denied ✕', { type: action === 'approve' ? 'success' : 'error' })
      }
      setDismissed((prev) => new Set(prev).add(id))
      await refresh()
    } finally {
      setResolving((prev) => { const next = { ...prev }; delete next[id]; return next })
    }
  }

  if (visible.length === 0) return null

  const current = visible[activeIndex] ?? visible[0]
  if (!current) return null

  const deadline = computeDeadline(current)
  const remaining = Math.max(0, deadline - now)
  const progressPct = Math.max(0, Math.min(100, (remaining / DEFAULT_TIMEOUT_MS) * 100))
  const isUrgent = remaining < 10_000
  const command = approvalCommand(current)
  const agent = approvalAgent(current)
  const workDir = approvalWorkDir(current)
  const busy = resolving[current.id]

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        {/* Progress bar */}
        <div className="h-1 w-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className={cn(
              'h-full rounded-r-full transition-all duration-1000 ease-linear',
              isUrgent ? 'bg-red-500' : 'bg-amber-400',
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="p-6">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                ⚡ Exec Approval
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                'font-mono text-sm font-bold tabular-nums',
                isUrgent ? 'text-red-500 animate-pulse' : 'text-neutral-500 dark:text-neutral-400',
              )}>
                {formatTime(remaining)}
              </span>
            </div>
          </div>

          {/* Agent */}
          <p className="mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            🤖 {agent}
          </p>

          {/* Command */}
          <div className="mb-3 max-h-40 overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-neutral-900 dark:text-neutral-100">
              {command}
            </pre>
          </div>

          {/* Working directory */}
          {workDir && (
            <p className="mb-3 flex items-center gap-1.5 font-mono text-xs text-neutral-500 dark:text-neutral-500">
              <span>📁</span>
              <span className="truncate">{workDir}</span>
            </p>
          )}

          {/* Queue indicator */}
          {visible.length > 1 && (
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {visible.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    className={cn(
                      'size-2 rounded-full transition-colors',
                      idx === activeIndex
                        ? 'bg-amber-500'
                        : 'bg-neutral-300 hover:bg-neutral-400 dark:bg-neutral-700 dark:hover:bg-neutral-600',
                    )}
                  />
                ))}
              </div>
              <span className="text-[11px] text-neutral-400">
                {activeIndex + 1} of {visible.length} pending
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void handleResolve(current.id, 'approve')}
              disabled={Boolean(busy)}
              className={cn(
                'flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition-all hover:bg-emerald-700 active:scale-[0.98]',
                busy && 'cursor-not-allowed opacity-60',
              )}
            >
              {busy === 'approve' ? 'Approving…' : '✓ Approve'}
            </button>
            <button
              type="button"
              onClick={() => void handleResolve(current.id, 'deny')}
              disabled={Boolean(busy)}
              className={cn(
                'flex-1 rounded-xl border-2 border-red-300 bg-white py-3 text-sm font-bold text-red-600 transition-all hover:bg-red-50 active:scale-[0.98] dark:border-red-800/50 dark:bg-neutral-900 dark:text-red-400 dark:hover:bg-red-950/20',
                busy && 'cursor-not-allowed opacity-60',
              )}
            >
              {busy === 'deny' ? 'Denying…' : '✕ Deny'}
            </button>
          </div>

          {/* Auto-deny notice */}
          <p className="mt-3 text-center text-[10px] text-neutral-400 dark:text-neutral-500">
            {isUrgent ? '⚠️ Auto-denying soon!' : 'Auto-denies on timeout'}
          </p>
        </div>
      </div>
    </div>
  )
}
