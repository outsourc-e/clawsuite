import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { gatewayCronRpc, normalizeCronJobs } from '@/server/cron'

export const Route = createFileRoute('/api/cron/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const payload = await gatewayCronRpc(
            ['cron.list', 'cron.jobs.list', 'scheduler.jobs.list'],
            { includeDisabled: true },
          )

          return json({
            jobs: normalizeCronJobs(payload),
          })
        } catch (err) {
          return json(
            {
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
