import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../../server/gateway'
import { isAuthenticated } from '../../../server/auth-middleware'

type SessionsListGatewayResponse = {
  sessions?: Array<Record<string, unknown>>
}

export const Route = createFileRoute('/api/sessions/$sessionKey/status')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const { sessionKey } = params

        if (!sessionKey || sessionKey.trim().length === 0) {
          return json({ ok: false, error: 'sessionKey required' }, { status: 400 })
        }

        try {
          // sessions.get does not exist on the gateway — use sessions.list and filter by key
          const payload = await gatewayRpc<SessionsListGatewayResponse>(
            'sessions.list',
            { limit: 100 },
          )

          const sessions = Array.isArray(payload.sessions) ? payload.sessions : []
          const session = sessions.find(
            (s) =>
              s.key === sessionKey ||
              s.key === `agent:main:${sessionKey}` ||
              String(s.key ?? '').endsWith(`:${sessionKey}`),
          )

          if (!session) {
            return json({ ok: false, status: 'not_found' }, { status: 404 })
          }

          const result: Record<string, unknown> = { ...session }
          return json({ ok: true, status: result.status ?? 'unknown', ...result })
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
