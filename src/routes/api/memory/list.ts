import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { listMemoryFiles } from '../../../server/memory-browser'

export const Route = createFileRoute('/api/memory/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          return json({ files: listMemoryFiles() })
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : 'Failed to list memory files' },
            { status: 500 },
          )
        }
      },
    },
  },
})
