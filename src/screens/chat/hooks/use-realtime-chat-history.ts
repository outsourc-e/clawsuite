import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useGatewayChatStream } from '../../../hooks/use-gateway-chat-stream'
import { useGatewayChatStore } from '../../../stores/gateway-chat-store'
import { appendHistoryMessage, chatQueryKeys } from '../chat-queries'
import { toast } from '../../../components/ui/toast'
import type { GatewayMessage } from '../types'
import { textFromMessage } from '../utils'

/** Read clientId from a message using either camelCase or snake_case field. */
function readClientId(message: GatewayMessage): string {
  const raw = message as Record<string, unknown>
  for (const key of ['clientId', 'client_id']) {
    const val = raw[key]
    if (typeof val === 'string' && val.trim().length > 0) return val.trim()
  }
  return ''
}

const EMPTY_MESSAGES: GatewayMessage[] = []
const EMPTY_TOOL_CALLS: Array<{ id: string; name: string; phase: string; args?: unknown }> = []

type UseRealtimeChatHistoryOptions = {
  sessionKey: string
  friendlyId: string
  historyMessages: Array<GatewayMessage>
  enabled?: boolean
  onUserMessage?: (message: GatewayMessage, source?: string) => void
  onApprovalRequest?: (approval: Record<string, unknown>) => void
  onCompactionStart?: () => void
  onCompactionEnd?: () => void
}

/**
 * Hook that makes SSE the PRIMARY source for new messages and streaming.
 * - Streaming chunks update the gateway-chat-store (already happens)
 * - When 'done' arrives, the complete message is immediately available
 * - History polling is now just a backup/backfill mechanism
 */
