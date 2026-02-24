import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'
import { getPendingApprovals, getAllApprovals } from '@/server/exec-approval-store'

export const Route = createFileRoute('/api/gateway/approvals/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const pending = getPendingApprovals()
          const all = getAllApprovals()
          return json({
            ok: true,
            pending,
            approvals: all,
          })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
              pending: [],
              approvals: [],
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
