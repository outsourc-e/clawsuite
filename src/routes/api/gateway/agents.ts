import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '@/server/gateway'
import { isAuthenticated } from '@/server/auth-middleware'

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

export const Route = createFileRoute('/api/gateway/agents')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const result = await gatewayRpcWithTimeout<Record<string, unknown>>(
            'agents.list',
            {},
          )
          return json({ ok: true, data: result })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
