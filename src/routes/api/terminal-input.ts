import { createFileRoute } from '@tanstack/react-router'
import { getTerminalSession } from '../../server/terminal-sessions'

export const Route = createFileRoute('/api/terminal-input')({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
        await session.sendInput(data)
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
