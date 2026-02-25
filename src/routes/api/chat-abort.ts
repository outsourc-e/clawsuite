import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'

type AbortRequestBody = {
  sessionKey?: string
}

export const Route = createFileRoute('/api/chat-abort')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth check
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => null)) as AbortRequestBody | null
          if (!body) {
            return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
          }

          const sessionKey = body.sessionKey?.trim() || undefined

          await gatewayRpc('chat.abort', { sessionKey })

          return json({ ok: true })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return json({ ok: false, error: message }, { status: 500 })
        }
      },
    },
  },
})
