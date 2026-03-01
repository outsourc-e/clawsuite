import { create } from 'zustand'
import type {
  GatewayMessage,
  MessageContent,
  ToolCallContent,
  ThinkingContent,
  TextContent,
} from '../screens/chat/types'

export type ChatStreamEvent =
  | { type: 'message'; message: GatewayMessage; sessionKey: string }
  | {
      type: 'chunk'
      text: string
      runId?: string
      sessionKey: string
      fullReplace?: boolean
    }
  | { type: 'thinking'; text: string; runId?: string; sessionKey: string }
  | {
      type: 'tool'
      phase: string
      name: string
      toolCallId?: string
      args?: unknown
      runId?: string
      sessionKey: string
    }
  | {
      type: 'done'
      state: string
      errorMessage?: string
      runId?: string
      sessionKey: string
      message?: GatewayMessage
    }
  | {
      type: 'user_message'
      message: GatewayMessage
      sessionKey: string
      source?: string
    }

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

type StreamingState = {
  runId: string | null
  text: string
  thinking: string
  toolCalls: Array<{
    id: string
    name: string
    phase: string
    args?: unknown
  }>
}

type GatewayChatState = {
  connectionState: ConnectionState
  lastError: string | null
  /** Messages received via real-time stream, keyed by sessionKey */
  realtimeMessages: Map<string, Array<GatewayMessage>>
  /** Current streaming state per session */
  streamingState: Map<string, StreamingState>
  /** Timestamp of last received event */
  lastEventAt: number

  // Actions
  setConnectionState: (state: ConnectionState, error?: string) => void
  processEvent: (event: ChatStreamEvent) => void
  getRealtimeMessages: (sessionKey: string) => Array<GatewayMessage>
  getStreamingState: (sessionKey: string) => StreamingState | null
  clearSession: (sessionKey: string) => void
  clearRealtimeBuffer: (sessionKey: string) => void
  clearStreamingSession: (sessionKey: string) => void
  clearAllStreaming: () => void
  mergeHistoryMessages: (
    sessionKey: string,
    historyMessages: Array<GatewayMessage>,
  ) => Array<GatewayMessage>
}

const createEmptyStreamingState = (): StreamingState => ({
  runId: null,
  text: '',
  thinking: '',
  toolCalls: [],
})

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getMessageId(msg: GatewayMessage | null | undefined): string | undefined {
  if (!msg) return undefined
  const id = (msg as { id?: string }).id
  if (typeof id === 'string' && id.trim().length > 0) return id
  const messageId = (msg as { messageId?: string }).messageId
  if (typeof messageId === 'string' && messageId.trim().length > 0) return messageId
  return undefined
}

function getClientNonce(msg: GatewayMessage | null | undefined): string {
  if (!msg) return ''
  const raw = msg as Record<string, unknown>
  return (
    normalizeString(raw.clientId) ||
    normalizeString(raw.client_id) ||
    normalizeString(raw.nonce) ||
    normalizeString(raw.idempotencyKey)
  )
}

function messageMultipartSignature(msg: GatewayMessage | null | undefined): string {
  if (!msg) return ''
  let content = Array.isArray(msg.content)
    ? msg.content
        .map((part) => {
          if (part.type === 'text') return `t:${String((part as any).text ?? '').trim()}`
          if (part.type === 'thinking') return `h:${String((part as any).thinking ?? '').trim()}`
          if (part.type === 'toolCall') return `tc:${String((part as any).id ?? '')}:${String((part as any).name ?? '')}`
          return `p:${String((part as any).type ?? '')}`
        })
        .join('|')
    : ''
  // Fallback: if content array is empty/missing, check top-level text fields
  // so that legacy-format messages still produce a meaningful signature.
  if (!content) {
    const raw = msg as Record<string, unknown>
    for (const key of ['text', 'body', 'message']) {
      const val = raw[key]
      if (typeof val === 'string' && val.trim().length > 0) {
        content = `t:${val.trim()}`
        break
      }
    }
  }
  const attachments = Array.isArray((msg as any).attachments)
    ? (msg as any).attachments
        .map((attachment: any) => `${String(attachment?.name ?? '')}:${String(attachment?.size ?? '')}:${String(attachment?.contentType ?? '')}`)
        .join('|')
    : ''
  return `${msg.role ?? 'unknown'}:${content}:${attachments}`
}

