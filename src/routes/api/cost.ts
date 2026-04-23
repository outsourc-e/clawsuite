import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayMethodOnBackoff, gatewayRpc } from '../../server/gateway'
import {
  buildCostSummary,
  isGatewayMethodUnavailable,
} from '../../server/usage-cost'
import { isAuthenticated } from '@/server/auth-middleware'

const UNAVAILABLE_MESSAGE = 'Unavailable on this Gateway version'
const REQUEST_TIMEOUT_MS = 5_000 // 5s cap — cost is not worth a long hang
// Cache the last successful response so a transient gateway stall doesn't
// blank out the dashboard. Returns stale data with `stale: true` while the
// gateway is recovering.
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min stale window

let lastSuccess: { data: unknown; ts: number } | null = null

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return String(error)
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    }),
  ])
}

export const Route = createFileRoute('/api/cost')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        // If this RPC is on backoff, skip the gateway entirely.
        if (gatewayMethodOnBackoff('usage.cost')) {
          if (lastSuccess) {
            return json({
              ok: true,
              cost: lastSuccess.data,
              stale: true,
              staleError: 'usage.cost on gateway backoff',
              staleAgeMs: Date.now() - lastSuccess.ts,
            })
          }
          return json({
            ok: true,
            cost: null,
            unavailable: true,
            reason: 'usage.cost on gateway backoff',
          })
        }

        try {
          const payload = await withTimeout(
            gatewayRpc('usage.cost', { days: 30 }),
            REQUEST_TIMEOUT_MS,
            'usage.cost',
          )
          const cost = buildCostSummary(payload)
          lastSuccess = { data: cost, ts: Date.now() }
          return json({ ok: true, cost })
        } catch (error) {
          if (isGatewayMethodUnavailable(error)) {
            return json(
              {
                ok: false,
                unavailable: true,
                error: UNAVAILABLE_MESSAGE,
              },
              { status: 501 },
            )
          }

          // Serve stale cache when the live gateway stalls, so the dashboard
          // keeps rendering the last known numbers with a stale marker instead
          // of flipping to error state.
          if (lastSuccess && Date.now() - lastSuccess.ts < CACHE_TTL_MS) {
            return json({
              ok: true,
              cost: lastSuccess.data,
              stale: true,
              staleError: readErrorMessage(error),
              staleAgeMs: Date.now() - lastSuccess.ts,
            })
          }

          return json(
            {
              ok: false,
              error: readErrorMessage(error),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
