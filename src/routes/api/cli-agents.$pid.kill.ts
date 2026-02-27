import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

export const Route = createFileRoute('/api/cli-agents/$pid/kill')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const pid = Number(params.pid)
        if (!Number.isFinite(pid) || !Number.isInteger(pid) || pid <= 0) {
          return json({ ok: false, error: 'Invalid pid' }, { status: 400 })
        }

        try {
          process.kill(pid, 'SIGTERM')
          return json({ ok: true })
        } catch (error) {
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'ESRCH'
          ) {
            // Process already exited; treat as success.
            return json({ ok: true })
          }

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
