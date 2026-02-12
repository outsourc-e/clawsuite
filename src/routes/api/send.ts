import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'

type SessionsResolveResponse = {
  ok?: boolean
  key?: string
}

export const Route = createFileRoute('/api/send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >

          const rawSessionKey =
            typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
          const friendlyId =
            typeof body.friendlyId === 'string' ? body.friendlyId.trim() : ''
          const message = String(body.message ?? '')
          const thinking =
            typeof body.thinking === 'string' ? body.thinking : undefined
          const attachments = Array.isArray(body.attachments)
            ? body.attachments
            : undefined
          const clientId =
            typeof body.clientId === 'string' && body.clientId.trim().length > 0
              ? body.clientId.trim()
              : undefined

          if (!message.trim() && (!attachments || attachments.length === 0)) {
            return json(
              { ok: false, error: 'message required' },
              { status: 400 },
            )
          }

          // Try to resolve session key — it might be a friendlyId that needs resolution
          const keysToResolve = [rawSessionKey, friendlyId].filter(
            (k) => k.length > 0,
          )
          let sessionKey = ''

          for (const candidate of keysToResolve) {
            try {
              const resolved = await gatewayRpc<SessionsResolveResponse>(
                'sessions.resolve',
                {
                  key: candidate,
                  includeUnknown: true,
                  includeGlobal: true,
                },
              )
              const resolvedKey =
                typeof resolved.key === 'string' ? resolved.key.trim() : ''
              if (resolvedKey.length > 0) {
                sessionKey = resolvedKey
                break
              }
            } catch {
              // Resolution failed, try next candidate
            }
          }

          // If resolution failed but we have a raw key, use it directly
          // (it might be a full gateway key like agent:codex:main)
          if (!sessionKey && rawSessionKey.length > 0) {
            sessionKey = rawSessionKey
          }

          if (sessionKey.length === 0) {
            sessionKey = 'main'
          }

          const sendPayload: Record<string, unknown> = {
            sessionKey,
            message,
            thinking,
            attachments,
            deliver: false,
            timeoutMs: 120_000,
            idempotencyKey:
              typeof body.idempotencyKey === 'string'
                ? body.idempotencyKey
                : randomUUID(),
          }
          // Note: clientId is NOT sent to gateway (chat.send rejects unknown props)
          // It's only used for client-side optimistic message matching

          const res = await gatewayRpc<{ runId: string }>(
            'chat.send',
            sendPayload,
          )

          return json({ ok: true, ...res, sessionKey, clientId: clientId ?? null })
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err)
          console.error('[/api/send] Error:', errorMessage)
          return json(
            {
              ok: false,
              error: errorMessage,
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
