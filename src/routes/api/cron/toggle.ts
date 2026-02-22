import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { gatewayCronRpc, normalizeCronBool } from '@/server/cron'

export const Route = createFileRoute('/api/cron/toggle')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!isAuthenticated(request)) {
            return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
          }

          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >

          const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : ''
          if (!jobId) {
            return json({ error: 'jobId is required' }, { status: 400 })
          }

          const enabled = normalizeCronBool(body.enabled, true)

          const payload = await gatewayCronRpc(
            ['cron.update'],
            {
              jobId,
              patch: { enabled },
            },
          )

          return json({ ok: true, payload, enabled })
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
