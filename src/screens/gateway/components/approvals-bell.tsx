'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ApprovalRequest } from '../lib/approvals-store'

// ── Types ─────────────────────────────────────────────────────────────────────

type ApprovalsBellProps = {
  approvals: ApprovalRequest[]
  onApprove: (id: string) => void
  onDeny: (id: string) => void
}

// ── Helper ────────────────────────────────────────────────────────────────────

function timeAgo(ms: number): string {
  const delta = Math.max(0, Date.now() - ms)
  const s = Math.floor(delta / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

// ── ApprovalCard ──────────────────────────────────────────────────────────────

function ApprovalCard({
  approval,
  onApprove,
  onDeny,
}: {
  approval: ApprovalRequest
  onApprove: () => void
  onDeny: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isGateway = approval.source === 'gateway'

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-all',
        isGateway
          ? 'border-violet-200/60 bg-violet-50/40 dark:border-violet-500/20 dark:bg-violet-900/10'
          : 'border-amber-200/70 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-900/10',
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                isGateway
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
              )}
            >
              {isGateway ? '⚡ Gateway' : '🤖 Agent'}
            </span>
            <span className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-100">
              {approval.agentName}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-neutral-400">
              {timeAgo(approval.requestedAt)}
            </span>
          </div>

          {/* Action summary */}
          <p
            className={cn(
              'mt-1.5 text-[11px] leading-snug text-neutral-700 dark:text-neutral-300',
              expanded ? '' : 'line-clamp-2',
            )}
          >
            {approval.action}
          </p>

          {/* Context (expanded) */}
          {expanded && approval.context && approval.context !== approval.action ? (
            <div className="mt-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-2">
              <p className="font-mono text-[10px] leading-relaxed text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap break-words">
                {approval.context}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Action row */}
      <div className="mt-2.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onApprove}
          className="flex-1 rounded-lg bg-emerald-500 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-600 active:bg-emerald-700"
        >
          ✓ Approve
        </button>
        <button
          type="button"
          onClick={onDeny}
          className="flex-1 rounded-lg border border-red-200 bg-white dark:border-red-800/50 dark:bg-neutral-800 py-1.5 text-[11px] font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          ✕ Deny
        </button>
        {(approval.context && approval.context.length > 60) ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2.5 py-1.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-700"
            title={expanded ? 'Collapse' : 'Read more'}
          >
            {expanded ? '↑' : '···'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ── ApprovalsBell ─────────────────────────────────────────────────────────────

export function ApprovalsBell({ approvals, onApprove, onDeny }: ApprovalsBellProps) {
  const [open, setOpen] = useState(false)
  const [prevCount, setPrevCount] = useState(0)
  const [pulse, setPulse] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const pending = approvals.filter((a) => a.status === 'pending')
  const count = pending.length

  // Pulse animation when new approvals arrive
  useEffect(() => {
    if (count > prevCount && prevCount >= 0) {
      setPulse(true)
      const t = window.setTimeout(() => setPulse(false), 1200)
      return () => window.clearTimeout(t)
    }
    setPrevCount(count)
  }, [count, prevCount])

  // Auto-open when first approval arrives
  useEffect(() => {
    if (count > 0 && prevCount === 0) {
      setOpen(true)
    }
  }, [count, prevCount])

  // Click-outside to close
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const hasGateway = pending.some((a) => a.source === 'gateway')
  const hasAgent = pending.some((a) => a.source !== 'gateway')

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
          count > 0
            ? open
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
              : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/30'
            : 'text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200',
          pulse && 'ring-2 ring-amber-400/50',
        )}
        aria-label={`Approvals${count > 0 ? ` — ${count} pending` : ''}`}
      >
        {/* Animated ring when new */}
        {pulse ? (
          <span className="absolute inset-0 rounded-lg animate-ping border-2 border-amber-400 opacity-30 pointer-events-none" />
        ) : null}

        <span aria-hidden className="text-sm leading-none">
          {count > 0 ? '🔔' : '🔕'}
        </span>
        <span className="hidden sm:inline">Approvals</span>

        {count > 0 ? (
          <span className="flex items-center justify-center rounded-full bg-amber-500 min-w-[18px] h-[18px] px-1 text-[9px] font-bold text-white leading-none">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}

        {/* Source type pills */}
        {count > 0 ? (
          <span className="hidden md:flex items-center gap-0.5">
            {hasGateway ? (
              <span className="rounded-full bg-violet-100 dark:bg-violet-900/40 px-1 text-[8px] font-semibold text-violet-700 dark:text-violet-300">GW</span>
            ) : null}
            {hasAgent ? (
              <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-1 text-[8px] font-semibold text-amber-700 dark:text-amber-300">AG</span>
            ) : null}
          </span>
        ) : null}
      </button>

      {/* Dropdown panel */}
      {open ? (
        <div
          className={cn(
            'absolute right-0 top-full mt-2 z-50 w-[360px] max-h-[480px] flex flex-col',
            'rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900',
            'shadow-[0_8px_30px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]',
            'overflow-hidden',
          )}
          role="dialog"
          aria-label="Pending approvals"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Approvals
              </span>
              {count > 0 ? (
                <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                  {count} pending
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {hasGateway ? (
                <span className="flex items-center gap-1 text-[10px] text-neutral-400">
                  <span className="size-1.5 rounded-full bg-violet-400" /> Gateway
                </span>
              ) : null}
              {hasAgent ? (
                <span className="flex items-center gap-1 text-[10px] text-neutral-400">
                  <span className="size-1.5 rounded-full bg-amber-400" /> Agents
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Approval list */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
            {pending.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <span className="text-2xl mb-2">🛡️</span>
                <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">All clear</p>
                <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">No pending approvals</p>
              </div>
            ) : (
              pending.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  onApprove={() => { onApprove(approval.id); }}
                  onDeny={() => { onDeny(approval.id); }}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {pending.length > 0 ? (
            <div className="border-t border-neutral-200 dark:border-neutral-700 px-4 py-2.5 flex items-center justify-between">
              <span className="text-[10px] text-neutral-400">Agents await your decision</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => { pending.forEach((a) => onApprove(a.id)); }}
                  className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-emerald-600 transition-colors"
                >
                  ✓ Approve All
                </button>
                <button
                  type="button"
                  onClick={() => { pending.forEach((a) => onDeny(a.id)); }}
                  className="rounded-lg border border-red-200 dark:border-red-800/50 bg-white dark:bg-neutral-800 px-2.5 py-1 text-[10px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  ✕ Deny All
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
