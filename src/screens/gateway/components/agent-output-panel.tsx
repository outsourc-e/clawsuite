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
  /** Model preset id — shown in header badge e.g. 'pc1-coder', 'sonnet' */
  modelId?: string
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

function payloadMatchesSession(
  payload: Record<string, unknown> | null,
  sessionKey: string,
): boolean {
  if (!payload) return false
  const payloadSessionKey = readString(payload.sessionKey)
  return !payloadSessionKey || payloadSessionKey === sessionKey
}

// Strip DeepSeek-R1 <think>...</think> reasoning blocks from displayed content.
// Applied at render time only — raw content is preserved in state for streaming continuity.
function stripThinkBlocks(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trimStart()
}

function truncateArgs(args: unknown, maxLength = 80): string {
  let raw = ''
  if (typeof args === 'string') {
    raw = args
  } else {
    try {
      raw = JSON.stringify(args)
    } catch {
      raw = ''
    }
  }
  if (!raw || raw === '{}' || raw === 'undefined') return ''
  if (raw.length <= maxLength) return raw
  return `${raw.slice(0, maxLength - 1)}…`
}

function extractTextFromMessage(message: unknown): string {
  const row = toRecord(message)
  if (!row) return ''

  const direct = readString(row.text) || readString(row.content)
  if (direct) return direct

  const content = row.content
  if (!Array.isArray(content)) return ''

  return content
    .map((block) => {
      const item = toRecord(block)
      if (!item) return ''
      if (readString(item.type) !== 'text') return ''
      return readString(item.text)
    })
    .filter(Boolean)
    .join('')
}

function readEventText(payload: Record<string, unknown>): string {
  return (
    readString(payload.text) ||
    readString(payload.content) ||
    readString(payload.chunk) ||
    extractTextFromMessage(payload.message)
  )
}

function readEventRole(payload: Record<string, unknown>): 'assistant' | 'user' | '' {
  const direct = readString(payload.role).toLowerCase()
  if (direct === 'assistant' || direct === 'user') {
    return direct
  }

  const message = toRecord(payload.message)
  const nested = readString(message?.role).toLowerCase()
  if (nested === 'assistant' || nested === 'user') {
    return nested
  }
  return ''
}

function upsertAssistantStream(
  previous: OutputMessage[],
  text: string,
  replace: boolean,
): OutputMessage[] {
  const last = previous[previous.length - 1]
  if (last && last.role === 'assistant' && !last.done) {
    return [
      ...previous.slice(0, -1),
      { ...last, content: replace ? text : `${last.content}${text}` },
    ]
  }
  return [...previous, { role: 'assistant', content: text, timestamp: Date.now() }]
}

function appendAssistantMessage(previous: OutputMessage[], text: string): OutputMessage[] {
  const last = previous[previous.length - 1]
  if (last && last.role === 'assistant' && !last.done) {
    // Avoid duplicate final frames when providers send both chunk stream and final message.
    if (last.content === text) return previous
    if (text.startsWith(last.content) || last.content.startsWith(text)) {
      return [
        ...previous.slice(0, -1),
        { ...last, content: text },
      ]
    }
  }
  return [...previous, { role: 'assistant', content: text, timestamp: Date.now() }]
}