export const useGatewayChatStore = create<GatewayChatState>((set, get) => ({
  connectionState: 'disconnected',
  lastError: null,
  realtimeMessages: new Map(),
  streamingState: new Map(),
  lastEventAt: 0,

  setConnectionState: (connectionState, error) => {
    set({ connectionState, lastError: error ?? null })
  },

  processEvent: (event) => {
    const state = get()
    const sessionKey = event.sessionKey
    const now = Date.now()

    switch (event.type) {
      case 'message':
      case 'user_message': {
        const messages = new Map(state.realtimeMessages)
        const sessionMessages = [...(messages.get(sessionKey) ?? [])]

        const newId = getMessageId(event.message)
        const newClientNonce = getClientNonce(event.message)
        const newMultipartSignature = messageMultipartSignature(event.message)

        const optimisticIndex =
          newClientNonce.length > 0
            ? sessionMessages.findIndex((existing) => {
                if (existing.role !== event.message.role) return false
                const existingNonce = getClientNonce(existing)
                if (existingNonce.length === 0 || existingNonce !== newClientNonce) {
                  return false
                }
                return (
                  normalizeString((existing as any).status) === 'sending' ||
                  Boolean((existing as any).__optimisticId)
                )
              })
            : -1

        const duplicateIndex = sessionMessages.findIndex((existing) => {
          if (existing.role !== event.message.role) return false
          const existingId = getMessageId(existing)
          if (newId && existingId && newId === existingId) return true

          const existingNonce = getClientNonce(existing)
          if (newClientNonce && existingNonce && newClientNonce === existingNonce) {
            return true
          }

          return (
            newMultipartSignature.length > 0 &&
            newMultipartSignature === messageMultipartSignature(existing)
          )
        })

        // Mark user messages from external sources
        const incomingMessage: GatewayMessage = {
          ...event.message,
          __realtimeSource:
            event.type === 'user_message' ? (event as any).source : undefined,
          status: undefined,
        }

        if (optimisticIndex >= 0) {
          sessionMessages[optimisticIndex] = {
            ...sessionMessages[optimisticIndex],
            ...incomingMessage,
          }
          messages.set(sessionKey, sessionMessages)
          set({ realtimeMessages: messages, lastEventAt: now })
          break
        }

        if (duplicateIndex === -1) {
          sessionMessages.push(incomingMessage)
          messages.set(sessionKey, sessionMessages)
          set({ realtimeMessages: messages, lastEventAt: now })
        }
        break
      }

      case 'chunk': {
        const streamingMap = new Map(state.streamingState)
        const prev =
          streamingMap.get(sessionKey) ?? createEmptyStreamingState()

        // Gateway sends full accumulated text with fullReplace=true
        // Replace entire text (default), or append if fullReplace is explicitly false
        const next: StreamingState = {
          ...prev,
          text: event.fullReplace === false ? prev.text + event.text : event.text,
          runId: event.runId ?? prev.runId,
        }

        streamingMap.set(sessionKey, next)
        set({ streamingState: streamingMap, lastEventAt: now })
        break
      }

      case 'thinking': {
        const streamingMap = new Map(state.streamingState)
        const prev =
          streamingMap.get(sessionKey) ?? createEmptyStreamingState()
        const next: StreamingState = {
          ...prev,
          thinking: event.text,
          runId: event.runId ?? prev.runId,
        }

        streamingMap.set(sessionKey, next)
        set({ streamingState: streamingMap, lastEventAt: now })
        break
      }

      case 'tool': {
        const streamingMap = new Map(state.streamingState)
        const prev =
          streamingMap.get(sessionKey) ?? createEmptyStreamingState()

        const toolCallId =
          event.toolCallId ??
          `${event.name || 'tool'}-${event.runId || sessionKey}-${prev.toolCalls.length}`
        const existingToolIndex = prev.toolCalls.findIndex(
          (tc) => tc.id === toolCallId,
        )

        let nextToolCalls = [...prev.toolCalls]

        if (existingToolIndex >= 0) {
          nextToolCalls[existingToolIndex] = {
            ...nextToolCalls[existingToolIndex],
            phase: event.phase,
            args: event.args,
          }
        } else if (event.phase === 'calling' || event.phase === 'start') {
          nextToolCalls.push({
            id: toolCallId,
            name: event.name,
            phase: event.phase,
            args: event.args,
          })
        }

        const next: StreamingState = {
          ...prev,
          runId: event.runId ?? prev.runId,
          toolCalls: nextToolCalls,
        }

        streamingMap.set(sessionKey, next)
        set({ streamingState: streamingMap, lastEventAt: now })
        break
      }

      case 'done': {
        const streamingMap = new Map(state.streamingState)
        const streaming = streamingMap.get(sessionKey)

        // Build the complete message — prefer authoritative final payload (bug #8 fix)
        let completeMessage: GatewayMessage | null = null

        if (event.message) {
          // Prefer done event's message payload — it's the authoritative final response
          completeMessage = {
            ...event.message,
            timestamp: now,
            __streamingStatus: 'complete' as any,
          }
        } else if (streaming && streaming.text) {
          // Fallback: build from streaming state if no final payload
          const content: Array<MessageContent> = []

          if (streaming.thinking) {
            content.push({
              type: 'thinking',
              thinking: streaming.thinking,
            } as ThinkingContent)
          }

          if (streaming.text) {
            content.push({
              type: 'text',
              text: streaming.text,
            } as TextContent)
          }

          for (const toolCall of streaming.toolCalls) {
            content.push({
              type: 'toolCall',
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.args as Record<string, unknown> | undefined,
            } as ToolCallContent)
          }

          completeMessage = {
            role: 'assistant',
            content,
            timestamp: now,
            __streamingStatus: 'complete',
          }
        }

        if (completeMessage) {
          const messages = new Map(state.realtimeMessages)
          const sessionMessages = [...(messages.get(sessionKey) ?? [])]

          // Deduplicate: by ID or exact content only (bug #7 fix)
          const completeText = extractTextFromContent(completeMessage.content)
          const completeId = getMessageId(completeMessage)
          const isDuplicate = sessionMessages.some((existing) => {
            if (existing.role !== 'assistant') return false
            const existingId = getMessageId(existing)
            if (completeId && existingId && completeId === existingId) return true
            if (completeText && completeText === extractTextFromContent(existing.content)) return true
            return false
          })

          if (!isDuplicate) {
            sessionMessages.push(completeMessage)
            messages.set(sessionKey, sessionMessages)
            set({ realtimeMessages: messages })
          }
        }

        // Clear streaming state
        streamingMap.delete(sessionKey)
        set({ streamingState: streamingMap, lastEventAt: now })
        break
      }
    }
  },

  getRealtimeMessages: (sessionKey) => {
    return get().realtimeMessages.get(sessionKey) ?? []
  },

  getStreamingState: (sessionKey) => {
    return get().streamingState.get(sessionKey) ?? null
  },

  clearSession: (sessionKey) => {
    const messages = new Map(get().realtimeMessages)
    const streaming = new Map(get().streamingState)
    messages.delete(sessionKey)
    streaming.delete(sessionKey)
    set({ realtimeMessages: messages, streamingState: streaming })
  },

  clearRealtimeBuffer: (sessionKey) => {
    const messages = new Map(get().realtimeMessages)
    messages.delete(sessionKey)
    set({ realtimeMessages: messages })
  },

  clearStreamingSession: (sessionKey) => {
    const streaming = new Map(get().streamingState)
    if (!streaming.has(sessionKey)) return
    streaming.delete(sessionKey)
    set({ streamingState: streaming })
  },

  clearAllStreaming: () => {
    if (get().streamingState.size === 0) return
    set({ streamingState: new Map() })
  },

  mergeHistoryMessages: (sessionKey, historyMessages) => {
    const realtimeMessages = get().realtimeMessages.get(sessionKey) ?? []

    if (realtimeMessages.length === 0) {
      return historyMessages
    }

    // Find messages in realtime that aren't in history yet.
    //
    // CRITICAL: use extractMessageText() (not extractTextFromContent) so that
    // SSE echoes with top-level text/body/message fields are matched against
    // optimistic messages that use the content-array format. This was the root
    // cause of the persistent duplicate-message bug — mergeHistoryMessages was
    // the only layer that didn't handle the format mismatch, so the SSE echo
    // always survived the merge and appeared alongside the optimistic copy.
    const newRealtimeMessages = realtimeMessages.filter((rtMsg) => {
      const rtId = getMessageId(rtMsg)
      const rtText = extractMessageText(rtMsg)
      const rtNonce = getClientNonce(rtMsg)
      const rtSignature = messageMultipartSignature(rtMsg)

      return !historyMessages.some((histMsg) => {
        const histId = getMessageId(histMsg)
        if (rtId && histId && rtId === histId) {
          return true
        }

        const histNonce = getClientNonce(histMsg)
        if (rtNonce && histNonce && rtNonce === histNonce) {
          return true
        }

        // Text match: use multi-format extraction for both sides so that
        // content-array messages match top-level text field messages.
        if (histMsg.role === rtMsg.role && rtText) {
          const histText = extractMessageText(histMsg)
          if (histText === rtText) return true
        }

        // Optimistic message match: same role + (text OR attachment sig)
        const histRaw = histMsg as Record<string, unknown>
        const histIsOptimistic =
          normalizeString(histRaw.status) === 'sending' ||
          normalizeString(histRaw.__optimisticId).length > 0

        if (histIsOptimistic && histMsg.role === rtMsg.role) {
          // Text-based match (plain text messages)
          if (rtText) {
            const histText = extractMessageText(histMsg)
            if (histText === rtText) return true
            // Prefix match: the gateway may enrich the body with inline
            // <attachment> tags that weren't in the original optimistic message.
            // The enriched body starts with the original text.
            if (histText && rtText.startsWith(histText)) return true
          }
          // Attachment-based match for paste/image messages
          const rtAttachments = Array.isArray((rtMsg as any).attachments)
            ? (rtMsg as any).attachments as Array<Record<string, unknown>>
            : []
          const histAttachments = Array.isArray((histMsg as any).attachments)
            ? (histMsg as any).attachments as Array<Record<string, unknown>>
            : []
          if (
            rtAttachments.length > 0 &&
            rtAttachments.length === histAttachments.length
          ) {
            const rtSig = rtAttachments
              .map(
                (a) =>
                  `${normalizeString(a.name)}:${String(a.size ?? '')}`,
              )
              .sort()
              .join('|')
            const histSig = histAttachments
              .map(
                (a) =>
                  `${normalizeString(a.name)}:${String(a.size ?? '')}`,
              )
              .sort()
              .join('|')
            if (rtSig && rtSig === histSig) return true
          }
        }

        return (
          rtSignature.length > 0 &&
          rtSignature === messageMultipartSignature(histMsg)
        )
      })
    })

    if (newRealtimeMessages.length === 0) {
      return historyMessages
    }

    // Append new realtime messages to history
    return [...historyMessages, ...newRealtimeMessages]
  },
}))

function extractTextFromContent(
  content: Array<MessageContent> | undefined,
): string {
  if (!content || !Array.isArray(content)) return ''
  return content
    .filter(
      (c): c is TextContent =>
        c.type === 'text' && typeof (c as any).text === 'string',
    )
    .map((c) => c.text)
    .join('\n')
    .trim()
}

/**
 * Extract text from a GatewayMessage using multiple strategies:
 *   1. content array (canonical format)
 *   2. top-level text/body/message fields (legacy / some gateway adapters)
 *
 * Some gateways echo user messages with a top-level `text` field instead of
 * the `content` array. Using only extractTextFromContent() would return ''
 * for those, causing dedup to fail in mergeHistoryMessages.
 */
function extractMessageText(msg: GatewayMessage | null | undefined): string {
  if (!msg) return ''
  const fromContent = extractTextFromContent(msg.content)
  if (fromContent.length > 0) return fromContent

  const raw = msg as Record<string, unknown>
  for (const key of ['text', 'body', 'message']) {
    const val = raw[key]
    if (typeof val === 'string' && val.trim().length > 0) return val.trim()
  }
  return ''
}
