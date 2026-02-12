import { createFileRoute } from '@tanstack/react-router'
import { getClientIp, rateLimit, rateLimitResponse } from '../../server/rate-limit'
import { getTerminalSession } from '../../server/terminal-sessions'

export const Route = createFileRoute('/api/terminal-input')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request)
        if (!rateLimit(`terminal:${ip}`, 60, 60_000)) {
          return rateLimitResponse()
        }

        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
        const data = typeof body.data === 'string' ? body.data : ''
        const session = getTerminalSession(sessionId)
        if (!session) {
          return new Response(JSON.stringify({ ok: false }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        session.sendInput(data)
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