export function AgentOutputPanel({
  agentName,
  sessionKey,
  tasks,
  onClose,
  modelId,
  compact = false,
}: AgentOutputPanelProps) {
  const [messages, setMessages] = useState<OutputMessage[]>([])
  const [sessionEnded, setSessionEnded] = useState(false)
  const [tokenCount, setTokenCount] = useState(0)
  const [streamDisconnected, setStreamDisconnected] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset state when sessionKey changes
  useEffect(() => {
    setMessages([])
    setSessionEnded(false)
    setTokenCount(0)
    setStreamDisconnected(false)
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
    source.onopen = () => {
      setStreamDisconnected(false)
    }
    source.onerror = () => {
      setStreamDisconnected(true)
    }

    // 'chunk' — streaming text from assistant
    source.addEventListener('chunk', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data as string)
      if (!payload) return
      if (!payloadMatchesSession(payload, sessionKey)) return
      const text = readEventText(payload)
      if (!text) return
      const fullReplace = payload.fullReplace === true

      // Approximate token count: ~4 chars per token
      if (!fullReplace) {
        setTokenCount((n) => n + Math.ceil(text.length / 4))
      }

      setMessages((prev) => upsertAssistantStream(prev, text, fullReplace))
    })

    // 'tool' — tool call event
    source.addEventListener('tool', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data as string)
      if (!payload) return
      if (!payloadMatchesSession(payload, sessionKey)) return
      const name = readString(payload.name) || 'tool'
      const args = payload.args ?? payload.input ?? payload.parameters
      const argsStr = truncateArgs(args)
      const content = argsStr ? `${name}(${argsStr})` : `${name}()`
      setMessages((prev) => [
        ...prev,
        { role: 'tool', content, timestamp: Date.now() },
      ])
    })

    // 'done' — session/run completed: add status marker
    source.addEventListener('done', (event) => {
      let doneLabel = 'Session ended'
      if (event instanceof MessageEvent) {
        const payload = parseSsePayload(event.data as string)
        if (!payload) return
        if (!payloadMatchesSession(payload, sessionKey)) return
        const state = readString(payload?.state).toLowerCase()
        const error = readString(payload?.errorMessage)
        if (state === 'error') {
          doneLabel = error ? `Session ended with error: ${error}` : 'Session ended with error'
        } else if (state === 'aborted') {
          doneLabel = 'Session aborted'
        }
      }
      setSessionEnded(true)
      setStreamDisconnected(false)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: doneLabel, timestamp: Date.now(), done: true },
      ])
    })

    // 'user_message' — user turn sent to the agent
    source.addEventListener('user_message', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data as string)
      if (!payload) return
      if (!payloadMatchesSession(payload, sessionKey)) return
      const text = readEventText(payload)
      if (!text) return
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: text, timestamp: Date.now() },
      ])
    })

    // 'message' — final/standalone message payload from gateway
    source.addEventListener('message', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data as string)
      if (!payload) return
      if (!payloadMatchesSession(payload, sessionKey)) return
      const role = readEventRole(payload)
      const text = readEventText(payload)
      if (!text) return
      if (role === 'user') {
        setMessages((prev) => [
          ...prev,
          { role: 'user', content: text, timestamp: Date.now() },
        ])
        return
      }
      setMessages((prev) => appendAssistantMessage(prev, text))
    })

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
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-neutral-900">
                  {task.title}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-neutral-500">
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
      {sessionKey && streamDisconnected && !sessionEnded ? (
        <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">
          Stream disconnected
        </div>
      ) : null}
      {sessionKey ? (
        <div
          ref={scrollRef}
          className={cn(
            'overflow-y-auto rounded-lg border border-neutral-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-neutral-900',
            compact ? 'h-full min-h-[120px]' : 'mt-1 min-h-[80px] max-h-[220px]',
          )}
        >
          {messages.length === 0 && !sessionEnded ? (
            <p className="animate-pulse text-neutral-500">Waiting for response...</p>
          ) : (
            <>
              {messages.map((msg, index) =>
                msg.role === 'tool' ? (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="text-neutral-600"
                  >
                    <span className="text-neutral-400">▶ </span>
                    {msg.content}
                  </div>
                ) : msg.role === 'user' ? (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="my-1 rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-neutral-800"
                  >
                    <span className="mr-1 text-[9px] uppercase tracking-wider text-neutral-500">you »</span>
                    {msg.content}
                  </div>
                ) : msg.done ? (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="border-t border-neutral-200 pt-1 text-emerald-700"
                  >
                    {msg.content}
                  </div>
                ) : (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="whitespace-pre-wrap text-neutral-900"
                  >
                    {stripThinkBlocks(msg.content)}
                  </div>
                ),
              )}
              {!sessionEnded && messages.length > 0 && (
                <span className="animate-pulse text-emerald-600">▊</span>
              )}
            </>
          )}
        </div>
      ) : (
        // Fallback placeholder when no sessionKey
        <div className={cn('rounded-lg border border-neutral-200 bg-white p-3 font-mono text-[11px] text-neutral-900', compact ? 'flex-1' : 'mt-3 min-h-[80px]')}>
          {tasks.length === 0 ? (
            <p className="text-neutral-500">No dispatched tasks yet.</p>
          ) : (
            <>
              <p>$ Dispatching to {agentName}…</p>
              <p className="animate-pulse text-emerald-600">▊</p>
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
    <div className="border-t border-neutral-200 bg-white p-3">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-xs font-semibold text-neutral-900">
            {agentName}
          </h3>
          {modelId ? (
            <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-mono text-[9px] font-semibold text-neutral-700">
              {modelId}
            </span>
          ) : null}
          {tokenCount > 0 ? (
            <span className="shrink-0 font-mono text-[9px] text-neutral-400 tabular-nums">
              ~{tokenCount.toLocaleString()} tok
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs text-neutral-500 transition-colors hover:text-neutral-700"
        >
          ✕
        </button>
      </div>
      {inner}
    </div>
  )
}
