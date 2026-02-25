import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
} from '../../server/rate-limit'

export const Route = createFileRoute('/api/gateway-restart')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const ip = getClientIp(request)
        // gateway-restart triggers service disruption — limit to 5 per minute per IP
        if (!rateLimit(`gateway-restart:${ip}`, 5, 60_000)) {
          return rateLimitResponse()
        }

        try {
          // Ask the gateway to reload its config (graceful restart).
          // This RPC causes the gateway to reload providers and apply config changes.
          // The gateway may briefly disconnect; clients should poll /api/ping to detect recovery.
          const result = await gatewayRpc<{ ok?: boolean; error?: string }>(
            'gateway.restart',
            {},
          )

          if (result && result.ok === false) {
            return json(
              { ok: false, error: result.error || 'Gateway refused restart' },
              { status: 500 },
            )
          }

          return json({ ok: true })
        } catch (err) {
          // A connection error here is expected — the gateway is restarting.
          // Return ok:true so the client starts polling for recovery.
          const msg = err instanceof Error ? err.message : String(err)
          const isExpectedDisconnect =
            msg.includes('closed') ||
            msg.includes('timed out') ||
            msg.includes('ECONNREFUSED') ||
            msg.includes('shut down') ||
            msg.includes('Gateway connection')

          if (isExpectedDisconnect) {
            return json({ ok: true, restarting: true })
          }

          return json({ ok: false, error: msg }, { status: 500 })
        }
      },
    },
  },
})
