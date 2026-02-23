import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getGatewayScreenshotResponse } from '../../../server/browser-monitor'
import { isAuthenticated } from '../../../server/auth-middleware'

export const Route = createFileRoute('/api/browser/screenshot')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const url = new URL(request.url)
          const tabId = url.searchParams.get('tabId')
          const payload = await getGatewayScreenshotResponse(tabId)
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
