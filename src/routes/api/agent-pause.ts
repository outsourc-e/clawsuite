import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { gatewayRpc } from '../../server/gateway'

export const Route = createFileRoute('/api/agent-pause')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!isAuthenticated(request)) {
            return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
          }

          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const sessionKey =
            typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
          const pause = typeof body.pause === 'boolean' ? body.pause : null

          if (!sessionKey) {
            return json(
              { ok: false, error: 'sessionKey required' },
              { status: 400 },
            )
          }

          if (pause === null) {
            return json(
              { ok: false, error: 'pause required' },
              { status: 400 },
            )
          }

          const methodCandidates = ['agent.pause', 'agents.pause']
          let lastError: unknown = null

          for (const method of methodCandidates) {
            try {
              await gatewayRpc(method, { sessionKey, pause })
              lastError = null
              break
            } catch (error) {
              lastError = error
            }
          }

          if (lastError) {
            throw lastError
          }

          return json({ ok: true, paused: pause })
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
