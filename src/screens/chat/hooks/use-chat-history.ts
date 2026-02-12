import { useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'

import { chatQueryKeys, fetchHistory } from '../chat-queries'
import { getMessageTimestamp, textFromMessage } from '../utils'
import type { QueryClient } from '@tanstack/react-query'
import type { GatewayMessage, HistoryResponse } from '../types'

type UseChatHistoryInput = {
  activeFriendlyId: string
  activeSessionKey: string
  forcedSessionKey?: string
  isNewChat: boolean
  isRedirecting: boolean
  activeExists: boolean
  sessionsReady: boolean
  queryClient: QueryClient
}

function normalizeSessionCandidate(value: string | undefined): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed === 'new') return ''
  return trimmed
}

export function useChatHistory({
  activeFriendlyId,
  activeSessionKey,
  forcedSessionKey,
  isNewChat,
  isRedirecting,
  activeExists,
  sessionsReady,
  queryClient,
}: UseChatHistoryInput) {
  const explicitRouteSessionKey = useMemo(() => {
    const normalizedFriendlyId = normalizeSessionCandidate(activeFriendlyId)
    if (!normalizedFriendlyId) return ''
    if (normalizedFriendlyId === 'main') return ''
    return normalizedFriendlyId
  }, [activeFriendlyId])

  const sessionKeyForHistory = useMemo(() => {
    const candidates = [
      normalizeSessionCandidate(forcedSessionKey),
      normalizeSessionCandidate(activeSessionKey),
      explicitRouteSessionKey,
    ]
    const match = candidates.find((candidate) => candidate.length > 0)
    return match || 'main'
  }, [activeSessionKey, explicitRouteSessionKey, forcedSessionKey])

  const historyKey = chatQueryKeys.history(
    activeFriendlyId,
    sessionKeyForHistory,
  )
  const historyQuery = useQuery({
    queryKey: historyKey,
    queryFn: async function fetchHistoryForSession() {
      const cached = queryClient.getQueryData(historyKey) as Record<string, unknown> | undefined
      const optimisticMessages = Array.isArray((cached as any)?.messages)
        ? (cached as any).messages.filter((message: any) => {
            if (message.status === 'sending') return true
            if (message.__optimisticId) return true
            return Boolean(message.clientId)
          })
        : []

      const serverData = await fetchHistory({
        sessionKey: sessionKeyForHistory,
        friendlyId: activeFriendlyId,
      })
      if (!optimisticMessages.length) return serverData

      const merged = mergeOptimisticHistoryMessages(
        serverData.messages,
        optimisticMessages,
      )

      return {
        ...serverData,
        messages: merged,
      }
    },
    enabled:
      Boolean(sessionKeyForHistory) &&
      !isRedirecting &&
      (!sessionsReady || activeExists || Boolean(explicitRouteSessionKey) || isNewChat),
    placeholderData: function useCachedHistory(): HistoryResponse | undefined {
      return queryClient.getQueryData(historyKey)
    },
    refetchOnWindowFocus: true,
    gcTime: 1000 * 60 * 10,
  })

  const stableHistorySignatureRef = useRef('')
  const stableHistoryMessagesRef = useRef<Array<GatewayMessage>>([])
  const historyMessages = useMemo(() => {
    const messages = Array.isArray(historyQuery.data?.messages)
      ? historyQuery.data.messages
      : []
    const last = messages[messages.length - 1]
    const lastId =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
      last && typeof (last as { id?: string }).id === 'string'
        ? (last as { id?: string }).id
        : ''
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
    const signature = `${messages.length}:${last?.role ?? ''}:${lastId}:${textFromMessage(last ?? { role: 'user', content: [] }).slice(-32)}`
    if (signature === stableHistorySignatureRef.current) {
      return stableHistoryMessagesRef.current
    }
    stableHistorySignatureRef.current = signature
    stableHistoryMessagesRef.current = messages
    return messages
  }, [historyQuery.data?.messages])

  // Filter messages for display - hide tool calls, system events, etc.
  const displayMessages = useMemo(() => {
    return historyMessages.filter((msg) => {
      // Always show user messages (unless system events)
      if (msg.role === 'user') {
        const text = textFromMessage(msg)
        // Filter out system event forwards (subagent task announcements etc)
        if (text.startsWith('A subagent task')) return false
        return true
      }

      // Show assistant messages only if they have displayable content
      if (msg.role === 'assistant') {
        // Keep streaming placeholders (they show typing indicator)
        if (msg.__streamingStatus === 'streaming') return true
        // Keep optimistic messages that are pending
        if (msg.__optimisticId && !msg.content?.length) return true

        const content = msg.content
        if (!content || !Array.isArray(content)) return false
        if (content.length === 0) return false

        // Hide messages that are just tool-call narration (text + toolUse/toolCall blocks)
        const hasToolCall = content.some(
          (c) => c.type === 'toolCall' || c.type === 'tool_use' || c.type === 'toolUse'
        )
        
        // Has at least one text block with actual content?
        const hasText = content.some(
          (c) => c.type === 'text' && typeof c.text === 'string' && c.text.trim().length > 0
        )
        if (!hasText) return false
        
        // If message has tool calls alongside text, it's narration — hide it
        // unless it's the LAST assistant message (which is the final response)
        if (hasToolCall) return false
        
        return true
      }

      // Hide everything else (toolResult, tool, system messages)
      return false
    })
  }, [historyMessages])

  const messageCount = useMemo(() => {
    return historyMessages.filter((message) => {
      if (message.role !== 'user' && message.role !== 'assistant') return false
      return Boolean(textFromMessage(message))
    }).length
  }, [historyMessages])

  const historyError =
    historyQuery.error instanceof Error ? historyQuery.error.message : null
  const resolvedSessionKey = useMemo(() => {
    const normalizedForced = normalizeSessionCandidate(forcedSessionKey)
    if (normalizedForced) return normalizedForced
    const key = historyQuery.data?.sessionKey
    if (typeof key === 'string' && key.trim().length > 0) {
      return key.trim()
    }
    const normalizedActive = normalizeSessionCandidate(activeSessionKey)
    if (normalizedActive) return normalizedActive
    if (explicitRouteSessionKey) return explicitRouteSessionKey
    return 'main'
  }, [
    activeSessionKey,
    explicitRouteSessionKey,
    forcedSessionKey,
    historyQuery.data?.sessionKey,
  ])
  const activeCanonicalKey = resolvedSessionKey || sessionKeyForHistory || 'main'

  return {
    historyQuery,
    historyMessages,
    displayMessages,
    messageCount,
    historyError,
    resolvedSessionKey,
    activeCanonicalKey,
    sessionKeyForHistory,
  }
}

