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

function encodeSplatPath(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export const Route = createFileRoute('/api/workspace/dispatch/files/$')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const ip = getClientIp(request)
        if (!rateLimit(`workspace-dispatch-files:${ip}`, 120, 60_000)) {
          return rateLimitResponse()
        }

        const splat = typeof params._splat === 'string' ? params._splat : ''
        if (!splat) {
          return json({ ok: false, error: 'file path is required' }, { status: 400 })
        }

        try {
          return await forwardWorkspaceRequest({
            request,
            path: `/dispatch/files/${encodeSplatPath(splat)}`,
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
