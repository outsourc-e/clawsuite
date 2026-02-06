import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'

const MAX_MESSAGES = 8
const MAX_CHAR_PER_MESSAGE = 400

function normalizeMessages(raw: unknown): Array<{ role: string; text: string }> {
  if (!Array.isArray(raw)) return []
  const normalized: Array<{ role: string; text: string }> = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const roleRaw = (entry as { role?: unknown }).role
    const textRaw = (entry as { text?: unknown }).text
    const role = typeof roleRaw === 'string' ? roleRaw : 'user'
    if (role !== 'user' && role !== 'assistant') continue
    const text = typeof textRaw === 'string' ? textRaw.trim() : ''
    if (!text) continue
    normalized.push({
      role,
      text: text.slice(0, MAX_CHAR_PER_MESSAGE),
    })
    if (normalized.length >= MAX_MESSAGES) break
  }
  return normalized
}

function toTitleCase(text: string): string {
  return text
    .split(/\s+/)
    .map((word) => {
      if (!word) return ''
      const lower = word.toLowerCase()
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
    })
    .filter(Boolean)
    .join(' ')
}

function fallbackTitle(messages: Array<{ role: string; text: string }>): string {
  const firstUser = messages.find((msg) => msg.role === 'user')
  if (!firstUser) return ''
  const words = firstUser.text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
  if (!words.length) return ''
  return toTitleCase(words.join(' '))
}

type GatewayTitleResponse = {
  ok?: boolean
  title?: string
  error?: string
}

export const Route = createFileRoute('/api/session-title')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >

          const sessionKey =
            typeof body.sessionKey === 'string' && body.sessionKey.trim().length > 0
              ? body.sessionKey.trim()
              : ''
          const friendlyId =
            typeof body.friendlyId === 'string' && body.friendlyId.trim().length > 0
              ? body.friendlyId.trim()
              : ''
          const messages = normalizeMessages(body.messages)
          const maxWords = Math.max(
            3,
            Math.min(7, Number(body.maxWords) || 5),
          )

          if (!sessionKey && !friendlyId) {
            return json(
              { ok: false, error: 'sessionKey or friendlyId required' },
              { status: 400 },
            )
          }

          if (messages.length < 2) {
            return json(
              { ok: false, error: 'insufficient message context' },
              { status: 400 },
            )
          }

          let title = ''
          let usedFallback = false

          try {
            const payload = await gatewayRpc<GatewayTitleResponse>(
              'sessions.generateTitle',
              {
                sessionKey: sessionKey || undefined,
                friendlyId: friendlyId || undefined,
                messages,
                maxWords,
              },
            )
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
            if (payload && typeof payload.title === 'string') {
              title = payload.title.trim()
            }
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err)
            if (!title) {
              const fallback = fallbackTitle(messages)
              if (fallback) {
                usedFallback = true
                title = fallback
              } else {
                return json(
                  {
                    ok: false,
                    error: errorMessage || 'failed to generate title',
                  },
                  { status: 502 },
                )
              }
            }
          }

          if (!title) {
            const fallback = fallbackTitle(messages)
            if (fallback) {
              title = fallback
              usedFallback = true
            }
          }

          if (!title) {
            return json(
              { ok: false, error: 'unable to derive title' },
              { status: 422 },
            )
          }

          const trimmed = title.trim().replace(/\s+/g, ' ')

          return json({
            ok: true,
            title: trimmed,
            fallback: usedFallback,
            source: usedFallback ? 'fallback' : 'gateway',
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
    },
  },
})
