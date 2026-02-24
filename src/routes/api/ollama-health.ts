import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'

export const Route = createFileRoute('/api/ollama-health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const targets = ['http://127.0.0.1:11434/api/tags', 'http://localhost:11434/api/tags']

        for (const target of targets) {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 2500)
          try {
            const response = await fetch(target, {
              method: 'GET',
              signal: controller.signal,
            })
            if (response.ok) {
              return json({ ok: true, endpoint: target })
            }
          } catch {
            // try next endpoint
          } finally {
            clearTimeout(timeout)
          }
        }

        return json({ ok: false }, { status: 503 })
      },
    },
  },
})
