import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '@/server/gateway'
import { isAuthenticated } from '@/server/auth-middleware'

export const Route = createFileRoute('/api/gateway/nodes')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const result = await gatewayRpc<Record<string, unknown>>(
            'nodes.list',
            {},
          )
          return json({ ok: true, data: result })
        } catch (err) {
          console.error('gateway nodes.list failed:', err)
          return json({ ok: true, data: { nodes: [] } })
        }
      },
    },
  },
})
