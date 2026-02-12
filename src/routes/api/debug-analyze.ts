import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { analyzeError, readOpenClawLogs } from '../../server/debug-analyzer'

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export const Route = createFileRoute('/api/debug-analyze')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const terminalOutput =
            typeof body.terminalOutput === 'string' ? body.terminalOutput : ''

          const logContent = await readOpenClawLogs()
          const analysis = await analyzeError(terminalOutput, logContent)
          return json(analysis)
        } catch (error) {
          return json(
            {
              summary: 'Debug analysis request failed.',
              rootCause: toErrorMessage(error),
              suggestedCommands: [],
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