export function useRealtimeChatHistory({
  sessionKey,
  friendlyId,
  historyMessages,
  enabled = true,
  onUserMessage,
  onApprovalRequest,
  onCompactionStart,
  onCompactionEnd,
}: UseRealtimeChatHistoryOptions) {
  const queryClient = useQueryClient()
  const [lastCompletedRunAt, setLastCompletedRunAt] = useState<number | null>(
    null,
  )
  const completedStreamingTextRef = useRef<string>('')
  const completedStreamingThinkingRef = useRef<string>('')
  const lastCompactionSignalRef = useRef<string>('')

  const { connectionState, lastError, reconnect } = useGatewayChatStream({
    sessionKey: sessionKey === 'new' ? undefined : sessionKey,
    enabled: enabled && sessionKey !== 'new',
    onUserMessage: useCallback(
      (message: GatewayMessage, source?: string) => {
        // When we receive a user message from an external channel,
        // append it to the query cache immediately for instant display
        if (sessionKey && sessionKey !== 'new') {
          // Early-exit dedup: if the SSE echo has no clientId AND its text
          // content matches an existing optimistic user message in the cache,
          // skip the append entirely — the optimistic entry is already there.
          const echoClientId = readClientId(message)
          if (!echoClientId) {
            const echoText = textFromMessage(message).trim()
            if (echoText.length > 0) {
              const key = chatQueryKeys.history(friendlyId, sessionKey)
              const cached = queryClient.getQueryData(key) as
                | { messages?: GatewayMessage[] }
                | undefined
              const existing = cached?.messages ?? []
              const hasOptimistic = existing.some(
                (m) =>
                  m.role === 'user' &&
                  typeof m.__optimisticId === 'string' &&
                  m.__optimisticId.length > 0 &&
                  textFromMessage(m).trim() === echoText,
              )
              if (hasOptimistic) {
                // The optimistic message is already displayed — skip SSE echo
                onUserMessage?.(message, source)
                return
              }
            }
          }

          appendHistoryMessage(queryClient, friendlyId, sessionKey, {
            ...message,
            __realtimeSource: source,
          })
        }
        onUserMessage?.(message, source)
      },
      [queryClient, friendlyId, sessionKey, onUserMessage],
    ),
    onDone: useCallback(
      (_state: string, eventSessionKey: string) => {
        const currentState = useGatewayChatStore
          .getState()
          .streamingState.get(eventSessionKey)
        if (currentState?.text) {
          completedStreamingTextRef.current = currentState.text
        }
        if (currentState?.thinking) {
          completedStreamingThinkingRef.current = currentState.thinking
        }

        // Track when generation completes for this session
        if (
          eventSessionKey === sessionKey ||
          !sessionKey ||
          sessionKey === 'new'
        ) {
          setLastCompletedRunAt(Date.now())
          // Refetch history after generation completes — keeps chat in sync
          if (sessionKey && sessionKey !== 'new') {
            const key = chatQueryKeys.history(friendlyId, sessionKey)
            const prevData = queryClient.getQueryData(key) as
              | { messages?: GatewayMessage[] }
              | undefined
            const prevCount = prevData?.messages?.length ?? 0

            // Refetch immediately — done event message is already in realtime store
            queryClient.invalidateQueries({ queryKey: key }).then(() => {
              completedStreamingTextRef.current = ''
              completedStreamingThinkingRef.current = ''

              // Check for compaction — significant message count drop
              const newData = queryClient.getQueryData(key) as
                | { messages?: GatewayMessage[] }
                | undefined
              const newCount = newData?.messages?.length ?? 0
              if (
                prevCount > 10 &&
                newCount > 0 &&
                newCount < prevCount * 0.6
              ) {
                onCompactionEnd?.()
                toast(
                  'Context compacted — older messages were summarized to free up space',
                  {
                    type: 'info',
                    icon: '🗜️',
                    duration: 8000,
                  },
                )
              }
            })
          }
        }
      },
      [sessionKey, friendlyId, queryClient, onCompactionEnd],
    ),
    onApprovalRequest,
  })

  const mergeHistoryMessages = useGatewayChatStore((s) => s.mergeHistoryMessages)
  const clearSession = useGatewayChatStore((s) => s.clearSession)
  const lastEventAt = useGatewayChatStore((s) => s.lastEventAt)
  const clearRealtimeBuffer = useGatewayChatStore((s) => s.clearRealtimeBuffer)
  const realtimeMessages = useGatewayChatStore(
    (s) => s.realtimeMessages.get(sessionKey) ?? EMPTY_MESSAGES,
  )

  // Subscribe directly to streaming state — useMemo with stable fn ref was stale (bug #1)
  const streamingState = useGatewayChatStore((s) => s.streamingState.get(sessionKey) ?? null)
  const streamingStateRef = useRef(streamingState)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const delayedClearSessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeSessionKeyRef = useRef(sessionKey)
  const isUnmountingRef = useRef(false)
  activeSessionKeyRef.current = sessionKey

  useEffect(() => {
    streamingStateRef.current = streamingState
  }, [streamingState])

  // Merge history with real-time messages
  // Re-merge when realtime events arrive (lastEventAt changes)
  const mergedMessages = useMemo(() => {
    if (sessionKey === 'new') return historyMessages
    return mergeHistoryMessages(sessionKey, historyMessages)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, historyMessages, mergeHistoryMessages, lastEventAt])

  // History has caught up — cleanup realtime buffer outside render
  useEffect(() => {
    if (!sessionKey || sessionKey === 'new') return
    if (realtimeMessages.length === 0) return
    if (mergedMessages.length !== historyMessages.length) return
    clearRealtimeBuffer(sessionKey)
  }, [
    clearRealtimeBuffer,
    historyMessages.length,
    mergedMessages.length,
    realtimeMessages.length,
    sessionKey,
  ])

  useEffect(() => {
    if (!onCompactionStart) return
    if (realtimeMessages.length === 0) return
    const latest = realtimeMessages[realtimeMessages.length - 1]
    if (!latest) return

    const textCandidates = [
      textFromMessage(latest),
      ...((Array.isArray(latest.content) ? latest.content : []).map((part) => {
        if (part.type === 'text') return String(part.text ?? '')
        if (part.type === 'thinking') return String(part.thinking ?? '')
        return ''
      })),
    ]
      .join('\n')
      .toLowerCase()

    if (
      !textCandidates.includes('pre-compaction') &&
      !textCandidates.includes('compaction')
    ) {
      return
    }

    const signal = `${latest.role ?? ''}:${textCandidates}`
    if (signal === lastCompactionSignalRef.current) return
    lastCompactionSignalRef.current = signal
    onCompactionStart()
  }, [onCompactionStart, realtimeMessages])

  // Periodic history sync — catch missed messages every 30s
  // Skip during active streaming to prevent race conditions
  useEffect(() => {
    if (!sessionKey || sessionKey === 'new' || !enabled) return
    syncIntervalRef.current = setInterval(() => {
      // Don't poll during active streaming — causes flicker/overwrites
      if (streamingStateRef.current !== null) return
      const key = chatQueryKeys.history(friendlyId, sessionKey)
      queryClient.invalidateQueries({ queryKey: key })
    }, 30000)
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    }
  }, [sessionKey, friendlyId, enabled, queryClient])

  // Clear realtime buffer when session changes
  useEffect(() => {
    if (!sessionKey || sessionKey === 'new') return undefined
    if (delayedClearSessionTimeoutRef.current) {
      clearTimeout(delayedClearSessionTimeoutRef.current)
      delayedClearSessionTimeoutRef.current = null
    }

    // Clear on unmount/session change after a delay
    // to allow history to catch up
    return () => {
      if (isUnmountingRef.current) return
      if (delayedClearSessionTimeoutRef.current) {
        clearTimeout(delayedClearSessionTimeoutRef.current)
      }
      delayedClearSessionTimeoutRef.current = setTimeout(() => {
        delayedClearSessionTimeoutRef.current = null
        if (activeSessionKeyRef.current === sessionKey) return
        clearSession(sessionKey)
      }, 5000)
    }
  }, [sessionKey, clearSession])

  useEffect(() => {
    isUnmountingRef.current = false
    return () => {
      isUnmountingRef.current = true
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
      if (delayedClearSessionTimeoutRef.current) {
        clearTimeout(delayedClearSessionTimeoutRef.current)
        delayedClearSessionTimeoutRef.current = null
      }
    }
  }, [])

  // Compute streaming UI state
  const isRealtimeStreaming = streamingState !== null
  const realtimeStreamingText = streamingState?.text ?? ''
  const realtimeStreamingThinking = streamingState?.thinking ?? ''

  return {
    messages: mergedMessages,
    connectionState,
    lastError,
    reconnect,
    isRealtimeStreaming,
    realtimeStreamingText,
    realtimeStreamingThinking,
    completedStreamingText: completedStreamingTextRef,
    completedStreamingThinking: completedStreamingThinkingRef,
    streamingRunId: streamingState?.runId ?? null,
    activeToolCalls: streamingState?.toolCalls ?? EMPTY_TOOL_CALLS,
    lastCompletedRunAt, // Parent watches this to clear waitingForResponse
  }
}
