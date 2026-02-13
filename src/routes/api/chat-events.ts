import { createFileRoute } from '@tanstack/react-router'
import { createGatewayStreamConnection } from '../../server/gateway-stream'
import { isAuthenticated } from '../../server/auth-middleware'

/**
 * Extract text content from a gateway message.
 * Message format: { role: "assistant", content: [{ type: "text", text: "..." }, ...] }
 */
function extractTextFromMessage(message: any): string {
  if (!message?.content) return ''
  
  // Handle array content format
  if (Array.isArray(message.content)) {
    return message.content
      .filter((block: any) => block?.type === 'text' && block?.text)
      .map((block: any) => block.text)
      .join('')
  }
  
  // Handle string content format
  if (typeof message.content === 'string') {
    return message.content
  }
  
  return ''
}

/**
 * SSE endpoint that streams all chat events from the gateway.
 * This allows the client to receive real-time updates for:
 * - User messages from external channels (Telegram, Discord, etc.)
 * - Assistant streaming responses
 * - Tool calls and their results
 * - Session state changes
 */
export const Route = createFileRoute('/api/chat-events')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Auth check
        if (!isAuthenticated(request)) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          )
        }

        const url = new URL(request.url)
        const sessionKeyParam = url.searchParams.get('sessionKey')?.trim()
        
        const encoder = new TextEncoder()
        let conn: Awaited<ReturnType<typeof createGatewayStreamConnection>> | null = null
        let streamClosed = false
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null

        const stream = new ReadableStream({
          async start(controller) {
            const sendEvent = (event: string, data: unknown) => {
              if (streamClosed) return
              try {
                const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
                controller.enqueue(encoder.encode(payload))
              } catch {
                // Stream may be closed
              }
            }

            const closeStream = () => {
              if (streamClosed) return
              streamClosed = true
              
              if (heartbeatTimer) {
                clearInterval(heartbeatTimer)
                heartbeatTimer = null
              }
              
              try {
                controller.close()
              } catch {
                // ignore
              }
              
              conn?.close().catch(() => {})
            }

            try {
              // Connect to gateway
              conn = await createGatewayStreamConnection()
              
              sendEvent('connected', { 
                timestamp: Date.now(),
                sessionKey: sessionKeyParam || 'all',
              })

              // Listen for agent events (streaming responses)
              conn.on('agent', (payload: any) => {
                const eventSessionKey = payload?.sessionKey || payload?.context?.sessionKey
                
                // Filter by session if specified
                if (sessionKeyParam && eventSessionKey && eventSessionKey !== sessionKeyParam) {
                  return
                }

                const stream = payload?.stream
                const data = payload?.data
                const runId = payload?.runId

                if (stream === 'assistant' && data?.text) {
                  sendEvent('chunk', {
                    text: data.text,
                    runId,
                    sessionKey: eventSessionKey || sessionKeyParam || 'main',
                  })
                } else if (stream === 'thinking' && data?.text) {
                  sendEvent('thinking', {
                    text: data.text,
                    runId,
                    sessionKey: eventSessionKey || sessionKeyParam || 'main',
                  })
                } else if (stream === 'tool') {
                  sendEvent('tool', {
                    phase: data?.phase,
                    name: data?.name,
                    toolCallId: data?.toolCallId,
                    args: data?.args,
                    runId,
                    sessionKey: eventSessionKey || sessionKeyParam || 'main',
                  })
                }
              })

              // Listen for chat events (messages, state changes)
              // Protocol: state = "delta" | "final" | "error" | "aborted"
              // CRITICAL: delta sends FULL accumulated text, not incremental
              conn.on('chat', (payload: any) => {
                const eventSessionKey = payload?.sessionKey || payload?.context?.sessionKey
                
                // Filter by session if specified
                if (sessionKeyParam && eventSessionKey && eventSessionKey !== sessionKeyParam) {
                  return
                }

                const state = payload?.state
                const message = payload?.message
                const runId = payload?.runId
                const targetSessionKey = eventSessionKey || sessionKeyParam || 'main'

                // Handle streaming delta - extract full text and send as chunk
                if (state === 'delta' && message) {
                  const text = extractTextFromMessage(message)
                  if (text) {
                    sendEvent('chunk', {
                      text,
                      runId,
                      sessionKey: targetSessionKey,
                      fullReplace: true, // Delta sends full accumulated text
                    })
                  }
                  return
                }

                // Handle terminal states
                if (state === 'final') {
                  sendEvent('done', {
                    state: 'final',
                    runId,
                    sessionKey: targetSessionKey,
                    message,
                  })
                  return
                }
                
                if (state === 'error') {
                  sendEvent('done', {
                    state: 'error',
                    errorMessage: payload?.errorMessage,
                    runId,
                    sessionKey: targetSessionKey,
                  })
                  return
                }
                
                if (state === 'aborted') {
                  sendEvent('done', {
                    state: 'aborted',
                    runId,
                    sessionKey: targetSessionKey,
                  })
                  return
                }

                // Check for incoming user message from external channels
                if (message && message.role === 'user') {
                  sendEvent('user_message', {
                    message,
                    sessionKey: targetSessionKey,
                    source: payload?.source || payload?.channel || 'external',
                  })
                  return
                }

                // Check for complete assistant message (non-streaming)
                if (message && message.role === 'assistant' && !state) {
                  sendEvent('message', {
                    message,
                    sessionKey: targetSessionKey,
                  })
                  return
                }

                // Other state transitions
                if (state === 'started' || state === 'thinking') {
                  sendEvent('state', {
                    state,
                    runId,
                    sessionKey: targetSessionKey,
                  })
                }
              })

              // Handle other events that might contain messages
              conn.on('other', (eventName: string, payload: any) => {
                const eventSessionKey = payload?.sessionKey || payload?.context?.sessionKey
                
                // Filter by session if specified
                if (sessionKeyParam && eventSessionKey && eventSessionKey !== sessionKeyParam) {
                  return
                }

                // Look for message delivery events
                if (
                  eventName === 'message.received' ||
                  eventName === 'chat.message' ||
                  eventName === 'channel.message'
                ) {
                  const message = payload?.message || payload
                  if (message?.role === 'user') {
                    sendEvent('user_message', {
                      message,
                      sessionKey: eventSessionKey || sessionKeyParam || 'main',
                      source: payload?.source || payload?.channel || eventName,
                    })
                  } else if (message?.role === 'assistant') {
                    sendEvent('message', {
                      message,
                      sessionKey: eventSessionKey || sessionKeyParam || 'main',
                    })
                  }
                }
              })

              conn.on('close', () => {
                if (!streamClosed) {
                  sendEvent('disconnected', { reason: 'Gateway connection closed' })
                  closeStream()
                }
              })

              conn.on('error', (err: any) => {
                if (!streamClosed) {
                  sendEvent('error', {
                    message: err?.message ?? 'Gateway error',
                  })
                  // Don't close on error, try to recover
                }
              })

              // Heartbeat to keep connection alive
              heartbeatTimer = setInterval(() => {
                sendEvent('heartbeat', { timestamp: Date.now() })
              }, 30000)

            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err)
              sendEvent('error', { message: errorMsg })
              closeStream()
            }
          },
          cancel() {
            streamClosed = true
            if (heartbeatTimer) {
              clearInterval(heartbeatTimer)
              heartbeatTimer = null
            }
            conn?.close().catch(() => {})
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
      },
    },
  },
})
