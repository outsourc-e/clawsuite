import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../../server/gateway'
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

        try {
          const status = await gatewayRpcWithTimeout('status')
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