function mergeOptimisticHistoryMessages(
  serverMessages: Array<GatewayMessage>,
  optimisticMessages: Array<GatewayMessage>,
): Array<GatewayMessage> {
  if (!optimisticMessages.length) return serverMessages

  const merged = [...serverMessages]
  for (const optimisticMessage of optimisticMessages) {
    const hasMatch = serverMessages.some((serverMessage) => {
      if (
        optimisticMessage.clientId &&
        serverMessage.clientId &&
        optimisticMessage.clientId === serverMessage.clientId
      ) {
        return true
      }
      if (
        optimisticMessage.__optimisticId &&
        serverMessage.__optimisticId &&
        optimisticMessage.__optimisticId === serverMessage.__optimisticId
      ) {
        return true
      }
      if (optimisticMessage.role && serverMessage.role) {
        if (optimisticMessage.role !== serverMessage.role) return false
      }
      const optimisticText = textFromMessage(optimisticMessage)
      if (!optimisticText) return false
      if (optimisticText !== textFromMessage(serverMessage)) return false
      const optimisticTime = getMessageTimestamp(optimisticMessage)
      const serverTime = getMessageTimestamp(serverMessage)
      return Math.abs(optimisticTime - serverTime) <= 10000
    })

    if (!hasMatch) {
      merged.push(optimisticMessage)
    }
  }

  return merged
}
