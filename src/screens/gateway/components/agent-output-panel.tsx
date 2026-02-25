import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Markdown } from '@/components/prompt-kit/markdown'
import type { HubTask } from './task-board'

type OutputMessage = {
  role: 'assistant' | 'user' | 'tool'
  content: string
  timestamp: number
  done?: boolean
}

type SessionOutputCacheEntry = {
  messages: OutputMessage[]
  sessionEnded: boolean
  tokenCount: number
}

const MAX_CACHED_MESSAGES = 200
const sessionOutputCache = new Map<string, SessionOutputCacheEntry>()

export type AgentOutputPanelProps = {
  agentName: string
  sessionKey: string | null
  tasks: HubTask[]
  onClose: () => void
  onLine?: (line: string) => void
  /** Model preset id — shown in header badge e.g. 'pc1-coder', 'sonnet' */
  modelId?: string
  /** Optional runtime status label shown in the header badge. */
  statusLabel?: string
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

function trimMessages(messages: OutputMessage[]): OutputMessage[] {
  if (messages.length <= MAX_CACHED_MESSAGES) return messages
  return messages.slice(-MAX_CACHED_MESSAGES)
}

function appendBoundedMessage(previous: OutputMessage[], message: OutputMessage): OutputMessage[] {
  return [...trimMessages(previous), message].slice(-MAX_CACHED_MESSAGES)
}

function readCachedSessionState(sessionKey: string | null): SessionOutputCacheEntry | null {
  if (!sessionKey) return null
  return sessionOutputCache.get(sessionKey) ?? null
}

export function AgentOutputPanel({
  agentName,
  sessionKey,
  tasks,
  onClose,
  onLine,
  modelId,
  statusLabel,
  compact = false,
}: AgentOutputPanelProps) {
  const cachedInitial = readCachedSessionState(sessionKey)
  const [messages, setMessages] = useState<OutputMessage[]>(cachedInitial?.messages ?? [])
  const [sessionEnded, setSessionEnded] = useState(cachedInitial?.sessionEnded ?? false)
  const [tokenCount, setTokenCount] = useState(cachedInitial?.tokenCount ?? 0)
  const [streamDisconnected, setStreamDisconnected] = useState(false)
  const [streamReconnectNonce, setStreamReconnectNonce] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Hydrate state when sessionKey changes
  useEffect(() => {
    const cached = readCachedSessionState(sessionKey)
    setMessages(cached?.messages ?? [])
    setSessionEnded(cached?.sessionEnded ?? false)
    setTokenCount(cached?.tokenCount ?? 0)
    setStreamDisconnected(false)
  }, [sessionKey])

  // Persist state to in-memory cache, bounded by message count.
  useEffect(() => {
    if (!sessionKey) return
    const boundedMessages = trimMessages(messages)
    if (boundedMessages !== messages) {
      setMessages(boundedMessages)
      return
    }
    sessionOutputCache.set(sessionKey, {
      messages: boundedMessages,
      sessionEnded,
      tokenCount,
    })
  }, [messages, sessionEnded, sessionKey, tokenCount])

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const streamStatus = sessionEnded
    ? 'Completed'
    : streamDisconnected
      ? 'Disconnected'
      : sessionKey
        ? 'Streaming'
        : 'Idle'
  const headerStatus = statusLabel || streamStatus
  const handleReconnect = useCallback(() => {
    setStreamDisconnected(false)
    setStreamReconnectNonce((n) => n + 1)
  }, [])

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

      setMessages((prev) => trimMessages(upsertAssistantStream(prev, text, fullReplace)))
      onLine?.(text)
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
      setMessages((prev) =>
        appendBoundedMessage(prev, { role: 'tool', content, timestamp: Date.now() }),
      )
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
      setMessages((prev) =>
        appendBoundedMessage(prev, {
          role: 'assistant',
          content: doneLabel,
          timestamp: Date.now(),
          done: true,
        }),
      )
    })

    // 'user_message' — user turn sent to the agent
    source.addEventListener('user_message', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data as string)
      if (!payload) return
      if (!payloadMatchesSession(payload, sessionKey)) return
      const text = readEventText(payload)
      if (!text) return
      setMessages((prev) =>
        appendBoundedMessage(prev, { role: 'user', content: text, timestamp: Date.now() }),
      )
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
        setMessages((prev) =>
          appendBoundedMessage(prev, { role: 'user', content: text, timestamp: Date.now() }),
        )
        return
      }
      setMessages((prev) => trimMessages(appendAssistantMessage(prev, text)))
      onLine?.(text)
    })

    return () => {
      source.close()
    }
  }, [onLine, sessionKey, streamReconnectNonce])

  const inner = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Task list */}
      {tasks.length > 0 && (
        <div className={cn('space-y-1.5', compact ? 'mb-2' : 'mb-3')}>
          {tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-[var(--theme-text)]">
                  {task.title}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-[var(--theme-muted)]">
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
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <span>Stream disconnected</span>
          <button
            type="button"
            onClick={handleReconnect}
            className="rounded border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-900/40"
          >
            Reconnect
          </button>
        </div>
      ) : null}
      {sessionKey ? (
        <div
          ref={scrollRef}
          className={cn(
            'min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] p-3 text-[11px] leading-relaxed text-[var(--theme-text)]',
            compact ? 'min-h-0 flex-1' : 'mt-1 min-h-[300px] flex-1 text-sm leading-6',
          )}
        >
          {messages.length === 0 && !sessionEnded ? (
            <p className="animate-pulse text-[var(--theme-muted)]">Waiting for response...</p>
          ) : (
            <>
              {messages.map((msg, index) =>
                msg.role === 'tool' ? (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="mb-1 rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1 font-mono text-xs leading-5 text-neutral-700"
                  >
                    <span className="text-[var(--theme-muted)]">▶ </span>
                    {msg.content}
                  </div>
                ) : msg.role === 'user' ? (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="my-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm leading-6 text-neutral-800"
                  >
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)]">
                      You
                    </div>
                    <Markdown className="text-sm leading-6 text-neutral-800 [&_p]:my-1 [&_ul]:my-2 [&_ol]:my-2">
                      {msg.content}
                    </Markdown>
                  </div>
                ) : msg.done ? (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="mt-2 border-t border-[var(--theme-border)] pt-2 text-sm font-medium text-emerald-700"
                  >
                    {msg.content}
                  </div>
                ) : (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="my-2 rounded-lg border border-neutral-100 bg-[var(--theme-card)] text-[var(--theme-text)]"
                  >
                    <Markdown className="text-sm leading-6 text-[var(--theme-text)] [&_p]:my-1 [&_ul]:my-2 [&_ol]:my-2 [&_pre]:my-2">
                      {stripThinkBlocks(msg.content)}
                    </Markdown>
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
        <div className={cn('min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] p-3 text-sm leading-6 text-[var(--theme-text)]', compact ? 'min-h-0 flex-1 overflow-y-auto' : 'mt-1 min-h-[300px]')}>
          {tasks.length === 0 ? (
            <p className="text-[var(--theme-muted)]">No dispatched tasks yet.</p>
          ) : (
            <>
              <p>$ Dispatching to {agentName}…</p>
              <p className="animate-pulse text-emerald-600">▊</p>
            </>
          )}
        </div>
      )}
    </div>
  )

  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-col p-3">
        {inner}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col border border-[var(--theme-border)] bg-[var(--theme-card)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--theme-border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-[var(--theme-text)]">
            {agentName}
          </h3>
          {modelId ? (
            <span className="shrink-0 rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-0.5 font-mono text-[10px] font-semibold text-neutral-700">
              {modelId}
            </span>
          ) : null}
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
              headerStatus === 'Completed'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : headerStatus === 'Disconnected'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                : headerStatus === 'Streaming'
                    ? 'border-sky-200 bg-sky-50 text-sky-700'
                    : 'border-[var(--theme-border)] bg-[var(--theme-bg)] text-neutral-700',
            )}
          >
            {headerStatus}
          </span>
          {tokenCount > 0 ? (
            <span className="shrink-0 font-mono text-[10px] text-[var(--theme-muted)] tabular-nums">
              ~{tokenCount.toLocaleString()} tok
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--theme-border)] text-sm text-[var(--theme-muted)] transition-colors hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)]"
          aria-label="Close agent output"
        >
          ✕
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        {inner}
      </div>
    </div>
  )
}
