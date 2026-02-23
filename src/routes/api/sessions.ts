import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'
import { isAuthenticated } from '../../server/auth-middleware'

type SessionsListGatewayResponse = {
  sessions?: Array<Record<string, unknown>>
}

type SessionsListResponse = {
  sessions: Array<Record<string, unknown>>
}

type SessionsPatchResponse = {
  ok?: boolean
  key?: string
  path?: string
  entry?: Record<string, unknown>
}

type SessionsResolveResponse = {
  ok?: boolean
  key?: string
}

function deriveFriendlyIdFromKey(key: unknown): string {
  if (typeof key !== 'string' || key.trim().length === 0) return 'main'
  const parts = key.split(':')
  const tail = parts[parts.length - 1]
  return tail && tail.trim().length > 0 ? tail.trim() : key
}

function normalizeSessions(
  payload: SessionsListGatewayResponse,
): SessionsListResponse {
  const sessions: Array<Record<string, unknown>> = Array.isArray(
    payload.sessions,
  )
    ? payload.sessions
    : []
  const normalized = sessions.map((session) => {
    const rawKey = session.key
    const key = typeof rawKey === 'string' ? rawKey : ''
    const rawFriendly = session.friendlyId
    const friendlyIdFromPayload =
      typeof rawFriendly === 'string' ? rawFriendly.trim() : ''
    const friendlyId =
      friendlyIdFromPayload.length > 0
        ? friendlyIdFromPayload
        : deriveFriendlyIdFromKey(key)
    return {
      ...session,
      key,
      friendlyId,
    }
  })

  return { sessions: normalized }
}

export const Route = createFileRoute('/api/sessions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Auth check
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const payload = await gatewayRpc<SessionsListGatewayResponse>(
            'sessions.list',
            {
              limit: 50,
              includeLastMessage: true,
              includeDerivedTitles: true,
            },
          )

          return json(normalizeSessions(payload))
        } catch (err) {
          return json(
            {
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >

          const requestedLabel =
            typeof body.label === 'string' ? body.label.trim() : ''
          const label = requestedLabel || undefined

          const requestedFriendlyId =
            typeof body.friendlyId === 'string' ? body.friendlyId.trim() : ''
          // Build a proper isolated session key in the format the gateway expects.
          // A bare UUID as key causes the gateway to resolve it against the current
          // operator session context (e.g. discord:g-...), linking the spawned session
          // to the Discord channel. Using 'agent:main:subagent:<uuid>' creates a
          // genuinely isolated subagent session.
          const friendlyId = requestedFriendlyId || randomUUID()
          const sessionKey = `agent:main:subagent:${friendlyId}`

          const requestedModel =
            typeof body.model === 'string' ? body.model.trim() : ''
          const model = requestedModel || undefined

          const requestedSystemPrompt =
            typeof body.systemPrompt === 'string' ? body.systemPrompt.trim() : ''
          const systemPrompt = requestedSystemPrompt || undefined

          // Step 1: Create the isolated session with the proper key format.
          // We intentionally do NOT include the model here — a separate patch below
          // handles model assignment (matches the openclaw sessions_spawn pattern).
          const baseParams: Record<string, unknown> = { key: sessionKey }
          if (label) baseParams.label = label
          if (systemPrompt) baseParams.systemPrompt = systemPrompt

          const payload = await gatewayRpc<SessionsPatchResponse>(
            'sessions.patch',
            baseParams,
          )

          const returnedKeyRaw = payload.key
          const returnedKey =
            typeof returnedKeyRaw === 'string' && returnedKeyRaw.trim().length > 0
              ? returnedKeyRaw.trim()
              : ''
          // Use the returned key if the gateway echoed one; otherwise fall back to
          // the key we sent (some gateway versions omit it on success).
          const resolvedSessionKey = returnedKey || sessionKey
          if (!resolvedSessionKey) {
            throw new Error('gateway returned an invalid response')
          }

          // Step 2: Apply model as a separate patch (matches openclaw spawn pattern).
          // This ensures model is set even if Step 1 doesn't support a model param.
          let modelApplied = false
          if (model) {
            try {
              await gatewayRpc<SessionsPatchResponse>('sessions.patch', {
                key: resolvedSessionKey,
                model,
              })
              modelApplied = true
            } catch {
              // Model not supported or invalid — session still usable with gateway default
              modelApplied = false
            }
          }

          // Register the friendly id alias so subsequent lookups resolve quickly.
          await gatewayRpc<SessionsResolveResponse>('sessions.resolve', {
            key: resolvedSessionKey,
            includeUnknown: true,
            includeGlobal: true,
          }).catch(() => ({ ok: false }))

          return json({
            ok: true,
            sessionKey: resolvedSessionKey,
            friendlyId,
            entry: payload.entry,
            modelApplied,
          })
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
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >

          const rawSessionKey =
            typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
          const rawFriendlyId =
            typeof body.friendlyId === 'string' ? body.friendlyId.trim() : ''
          const label =
            typeof body.label === 'string' ? body.label.trim() : undefined

          let sessionKey = rawSessionKey
          const friendlyId = rawFriendlyId

          if (friendlyId) {
            const resolved = await gatewayRpc<SessionsResolveResponse>(
              'sessions.resolve',
              {
                key: friendlyId,
                includeUnknown: true,
                includeGlobal: true,
              },
            )
            const resolvedKey =
              typeof resolved.key === 'string' ? resolved.key.trim() : ''
            if (resolvedKey.length > 0) sessionKey = resolvedKey
          }

          if (!sessionKey) {
            return json(
              { ok: false, error: 'sessionKey required' },
              { status: 400 },
            )
          }

          const params: Record<string, unknown> = { key: sessionKey }
          if (label) params.label = label

          const payload = await gatewayRpc<SessionsPatchResponse>(
            'sessions.patch',
            params,
          )

          return json({
            ok: true,
            sessionKey,
            entry: payload.entry,
          })
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
      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const rawSessionKey = url.searchParams.get('sessionKey') ?? ''
          const rawFriendlyId = url.searchParams.get('friendlyId') ?? ''
          let sessionKey = rawSessionKey.trim()
          const friendlyId = rawFriendlyId.trim()

          if (friendlyId) {
            const resolved = await gatewayRpc<SessionsResolveResponse>(
              'sessions.resolve',
              {
                key: friendlyId,
                includeUnknown: true,
                includeGlobal: true,
              },
            )
            const resolvedKey =
              typeof resolved.key === 'string' ? resolved.key.trim() : ''
            if (resolvedKey.length > 0) sessionKey = resolvedKey
          }

          if (!sessionKey) {
            return json(
              { ok: false, error: 'sessionKey required' },
              { status: 400 },
            )
          }

          await gatewayRpc('sessions.delete', { key: sessionKey })
          if (friendlyId && friendlyId !== sessionKey) {
            await gatewayRpc('sessions.delete', { key: friendlyId }).catch(
              () => ({}),
            )
          }

          return json({ ok: true, sessionKey })
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
