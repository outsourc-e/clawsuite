import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getGatewayTabsResponse } from '../../../server/browser-monitor'
import { isAuthenticated } from '../../../server/auth-middleware'

export const Route = createFileRoute('/api/browser/tabs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const payload = await getGatewayTabsResponse()
          return json(payload)
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
