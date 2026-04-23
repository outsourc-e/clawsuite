import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { URL } from 'node:url'
import {
  gatewayIsReady,
  gatewayRpc,
} from '../../../server/gateway'
import { isAuthenticated } from '../../../server/auth-middleware'

function gatewayRpcWithTimeout<TPayload>(
  method: string,
  params?: unknown,
  timeoutMs = 10_000,
): Promise<TPayload> {
  return Promise.race([
    gatewayRpc<TPayload>(method, params),
    new Promise<TPayload>((_, reject) => {
      setTimeout(() => reject(new Error('Gateway RPC timed out')), timeoutMs)
    }),
  ])
}

export const Route = createFileRoute('/api/gateway/status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Fast path: when the WS client is already connected + authenticated,
        // answer immediately without waiting for a full RPC round-trip.
        // `?fast=1` forces this mode so chat's polling loop never stalls on
        // a gateway that's momentarily slow to respond to `status`.
        let url: URL | null = null
        try {
          url = new URL(request.url)
        } catch {
          url = null
        }
        const fastMode = url?.searchParams.get('fast') === '1'
        if (gatewayIsReady()) {
          if (fastMode) {
            return json({ connected: true, ok: true })
          }
          // Normal mode still returns rich status, but with a shorter
          // timeout so the UI doesn't hang on a transient RPC stall.
          try {
            const status = await gatewayRpcWithTimeout('status', undefined, 3_000)
            const data =
              typeof status === 'object' && status !== null ? status : {}
            return json({ connected: true, ok: true, ...data })
          } catch {
            // WS is live — report connected even if the heavy RPC stalled.
            return json({ connected: true, ok: true, degraded: true })
          }
        }

        try {
          const status = await gatewayRpcWithTimeout('status', undefined, 10_000)
          const data =
            typeof status === 'object' && status !== null ? status : {}
          return json({ connected: true, ok: true, ...data })
        } catch {
          return json({ connected: false, ok: false }, { status: 503 })
        }
      },
    },
  },
})
