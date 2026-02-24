/**
 * Server-side singleton that tracks pending exec approvals from the gateway.
 *
 * Since the gateway has no "list pending" RPC, we subscribe to gateway events
 * (exec.approval.requested / exec.approval.resolved) and maintain an in-memory
 * map of pending approvals. This mirrors the approach used by the Discord plugin.
 */
import { onGatewayEvent } from './gateway'

export type ExecApprovalEntry = {
  id: string
  sessionKey?: string | null
  agentName?: string | null
  tool?: string | null
  action?: string | null
  context?: string | null
  input?: unknown
  requestedAt?: number
  expiresAt?: number
  status: 'pending' | 'resolved'
}

// In-memory store — lives for the lifetime of the server process.
const _pending = new Map<string, ExecApprovalEntry>()
let _started = false

function startIfNeeded() {
  if (_started) return
  _started = true

  onGatewayEvent((frame) => {
    if (frame.type !== 'event' && frame.type !== 'evt') return
    const event = frame.event
    const rawPayload = 'payloadJSON' in frame && frame.payloadJSON
      ? (() => { try { return JSON.parse(frame.payloadJSON as string) } catch { return {} } })()
      : frame.payload
    const payload: Record<string, unknown> = (rawPayload as Record<string, unknown>) ?? {}

    if (event === 'exec.approval.requested') {
      const id = (payload.id ?? payload.approvalId) as string | undefined
      if (!id) return
      const request = (payload.request as Record<string, unknown>) ?? {}
      const entry: ExecApprovalEntry = {
        id,
        sessionKey: (request.sessionKey ?? payload.sessionKey) as string | null,
        agentName: (request.agentId ?? payload.agentId) as string | null,
        tool: (request.resolvedPath ?? request.command) as string | null,
        action: request.command as string | null,
        context: (payload.context ?? request.cwd) as string | null,
        input: request,
        requestedAt: (payload.createdAtMs ?? Date.now()) as number,
        expiresAt: (payload.expiresAtMs) as number | undefined,
        status: 'pending',
      }
      _pending.set(id, entry)
    } else if (
      event === 'exec.approval.resolved' ||
      event === 'exec.approval.expired'
    ) {
      const id = (payload.id ?? payload.approvalId) as string | undefined
      if (!id) return
      const existing = _pending.get(id)
      if (existing) {
        existing.status = 'resolved'
        _pending.set(id, existing)
        // Auto-purge resolved entries after 60s to avoid unbounded growth.
        setTimeout(() => _pending.delete(id), 60_000)
      }
    }
  })
}

/**
 * Returns all pending exec approvals seen since server start.
 * Starts the event subscription on first call.
 */
export function getPendingApprovals(): ExecApprovalEntry[] {
  startIfNeeded()
  return Array.from(_pending.values()).filter((e) => e.status === 'pending')
}

/**
 * Returns all tracked approvals (pending + recently resolved).
 * Starts the event subscription on first call.
 */
export function getAllApprovals(): ExecApprovalEntry[] {
  startIfNeeded()
  return Array.from(_pending.values())
}
