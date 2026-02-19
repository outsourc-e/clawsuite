import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { HubTask } from './task-board'

type OutputMessage = {
  role: 'assistant' | 'user' | 'tool'
  content: string
  timestamp: number
  done?: boolean
}

export type AgentOutputPanelProps = {
  agentName: string
  sessionKey: string | null
  tasks: HubTask[]
  onClose: () => void
  /** Compact mode: no outer border/padding and no internal header. Use inside LiveActivityPanel. */
  compact?: boolean
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseSsePayload(raw: string): Record<string, unknown> | null {
  try {
    return toRecord(JSON.parse(raw))
  } catch {
    return null
  }
}

// Strip DeepSeek-R1 <think>...</think> reasoning blocks from displayed content.
// Applied at render time only — raw content is preserved in state for streaming continuity.
function stripThinkBlocks(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trimStart()
}

function truncateArgs(args: unknown, maxLength = 80): string {
  const raw = typeof args === 'string' ? args : JSON.stringify(args)
  if (!raw || raw === '{}' || raw === 'undefined') return ''
  if (raw.length <= maxLength) return raw
  return `${raw.slice(0, maxLength - 1)}…`
}

export function AgentOutputPanel({
  agentName,
  sessionKey,
  tasks,
  onClose,
  compact = false,
}: AgentOutputPanelProps) {
  const [messages, setMessages] = useState<OutputMessage[]>([])
  const [sessionEnded, setSessionEnded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset state when sessionKey changes
  useEffect(() => {
    setMessages([])
    setSessionEnded(false)
  }, [sessionKey])

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // SSE stream consumption
  useEffect(() => {
    if (!sessionKey) return

    const source = new EventSource(`/api/chat-events?sessionKey=${encodeURIComponent(sessionKey)}`)

    // 'chunk' — streaming text from assistant
    source.addEventListener('chunk', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data as string)
      if (!payload) return
      const text = readString(payload.text) || readString(payload.content) || readString(payload.chunk)
      if (!text) return

      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant' && !last.done) {
          // Append to last assistant message (only if not a done marker)
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + text },
          ]
        }
        return [...prev, { role: 'assistant', content: text, timestamp: Date.now() }]
      })
    })

    // 'tool' — tool call event
    source.addEventListener('tool', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data as string)
      if (!payload) return
      const name = readString(payload.name) || 'tool'
      const args = payload.args ?? payload.input ?? payload.parameters
      const argsStr = truncateArgs(args)
      const content = argsStr ? `${name}(${argsStr})` : `${name}()`
      setMessages((prev) => [
        ...prev,
        { role: 'tool', content, timestamp: Date.now() },
      ])
    })

    // 'done' — session/run completed: add inline ✓ Done marker
    source.addEventListener('done', () => {
      setSessionEnded(true)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '✓ Done', timestamp: Date.now(), done: true },
      ])
    })

    // 'user_message' — user turn sent to the agent
    source.addEventListener('user_message', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data as string)
      if (!payload) return
      const text = readString(payload.text) || readString(payload.content) || readString(payload.message)
      if (!text) return
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: text, timestamp: Date.now() },
      ])
    })

    // 'message' — generic fallback for unnamed SSE lines (also handles user turns)
    source.onmessage = (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data as string)
      if (!payload) return
      const role = readString(payload.role)
      const text = readString(payload.text) || readString(payload.content)
      if (!text) return
      if (role === 'user') {
        setMessages((prev) => [
          ...prev,
          { role: 'user', content: text, timestamp: Date.now() },
        ])
        return
      }
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant' && !last.done) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + text },
          ]
        }
        return [...prev, { role: 'assistant', content: text, timestamp: Date.now() }]
      })
    }

    return () => {
      source.close()
    }
  }, [sessionKey])

  const inner = (
    <>
      {/* Task list */}
      {tasks.length > 0 && (
        <div className={cn('space-y-1.5', compact ? 'mb-2' : 'mb-2')}>
          {tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-lg bg-primary-50 px-3 py-2 dark:bg-neutral-800/80"
            >
              <div className="flex items-center gap-2">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-primary-700 dark:text-neutral-100">
                  {task.title}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-primary-400">
                {task.status === 'in_progress'
                  ? 'Working...'
                  : task.status === 'done'
                    ? 'Completed'
                    : 'Queued'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Terminal output */}
      {sessionKey ? (
        <div
          ref={scrollRef}
          className={cn(
            'overflow-y-auto rounded-lg bg-neutral-900 p-3 font-mono text-[11px] leading-relaxed',
            compact ? 'h-full min-h-[120px]' : 'mt-1 min-h-[80px] max-h-[220px]',
          )}
        >
          {messages.length === 0 && !sessionEnded ? (
            <p className="animate-pulse text-neutral-400">Waiting for response…</p>
          ) : (
            <>
              {messages.map((msg, index) =>
                msg.role === 'tool' ? (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="text-neutral-500"
                  >
                    <span className="text-neutral-600">▶ </span>
                    {msg.content}
                  </div>
                ) : msg.role === 'user' ? (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="my-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-neutral-300"
                  >
                    <span className="mr-1 text-[9px] uppercase tracking-wider text-neutral-500">you »</span>
                    {msg.content}
                  </div>
                ) : msg.done ? (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="border-t border-neutral-800 pt-1 text-emerald-400"
                  >
                    {msg.content}
                  </div>
                ) : (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="whitespace-pre-wrap text-neutral-100"
                  >
                    {stripThinkBlocks(msg.content)}
                  </div>
                ),
              )}
              {!sessionEnded && messages.length > 0 && (
                <span className="animate-pulse text-green-400">▊</span>
              )}
            </>
          )}
        </div>
      ) : (
        // Fallback placeholder when no sessionKey
        <div className={cn('rounded-lg bg-neutral-900 p-3 font-mono text-[11px] text-green-400', compact ? 'flex-1' : 'mt-3 min-h-[80px]')}>
          {tasks.length === 0 ? (
            <p className="text-neutral-500">No dispatched tasks yet.</p>
          ) : (
            <>
              <p>$ Dispatching to {agentName}…</p>
              <p className="animate-pulse">▊</p>
            </>
          )}
        </div>
      )}
    </>
  )

  if (compact) {
    return (
      <div className="flex h-full flex-col p-3">
        {inner}
      </div>
    )
  }

  return (
    <div className="border-t border-primary-200 dark:border-neutral-700 p-3">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-primary-900 dark:text-neutral-100">
          {agentName} Output
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-primary-400 transition-colors hover:text-primary-600 dark:hover:text-neutral-200"
        >
          ✕
        </button>
      </div>
      {inner}
    </div>
  )
}
