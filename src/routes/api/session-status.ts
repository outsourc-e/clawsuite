import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'

export const Route = createFileRoute('/api/session-status')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const payload = await gatewayRpc('session_status')
          return json({ ok: true, payload })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
