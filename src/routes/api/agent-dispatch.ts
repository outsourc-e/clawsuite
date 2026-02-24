import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'
import { isAuthenticated } from '../../server/auth-middleware'

type DispatchGatewayResponse = {
  runId?: string
}

function looksLikeMethodMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('method') &&
    (message.includes('not found') || message.includes('unknown'))
  )
}

async function dispatchViaGateway(payload: {
  sessionKey: string
  message: string
  idempotencyKey: string
}) {
  try {
    return await gatewayRpc<DispatchGatewayResponse>('sessions.send', {
      sessionKey: payload.sessionKey,
      message: payload.message,
      timeoutMs: 120_000,
      idempotencyKey: payload.idempotencyKey,
    })
  } catch (error) {
    if (!looksLikeMethodMissingError(error)) throw error

    return gatewayRpc<DispatchGatewayResponse>('chat.send', {
      sessionKey: payload.sessionKey,
      message: payload.message,
      deliver: false,
      timeoutMs: 120_000,
      idempotencyKey: payload.idempotencyKey,
    })
  }
}

export const Route = createFileRoute('/api/agent-dispatch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const sessionKey =
            typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
          const message = String(body.message ?? '').trim()

          if (!sessionKey) {
            return json(
              { ok: false, error: 'sessionKey required' },
              { status: 400 },
            )
          }
          if (!message) {
            return json(
              { ok: false, error: 'message required' },
              { status: 400 },
            )
          }

          const idempotencyKey =
            typeof body.idempotencyKey === 'string' &&
            body.idempotencyKey.trim().length > 0
              ? body.idempotencyKey.trim()
              : randomUUID()

          const result = await dispatchViaGateway({
            sessionKey,
            message,
            idempotencyKey,
          })

          return json({
            ok: true,
            missionId:
              typeof body.missionId === 'string' ? body.missionId.trim() : '',
            agentId: typeof body.agentId === 'string' ? body.agentId.trim() : '',
            sessionKey,
            runId: result.runId ?? null,
          })
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
