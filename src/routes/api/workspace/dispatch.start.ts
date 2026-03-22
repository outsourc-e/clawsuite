import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  safeErrorMessage,
} from '../../../server/rate-limit'
import { forwardWorkspaceRequest } from '../../../server/workspace-proxy'

export const Route = createFileRoute('/api/workspace/dispatch/start')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const ip = getClientIp(request)
        if (!rateLimit(`workspace-dispatch-start:${ip}`, 10, 60_000)) {
          return rateLimitResponse()
        }

        try {
          return await forwardWorkspaceRequest({
            request,
            path: `/dispatch/start`,
          })
        } catch (error) {
          return json(
            { ok: false, error: safeErrorMessage(error) },
            { status: 502 },
          )
        }
      },
    },
  },
})
