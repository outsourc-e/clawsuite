import { createFileRoute } from '@tanstack/react-router'
import { createTerminalSession } from '../../server/terminal-sessions'

export const Route = createFileRoute('/api/terminal-stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const cwd = typeof body.cwd === 'string' ? body.cwd : undefined
        const cols = typeof body.cols === 'number' ? body.cols : undefined
        const rows = typeof body.rows === 'number' ? body.rows : undefined
        const command = Array.isArray(body.command)
          ? body.command.map(String)
          : ['/bin/zsh']

        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          async start(controller) {
            const session = await createTerminalSession({
              command,
              cwd,
              cols,
              rows,
              pty: true,
            })

            let isStreamActive = true
            const send = (event: string, data: unknown) => {
              if (!isStreamActive || controller.desiredSize === null) {
                return
              }
              try {
                controller.enqueue(
                  encoder.encode(
                    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
                  ),
                )
              } catch {
                isStreamActive = false
              }
            }

            send('session', { sessionId: session.id, execId: session.execId })

            const handleEvent = (payload: any) => {
              send('event', payload)
            }

            const handleError = (error: unknown) => {
              send('error', { message: String(error) })
            }

            const handleClose = () => {
              send('close', { sessionId: session.id })
              if (!isStreamActive) {
                return
              }
              isStreamActive = false
              try {
                controller.close()
              } catch {
                // Stream is already closed/cancelled.
              }
            }

            session.emitter.on('event', handleEvent)
            session.emitter.on('error', handleError)
            session.emitter.on('close', handleClose)

            const keepAlive = setInterval(() => {
              send('ping', { t: Date.now() })
            }, 15000)

            const abort = () => {
              isStreamActive = false
              clearInterval(keepAlive)
              session.emitter.off('event', handleEvent)
              session.emitter.off('error', handleError)
              session.emitter.off('close', handleClose)
            }

            request.signal.addEventListener('abort', abort)
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      },
    },
  },
})
