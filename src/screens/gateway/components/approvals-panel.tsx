import { cn } from '@/lib/utils'
import type { ApprovalRequest } from '../lib/approvals-store'

type ApprovalsPanelProps = {
  approvals: ApprovalRequest[]
  onApprove: (id: string) => void
  onDeny: (id: string) => void
}

function timeAgo(ms: number): string {
  const delta = Math.max(0, Date.now() - ms)
  const seconds = Math.floor(delta / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Agent name → badge color (deterministic, cycling)
const AGENT_BADGE_COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
]

function agentBadgeClass(agentName: string): string {
  let hash = 0
  for (let i = 0; i < agentName.length; i++) {
    hash = (hash * 31 + agentName.charCodeAt(i)) | 0
  }
  return AGENT_BADGE_COLORS[Math.abs(hash) % AGENT_BADGE_COLORS.length]!
}

export function ApprovalsPanel({ approvals, onApprove, onDeny }: ApprovalsPanelProps) {
  const pendingCount = approvals.filter(a => a.status === 'pending').length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-primary-200 px-4 py-3 dark:border-neutral-700">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-primary-400">
          ✅ Approvals
        </h2>
        {pendingCount > 0 ? (
          <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {pendingCount}
          </span>
        ) : null}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {approvals.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="text-center">
              <p className="mb-2 text-2xl">✅</p>
              <p className="text-sm font-medium text-primary-700 dark:text-neutral-300">
                No pending approvals
              </p>
              <p className="mt-1 text-xs text-primary-400">
                Agents are running autonomously
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {approvals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onApprove={onApprove}
                onDeny={onDeny}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ApprovalCard({
  approval,
  onApprove,
  onDeny,
}: {
  approval: ApprovalRequest
  onApprove: (id: string) => void
  onDeny: (id: string) => void
}) {
  const isPending = approval.status === 'pending'

  return (
    <div
      className={cn(
        'rounded-xl border bg-white p-4 shadow-sm dark:bg-neutral-900',
        isPending
          ? 'border-amber-200 dark:border-amber-800/60'
          : 'border-primary-200 dark:border-neutral-700 opacity-70',
      )}
    >
      {/* Agent badge + time */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            agentBadgeClass(approval.agentName),
          )}
        >
          {approval.agentName}
        </span>
        <span className="shrink-0 text-[10px] text-primary-400">
          {timeAgo(approval.requestedAt)}
        </span>
      </div>

      {/* Action */}
      <p className="mb-1.5 text-xs font-semibold text-primary-900 dark:text-neutral-100">
        {approval.action}
      </p>

      {/* Context snippet */}
      <p className="mb-3 line-clamp-2 text-[11px] text-primary-500 dark:text-neutral-400">
        {approval.context}
      </p>

      {/* Actions or resolved label */}
      {isPending ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onApprove(approval.id)}
            className="flex-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onDeny(approval.id)}
            className="flex-1 rounded-lg bg-red-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-red-600"
          >
            Deny
          </button>
        </div>
      ) : (
        <p
          className={cn(
            'text-[11px] font-semibold',
            approval.status === 'approved'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-500 dark:text-red-400',
          )}
        >
          {approval.status === 'approved' ? 'Approved ✓' : 'Denied ✗'}
        </p>
      )}
    </div>
  )
}
