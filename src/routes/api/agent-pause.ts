import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { gatewayRpc } from '../../server/gateway'

export const Route = createFileRoute('/api/agent-pause')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!isAuthenticated(request)) {
            return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
          }
          const csrfCheck = requireJsonContentType(request)
          if (csrfCheck) return csrfCheck

          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const sessionKey =
            typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
          const pause = typeof body.pause === 'boolean' ? body.pause : null

          if (!sessionKey) {
            return json(
              { ok: false, error: 'sessionKey required' },
              { status: 400 },
            )
          }

          if (pause === null) {
            return json(
              { ok: false, error: 'pause required' },
              { status: 400 },
            )
          }

          // Try dedicated pause RPC first, then fall back to steer with
          // a [PAUSE]/[RESUME] directive so the agent actually receives the
          // signal even when the gateway doesn't expose an agent.pause RPC.
          const methodCandidates = ['agent.pause', 'agents.pause']
          let rpcSucceeded = false

          for (const method of methodCandidates) {
            try {
              await gatewayRpc(method, { sessionKey, pause })
              rpcSucceeded = true
              break
            } catch {
              // method not available — try next
            }
          }

          if (!rpcSucceeded) {
            // Fallback: steer the agent with a pause/resume directive
            const { randomUUID } = await import('node:crypto')
            const directive = pause
              ? '[PAUSE] Stop processing and wait for further instructions.'
              : '[RESUME] Continue working on your current task.'
            await gatewayRpc('chat.send', {
              sessionKey,
              message: `[System Directive] ${directive}`,
              deliver: false,
              timeoutMs: 30_000,
              idempotencyKey: randomUUID(),
            })
          }

          return json({ ok: true, paused: pause })
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
