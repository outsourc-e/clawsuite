import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'
import { getConfiguredProviderNames } from '../../server/providers'
import {
  buildUsageSummary,
  isGatewayMethodUnavailable,
} from '../../server/usage-cost'
import { isAuthenticated } from '@/server/auth-middleware'

const UNAVAILABLE_MESSAGE = 'Unavailable on this Gateway version'
const REQUEST_TIMEOUT_MS = 5000 // 5 second timeout

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return String(error)
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId!)
  }
}

export const Route = createFileRoute('/api/usage')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const configuredProviders = getConfiguredProviderNames()

          const sessionsUsagePayload = await withTimeout(
            gatewayRpc('sessions.usage', {
              limit: 1000,
              includeContextWeight: true,
            }),
            REQUEST_TIMEOUT_MS,
            'Gateway request timed out',
          )

          let usageStatusPayload: unknown
          try {
            usageStatusPayload = await withTimeout(
              gatewayRpc('usage.status', {}),
              REQUEST_TIMEOUT_MS,
              'Usage status request timed out',
            )
          } catch (error) {
            if (!isGatewayMethodUnavailable(error)) {
              // Keep usage totals available even when provider quota snapshots fail.
              usageStatusPayload = undefined
            }
          }

          const usage = buildUsageSummary({
            configuredProviders,
            sessionsUsagePayload,
            usageStatusPayload,
          })

          return json({ ok: true, usage })
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
