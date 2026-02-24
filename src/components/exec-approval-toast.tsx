import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchGatewayApprovals,
  resolveGatewayApproval,
  type GatewayApprovalEntry,
} from '@/lib/gateway-api'
import { cn } from '@/lib/utils'
import { loadApprovals } from '@/screens/gateway/lib/approvals-store'

type EnrichedApproval = GatewayApprovalEntry & {
  timeoutMs?: number
  timeoutAt?: number
  expiresAt?: number
  deadline?: number
}

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

function toDeadline(approval: EnrichedApproval): number | null {
  if (typeof approval.timeoutAt === 'number' && Number.isFinite(approval.timeoutAt)) return approval.timeoutAt
  if (typeof approval.expiresAt === 'number' && Number.isFinite(approval.expiresAt)) return approval.expiresAt
  if (typeof approval.deadline === 'number' && Number.isFinite(approval.deadline)) return approval.deadline
  if (typeof approval.timeoutMs === 'number' && Number.isFinite(approval.timeoutMs)) {
    const requested = approval.requestedAt ?? Date.now()
    return requested + Math.max(0, approval.timeoutMs)
  }
  return null
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function ExecApprovalToast() {
  const [gatewayPending, setGatewayPending] = useState<EnrichedApproval[]>([])
  const [localPendingCount, setLocalPendingCount] = useState(0)
  const [resolving, setResolving] = useState<'approve' | 'deny' | null>(null)
  const [now, setNow] = useState(Date.now())

  const refresh = useCallback(async () => {
    const response = await fetchGatewayApprovals()
    const rows = (response.pending ?? response.approvals ?? []) as EnrichedApproval[]
    setGatewayPending(rows.filter((entry) => (entry.status ?? 'pending') === 'pending'))

    const local = loadApprovals().filter((entry) => entry.status === 'pending')
    setLocalPendingCount(local.length)
  }, [])

  useEffect(() => {
    void refresh()
    const poll = window.setInterval(() => {
      void refresh()
    }, 3_000)
    const ticker = window.setInterval(() => {
      setNow(Date.now())
    }, 1_000)
    return () => {
      window.clearInterval(poll)
      window.clearInterval(ticker)
    }
  }, [refresh])

  const active = gatewayPending[0]
  const pendingCount = gatewayPending.length
  const visible = pendingCount > 0 || localPendingCount > 0

  const countdownText = useMemo(() => {
    if (!active) return null
    const deadline = toDeadline(active)
    if (!deadline) return null
    return formatCountdown(deadline - now)
  }, [active, now])

  async function handleResolve(action: 'approve' | 'deny') {
    if (!active?.id) return
    setResolving(action)
    try {
      await resolveGatewayApproval(active.id, action)
      await refresh()
    } finally {
      setResolving(null)
    }
  }

  if (!visible || !active) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))]">
      <div className="pointer-events-auto rounded-2xl border border-amber-200 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-amber-900/40 dark:bg-neutral-950/95">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            Exec approval needed
          </span>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {pendingCount} pending
          </span>
        </div>

        <p className="line-clamp-3 font-mono text-xs font-semibold text-neutral-900 dark:text-neutral-100">
          {approvalText(active)}
        </p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {countdownText ? `Auto-timeout in ${countdownText}` : 'Awaiting decision'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleResolve('deny')}
              disabled={Boolean(resolving)}
              className={cn(
                'rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30',
                resolving && 'cursor-not-allowed opacity-60',
              )}
            >
              {resolving === 'deny' ? 'Denying…' : 'Deny'}
            </button>
            <button
              type="button"
              onClick={() => void handleResolve('approve')}
              disabled={Boolean(resolving)}
              className={cn(
                'rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700',
                resolving && 'cursor-not-allowed opacity-60',
              )}
            >
              {resolving === 'approve' ? 'Approving…' : 'Approve'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
