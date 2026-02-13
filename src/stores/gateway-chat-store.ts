import { create } from 'zustand'
import type { GatewayMessage, MessageContent, ToolCallContent, ThinkingContent, TextContent } from '../screens/chat/types'

export type ChatStreamEvent =
  | { type: 'message'; message: GatewayMessage; sessionKey: string }
  | { type: 'chunk'; text: string; runId?: string; sessionKey: string; fullReplace?: boolean }
  | { type: 'thinking'; text: string; runId?: string; sessionKey: string }
  | { type: 'tool'; phase: string; name: string; toolCallId?: string; args?: unknown; runId?: string; sessionKey: string }
  | { type: 'done'; state: string; errorMessage?: string; runId?: string; sessionKey: string; message?: GatewayMessage }
  | { type: 'user_message'; message: GatewayMessage; sessionKey: string; source?: string }

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

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
  mergeHistoryMessages: (sessionKey: string, historyMessages: Array<GatewayMessage>) => Array<GatewayMessage>
}

const createEmptyStreamingState = (): StreamingState => ({
  runId: null,
  text: '',
  thinking: '',
  toolCalls: [],
})

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
        // Add a complete message to the realtime buffer
        const messages = new Map(state.realtimeMessages)
        const sessionMessages = [...(messages.get(sessionKey) ?? [])]
        
        // Check for duplicates by content or timestamp
        const newText = extractTextFromContent(event.message.content)
        const isDuplicate = sessionMessages.some((existing) => {
          if (existing.role !== event.message.role) return false
          // Content match (most reliable)
          if (newText && newText === extractTextFromContent(existing.content)) return true
          // Timestamp proximity fallback
          const existingTs = getMessageTimestamp(existing)
          const newTs = getMessageTimestamp(event.message)
          return existingTs > 0 && newTs > 0 && Math.abs(existingTs - newTs) < 5000
        })

        if (!isDuplicate) {
          // Mark user messages from external sources
          const message: GatewayMessage = {
            ...event.message,
            __realtimeSource: event.type === 'user_message' ? (event as any).source : undefined,
          }
          sessionMessages.push(message)
          messages.set(sessionKey, sessionMessages)
          set({ realtimeMessages: messages, lastEventAt: now })
        }
        break
      }

      case 'chunk': {
        const streamingMap = new Map(state.streamingState)
        const streaming = streamingMap.get(sessionKey) ?? createEmptyStreamingState()
        
        // Gateway sends full accumulated text with fullReplace=true
        // Replace entire text (default), or append if fullReplace is explicitly false
        if (event.fullReplace === false) {
          streaming.text += event.text
        } else {
          streaming.text = event.text
        }
        if (event.runId) streaming.runId = event.runId
        
        streamingMap.set(sessionKey, streaming)
        set({ streamingState: streamingMap, lastEventAt: now })
        break
      }

      case 'thinking': {
        const streamingMap = new Map(state.streamingState)
        const streaming = streamingMap.get(sessionKey) ?? createEmptyStreamingState()
        
        streaming.thinking = event.text
        if (event.runId) streaming.runId = event.runId
        
        streamingMap.set(sessionKey, streaming)
        set({ streamingState: streamingMap, lastEventAt: now })
        break
      }

      case 'tool': {
        const streamingMap = new Map(state.streamingState)
        const streaming = streamingMap.get(sessionKey) ?? createEmptyStreamingState()
        
        if (event.runId) streaming.runId = event.runId
        
        const existingToolIndex = streaming.toolCalls.findIndex(
          (tc) => tc.id === event.toolCallId
        )
        
        if (existingToolIndex >= 0) {
          streaming.toolCalls[existingToolIndex] = {
            ...streaming.toolCalls[existingToolIndex],
            phase: event.phase,
            args: event.args,
          }
        } else if (event.toolCallId) {
          streaming.toolCalls.push({
            id: event.toolCallId,
            name: event.name,
            phase: event.phase,
            args: event.args,
          })
        }
        
        streamingMap.set(sessionKey, streaming)
        set({ streamingState: streamingMap, lastEventAt: now })
        break
      }

      case 'done': {
        const streamingMap = new Map(state.streamingState)
        const streaming = streamingMap.get(sessionKey)
        
        // Build the complete message from either done payload or streaming state
        let completeMessage: GatewayMessage | null = null

        if (streaming && streaming.text) {
          // Convert streaming state to a complete message
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
          
          // Add tool calls if present
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
        } else if (event.message) {
          // No streaming state — use done event's message payload directly
          completeMessage = {
            ...event.message,
            timestamp: now,
            __streamingStatus: 'complete' as any,
          }
        }

        if (completeMessage) {
          const messages = new Map(state.realtimeMessages)
          const sessionMessages = [...(messages.get(sessionKey) ?? [])]
          
          // Deduplicate: check if an identical assistant message already exists
          const completeText = extractTextFromContent(completeMessage.content)
          const isDuplicate = sessionMessages.some((existing) => {
            if (existing.role !== 'assistant') return false
            // Check by text content match (most reliable)
            if (completeText && completeText === extractTextFromContent(existing.content)) return true
            // Check by timestamp proximity
            const existingTs = getMessageTimestamp(existing)
            return existingTs > 0 && Math.abs(existingTs - now) < 5000
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

  mergeHistoryMessages: (sessionKey, historyMessages) => {
    const realtimeMessages = get().realtimeMessages.get(sessionKey) ?? []
    
    if (realtimeMessages.length === 0) {
      return historyMessages
    }
    
    // Find messages in realtime that aren't in history yet
    const newRealtimeMessages = realtimeMessages.filter((rtMsg) => {
      const rtTimestamp = getMessageTimestamp(rtMsg)
      const rtId = (rtMsg as { id?: string }).id
      const rtText = extractTextFromContent(rtMsg.content)
      
      return !historyMessages.some((histMsg) => {
        // First check: match by message id if both have one
        const histId = (histMsg as { id?: string }).id
        if (rtId && histId && rtId === histId) {
          return true
        }
        
        // Second check: match by text content + role (most reliable)
        if (histMsg.role === rtMsg.role && rtText) {
          const histText = extractTextFromContent(histMsg.content)
          if (histText === rtText) return true
        }
        
        // Third check: match by timestamp proximity (10s window) and role
        if (histMsg.role !== rtMsg.role) return false
        const histTimestamp = getMessageTimestamp(histMsg)
        return histTimestamp > 0 && rtTimestamp > 0 && Math.abs(histTimestamp - rtTimestamp) < 10000
      })
    })
    
    if (newRealtimeMessages.length === 0) {
      // History has caught up, clear realtime buffer
      const messages = new Map(get().realtimeMessages)
      messages.delete(sessionKey)
      set({ realtimeMessages: messages })
      return historyMessages
    }
    
    // Append new realtime messages to history
    return [...historyMessages, ...newRealtimeMessages]
  },
}))

function extractTextFromContent(content: Array<MessageContent> | undefined): string {
  if (!content || !Array.isArray(content)) return ''
  return content
    .filter((c): c is TextContent => c.type === 'text' && typeof (c as any).text === 'string')
    .map((c) => c.text)
    .join('\n')
    .trim()
}

function getMessageTimestamp(message: GatewayMessage): number {
  const candidates = [
    (message as any).timestamp,
    (message as any).createdAt,
    (message as any).created_at,
    (message as any).time,
    (message as any).ts,
  ]
  
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      if (candidate < 1_000_000_000_000) return candidate * 1000
      return candidate
    }
    if (typeof candidate === 'string') {
      const parsed = Date.parse(candidate)
      if (!Number.isNaN(parsed)) return parsed
    }
  }
  
  return 0
}
