import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useStreamingMessage } from './hooks/use-streaming-message'

import {
  deriveFriendlyIdFromKey,
  isMissingGatewayAuth,
  readError,
  textFromMessage,
} from './utils'
import { createOptimisticMessage } from './chat-screen-utils'
import {
  appendHistoryMessage,
  chatQueryKeys,
  clearHistoryMessages,
  fetchGatewayStatus,
  removeHistoryMessageByClientId,
  updateHistoryMessageByClientId,
  updateSessionLastMessage,
} from './chat-queries'
import { chatUiQueryKey, getChatUiState, setChatUiState } from './chat-ui'
import { ChatHeader } from './components/chat-header'
import { ChatMessageList } from './components/chat-message-list'
import { ChatComposer } from './components/chat-composer'
import { GatewayStatusMessage } from './components/gateway-status-message'
import {
  consumePendingSend,
  hasPendingGeneration,
  hasPendingSend,
  isRecentSession,
  resetPendingSend,
  setPendingGeneration,
  setRecentSession,
  stashPendingSend,
} from './pending-send'
import { useChatMeasurements } from './hooks/use-chat-measurements'
import { useChatHistory } from './hooks/use-chat-history'
import { useChatMobile } from './hooks/use-chat-mobile'
import { useChatSessions } from './hooks/use-chat-sessions'
import { useAutoSessionTitle } from './hooks/use-auto-session-title'
import type {
  ChatComposerAttachment,
  ChatComposerHandle,
  ChatComposerHelpers,
} from './components/chat-composer'
import type { GatewayAttachment, GatewayMessage, HistoryResponse as _HistoryResponse } from './types'
import { cn } from '@/lib/utils'
import { FileExplorerSidebar } from '@/components/file-explorer'
import { SEARCH_MODAL_EVENTS } from '@/hooks/use-search-modal'
import { SIDEBAR_TOGGLE_EVENT } from '@/hooks/use-global-shortcuts'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { TerminalPanel } from '@/components/terminal-panel'
import { AgentViewPanel } from '@/components/agent-view/agent-view-panel'
import { useAgentViewStore } from '@/hooks/use-agent-view'
import { useTerminalPanelStore } from '@/stores/terminal-panel-store'
import { useModelSuggestions } from '@/hooks/use-model-suggestions'
import { ModelSuggestionToast } from '@/components/model-suggestion-toast'
import { ContextBar } from './components/context-bar'

type ChatScreenProps = {
  activeFriendlyId: string
  isNewChat?: boolean
  onSessionResolved?: (payload: {
    sessionKey: string
    friendlyId: string
  }) => void
  forcedSessionKey?: string
  /** Hide header + file explorer + terminal for panel mode */
  compact?: boolean
}

type ActiveStreamContext = {
  streamId: string
  sessionKey: string
  friendlyId: string
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function hasResolvedAssistantMessage(
  messages: Array<GatewayMessage>,
  context: ActiveStreamContext,
  finalText: string,
): boolean {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant') continue
    const messageId = message.__optimisticId || (message as any).id
    if (messageId === context.streamId) continue
    const text = textFromMessage(message)
    if (!text.trim()) continue
    if (finalText.trim().length > 0) {
      return text === finalText
    }
    return true
  }
  return false
}

export function ChatScreen({
  activeFriendlyId,
  isNewChat = false,
  onSessionResolved,
  forcedSessionKey,
  compact = false,
}: ChatScreenProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sending, setSending] = useState(false)
  const [_creatingSession, setCreatingSession] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const { headerRef, composerRef, mainRef, pinGroupMinHeight, headerHeight } =
    useChatMeasurements()
  const [waitingForResponse, setWaitingForResponse] = useState(
    () => hasPendingSend() || hasPendingGeneration(),
  )
  const [pinToTop, setPinToTop] = useState(
    () => hasPendingSend() || hasPendingGeneration(),
  )
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  )
  const [streamingText, setStreamingText] = useState<string>('')
  const [streamingThinking, setStreamingThinking] = useState<string>('')
  const [useStreamingApi, setUseStreamingApi] = useState(true)

  const streamTimer = useRef<number | null>(null)
  const streamIdleTimer = useRef<number | null>(null)
  const lastAssistantSignature = useRef('')
  const activeStreamRef = useRef<ActiveStreamContext | null>(null)
  const refreshHistoryRef = useRef<() => void>(() => {})
  const pendingStartRef = useRef(false)
  const composerHandleRef = useRef<ChatComposerHandle | null>(null)
  const [fileExplorerCollapsed, setFileExplorerCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('openclaw-studio-file-explorer-collapsed')
    return stored === null ? true : stored === 'true'
  })
  const { isMobile } = useChatMobile(queryClient)
  const isAgentViewOpen = useAgentViewStore((state) => state.isOpen)
  const isTerminalPanelOpen = useTerminalPanelStore((state) => state.isPanelOpen)
  const terminalPanelHeight = useTerminalPanelStore((state) => state.panelHeight)
  const {
    sessionsQuery,
    sessions,
    activeSession,
    activeExists,
    activeSessionKey,
    activeTitle,
    sessionsError,
    sessionsLoading: _sessionsLoading,
    sessionsFetching: _sessionsFetching,
    refetchSessions: _refetchSessions,
  } = useChatSessions({ activeFriendlyId, isNewChat, forcedSessionKey })
  const {
    historyQuery,
    historyMessages,
    displayMessages,
    messageCount,
    historyError,
    resolvedSessionKey,
    activeCanonicalKey,
    sessionKeyForHistory,
  } = useChatHistory({
    activeFriendlyId,
    activeSessionKey,
    forcedSessionKey,
    isNewChat,
    isRedirecting,
    activeExists,
    sessionsReady: sessionsQuery.isSuccess,
    queryClient,
  })

  useAutoSessionTitle({
    friendlyId: activeFriendlyId,
    sessionKey: resolvedSessionKey,
    activeSession,
    messages: historyMessages,
    messageCount,
    enabled: !isNewChat && Boolean(resolvedSessionKey) && historyQuery.isSuccess,
  })

  // Phase 4.1: Smart Model Suggestions
  const modelsQuery = useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      const res = await fetch('/api/models')
      if (!res.ok) return { models: [] }
      const data = await res.json()
      return data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const currentModelQuery = useQuery({
    queryKey: ['gateway', 'session-status-model'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/session-status')
        if (!res.ok) return ''
        const data = await res.json()
        const payload = data.payload ?? data
        // Same logic as chat-composer: read model from status payload
        if (payload.model) return String(payload.model)
        if (payload.currentModel) return String(payload.currentModel)
        if (payload.modelAlias) return String(payload.modelAlias)
        if (payload.resolved?.modelProvider && payload.resolved?.model) {
          return `${payload.resolved.modelProvider}/${payload.resolved.model}`
        }
        return ''
      } catch {
        return ''
      }
    },
    refetchInterval: 30_000,
    retry: false,
  })

  const availableModelIds = useMemo(() => {
    const models = modelsQuery.data?.models || []
    return models.map((m: any) => m.id).filter((id: string) => id)
  }, [modelsQuery.data])

  const currentModel = currentModelQuery.data || ''

  const { suggestion, dismiss, dismissForSession } = useModelSuggestions({
    currentModel, // Real model from session-status (fail closed if empty)
    sessionKey: resolvedSessionKey || 'main',
    messages: historyMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: textFromMessage(m),
    })) as any,
    availableModels: availableModelIds,
  })

  const handleSwitchModel = useCallback(async () => {
    if (!suggestion) return
    
    try {
      const res = await fetch('/api/model-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionKey: resolvedSessionKey || 'main',
          model: suggestion.suggestedModel,
        }),
      })
      
      if (res.ok) {
        dismiss()
        // Optionally show success toast or update UI
      }
    } catch (error) {
      console.error('Failed to switch model:', error)
    }
  }, [suggestion, resolvedSessionKey, dismiss])

  const clearActiveStream = useCallback(function clearActiveStream(
    streamId?: string,
  ) {
    const current = activeStreamRef.current
    if (!current) return
    if (streamId && current.streamId !== streamId) return
    activeStreamRef.current = null
    setStreamingMessageId(null)
    setStreamingText('')
    setStreamingThinking('')
  }, [])

  const streamStop = useCallback(() => {
    if (streamTimer.current) {
      window.clearInterval(streamTimer.current)
      streamTimer.current = null
    }
    if (streamIdleTimer.current) {
      window.clearTimeout(streamIdleTimer.current)
      streamIdleTimer.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      streamStop()
    }
  }, [streamStop])

  const streamFinish = useCallback((hasContent = false) => {
    streamStop()
    setPendingGeneration(false)
    // Only clear waitingForResponse if we actually have response content
    // Otherwise keep it true so the typing indicator stays visible during history polling
    if (hasContent) {
      setWaitingForResponse(false)
      setPinToTop(false)
    }
  }, [streamStop])

  const finalizeStreamingPlaceholder = useCallback(
    async function finalizeStreamingPlaceholder(
      context: ActiveStreamContext,
      finalText: string,
    ) {
      // If we have final text, mark complete; otherwise keep streaming status
      // so the "Thinking" indicator remains visible during history polling
      updateHistoryMessageByClientId(
        queryClient,
        context.friendlyId,
        context.sessionKey,
        context.streamId,
        function markStreamComplete(message) {
          return {
            ...message,
            __streamingStatus: finalText ? 'complete' : 'streaming',
            __streamingText: finalText,
          }
        },
      )

      const historyKey = chatQueryKeys.history(
        context.friendlyId,
        context.sessionKey,
      )
      const maxAttempts = 12

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const cached = queryClient.getQueryData(historyKey) as Record<string, unknown> | undefined
        const cachedMessages = Array.isArray((cached as any)?.messages)
          ? (cached as any).messages
          : []
        if (hasResolvedAssistantMessage(cachedMessages, context, finalText)) {
          break
        }
        await historyQuery.refetch()
        await waitFor(Math.min(320, 80 + attempt * 20))
      }

      if (activeStreamRef.current?.streamId !== context.streamId) {
        return
      }

      removeHistoryMessageByClientId(
        queryClient,
        context.friendlyId,
        context.sessionKey,
        context.streamId,
      )
      clearActiveStream(context.streamId)
      streamFinish(true) // History resolved — response is now visible
    },
    [clearActiveStream, historyQuery, queryClient, streamFinish],
  )

  // Streaming message hook
  const streaming = useStreamingMessage({
    onChunk: useCallback((_chunk: string, fullText: string) => {
      setStreamingText(fullText)
      const context = activeStreamRef.current
      if (!context) return
      updateHistoryMessageByClientId(
        queryClient,
        context.friendlyId,
        context.sessionKey,
        context.streamId,
        function updateStreamingMessage(message) {
          return { ...message, __streamingText: fullText }
        },
      )
    }, [queryClient]),
    onThinking: useCallback((thinking: string) => {
      setStreamingThinking(thinking)
      const context = activeStreamRef.current
      if (!context) return
      updateHistoryMessageByClientId(
        queryClient,
        context.friendlyId,
        context.sessionKey,
        context.streamId,
        function updateStreamingThinking(message) {
          return { ...message, __streamingThinking: thinking }
        },
      )
    }, [queryClient]),
    onComplete: useCallback(
      async function onComplete(message: GatewayMessage) {
        const context = activeStreamRef.current
        if (!context) {
          streamFinish()
          return
        }
        const finalText = textFromMessage(message)
        setStreamingText(finalText)
        setStreamingThinking('')
        await finalizeStreamingPlaceholder(context, finalText)
      },
      [finalizeStreamingPlaceholder, streamFinish],
    ),
    onError: useCallback((errorMessage: string) => {
      const context = activeStreamRef.current
      if (context) {
        removeHistoryMessageByClientId(
          queryClient,
          context.friendlyId,
          context.sessionKey,
          context.streamId,
        )
        clearActiveStream(context.streamId)
      } else {
        setStreamingMessageId(null)
        setStreamingText('')
        setStreamingThinking('')
      }
      setError(`Streaming error: ${errorMessage}`)
      streamFinish(true) // Error = stop waiting
    }, [clearActiveStream, queryClient, streamFinish]),
  })

  const _uiQuery = useQuery({
    queryKey: chatUiQueryKey,
    queryFn: function readUiState() {
      return getChatUiState(queryClient)
    },
    initialData: function initialUiState() {
      return getChatUiState(queryClient)
    },
    staleTime: Infinity,
  })
  const gatewayStatusQuery = useQuery({
    queryKey: ['gateway', 'status'],
    queryFn: fetchGatewayStatus,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: 'always',
  })
  const gatewayStatusMountRef = useRef(Date.now())
  const gatewayStatusError =
    gatewayStatusQuery.error instanceof Error
      ? gatewayStatusQuery.error.message
      : gatewayStatusQuery.data && !gatewayStatusQuery.data.ok
        ? gatewayStatusQuery.data.error || 'Gateway unavailable'
        : null
  const gatewayError = gatewayStatusError ?? sessionsError ?? historyError
  const handleGatewayRefetch = useCallback(() => {
    void gatewayStatusQuery.refetch()
  }, [gatewayStatusQuery])
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
  const _isSidebarCollapsed = useWorkspaceStore((s) => s.sidebarCollapsed)
  const _handleActiveSessionDelete = useCallback(() => {
    setError(null)
    setIsRedirecting(true)
    navigate({ to: '/new', replace: true })
  }, [navigate])
  const streamStart = useCallback(() => {
    if (!activeFriendlyId || isNewChat) return
    if (streamTimer.current) window.clearInterval(streamTimer.current)
    streamTimer.current = window.setInterval(() => {
      refreshHistoryRef.current()
    }, 1200)
  }, [activeFriendlyId, isNewChat])
  const terminalPanelInset =
    !isMobile && isTerminalPanelOpen ? terminalPanelHeight : 0
  const stableContentStyle = useMemo<React.CSSProperties>(() => {
    const composerPadding =
      'calc(var(--chat-composer-height, 140px) + env(safe-area-inset-bottom, 0px) + 24px)'
    return {
      paddingBottom:
        terminalPanelInset > 0
          ? `calc(${composerPadding} + ${terminalPanelInset}px)`
          : composerPadding,
    }
  }, [terminalPanelInset])
  refreshHistoryRef.current = function refreshHistory() {
    if (historyQuery.isFetching) return
    void historyQuery.refetch()
  }

  useEffect(() => {
    if (isRedirecting) {
      if (error) setError(null)
      return
    }
    if (shouldRedirectToNew) {
      if (error) setError(null)
      return
    }
    if (sessionsQuery.isSuccess && !activeExists) {
      if (error) setError(null)
      return
    }
    const messageText = sessionsError ?? historyError ?? gatewayStatusError
    if (!messageText) {
      if (error?.startsWith('Failed to load')) {
        setError(null)
      }
      return
    }
    if (isMissingGatewayAuth(messageText)) {
      navigate({ to: '/connect', replace: true })
    }
    const message = sessionsError
      ? `Failed to load sessions. ${sessionsError}`
      : historyError
        ? `Failed to load history. ${historyError}`
        : gatewayStatusError
          ? `Gateway unavailable. ${gatewayStatusError}`
          : null
    if (message) setError(message)
  }, [
    error,
    gatewayStatusError,
    historyError,
    isRedirecting,
    navigate,
    sessionsError,
  ])

  const shouldRedirectToNew =
    !isNewChat &&
    !forcedSessionKey &&
    !isRecentSession(activeFriendlyId) &&
    sessionsQuery.isSuccess &&
    sessions.length > 0 &&
    !sessions.some((session) => session.friendlyId === activeFriendlyId) &&
    !historyQuery.isFetching &&
    !historyQuery.isSuccess

  useEffect(() => {
    if (!isRedirecting) return
    if (isNewChat) {
      setIsRedirecting(false)
      return
    }
    if (!shouldRedirectToNew && sessionsQuery.isSuccess) {
      setIsRedirecting(false)
    }
  }, [isNewChat, isRedirecting, sessionsQuery.isSuccess, shouldRedirectToNew])

  useEffect(() => {
    if (isNewChat) return
    if (!sessionsQuery.isSuccess) return
    if (sessions.length === 0) return
    if (!shouldRedirectToNew) return
    resetPendingSend()
    clearHistoryMessages(queryClient, activeFriendlyId, sessionKeyForHistory)
    navigate({ to: '/new', replace: true })
  }, [
    activeFriendlyId,
    historyQuery.isFetching,
    historyQuery.isSuccess,
    isNewChat,
    navigate,
    queryClient,
    sessionKeyForHistory,
    sessions,
    sessionsQuery.isSuccess,
    shouldRedirectToNew,
  ])

  const hideUi = shouldRedirectToNew || isRedirecting
  const showComposer = !isRedirecting

  useEffect(() => {
    const latestMessage = historyMessages[historyMessages.length - 1]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
    if (!latestMessage || latestMessage.role !== 'assistant') return

    const activeContext = activeStreamRef.current
    if (activeContext) {
      const finalText = textFromMessage(latestMessage)
      if (hasResolvedAssistantMessage(historyMessages, activeContext, finalText)) {
        removeHistoryMessageByClientId(
          queryClient,
          activeContext.friendlyId,
          activeContext.sessionKey,
          activeContext.streamId,
        )
        clearActiveStream(activeContext.streamId)
        streamFinish(true)
        return
      }
    }

    const signature = `${historyMessages.length}:${textFromMessage(latestMessage).slice(-64)}`
    if (signature !== lastAssistantSignature.current) {
      lastAssistantSignature.current = signature
      if (streamIdleTimer.current) {
        window.clearTimeout(streamIdleTimer.current)
      }
      streamIdleTimer.current = window.setTimeout(() => {
        streamFinish(true)
      }, 4000)
    }
  }, [clearActiveStream, historyMessages, queryClient, streamFinish])

  useEffect(() => {
    const resetKey = isNewChat ? 'new' : activeFriendlyId
    if (!resetKey) return
    if (pendingStartRef.current) {
      pendingStartRef.current = false
      return
    }
    if (hasPendingSend() || hasPendingGeneration()) {
      setWaitingForResponse(true)
      setPinToTop(true)
      return
    }
    streamStop()
    lastAssistantSignature.current = ''
    clearActiveStream()
    setWaitingForResponse(false)
    setPinToTop(false)
  }, [activeFriendlyId, clearActiveStream, isNewChat, streamStop])

  useLayoutEffect(() => {
    if (isNewChat) return
    const pending = consumePendingSend(
      forcedSessionKey || resolvedSessionKey || activeSessionKey,
      activeFriendlyId,
    )
    if (!pending) return
    pendingStartRef.current = true
    const historyKey = chatQueryKeys.history(
      pending.friendlyId,
      pending.sessionKey,
    )
    const cached = queryClient.getQueryData(historyKey) as Record<string, unknown> | undefined
    const cachedMessages = Array.isArray((cached as any)?.messages)
      ? (cached as any).messages
      : []
    const alreadyHasOptimistic = cachedMessages.some((message: any) => {
      if (pending.optimisticMessage.clientId) {
        if (message.clientId === pending.optimisticMessage.clientId) return true
        if (message.__optimisticId === pending.optimisticMessage.clientId)
          return true
      }
      if (pending.optimisticMessage.__optimisticId) {
        if (message.__optimisticId === pending.optimisticMessage.__optimisticId)
          return true
      }
      return false
    })
    if (!alreadyHasOptimistic) {
      appendHistoryMessage(
        queryClient,
        pending.friendlyId,
        pending.sessionKey,
        pending.optimisticMessage,
      )
    }
    setWaitingForResponse(true)
    setPinToTop(true)
    sendMessage(
      pending.sessionKey,
      pending.friendlyId,
      pending.message,
      pending.attachments,
      true,
    )
  }, [
    activeFriendlyId,
    activeSessionKey,
    forcedSessionKey,
    isNewChat,
    queryClient,
    resolvedSessionKey,
  ])

  function sendMessage(
    sessionKey: string,
    friendlyId: string,
    body: string,
    attachments: Array<GatewayAttachment> = [],
    skipOptimistic = false,
  ) {
    const normalizedAttachments = attachments.map((attachment) => ({
      ...attachment,
      id: attachment.id ?? crypto.randomUUID(),
    }))

    let optimisticClientId = ''
    if (!skipOptimistic) {
      const { clientId, optimisticMessage } = createOptimisticMessage(
        body,
        normalizedAttachments,
      )
      optimisticClientId = clientId
      appendHistoryMessage(
        queryClient,
        friendlyId,
        sessionKey,
        optimisticMessage,
      )
      updateSessionLastMessage(
        queryClient,
        sessionKey,
        friendlyId,
        optimisticMessage,
      )
    }

    setPendingGeneration(true)
    setSending(true)
    setError(null)
    setWaitingForResponse(true)
    setPinToTop(true)

    const payloadAttachments = normalizedAttachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size,
      dataUrl: attachment.dataUrl,
    }))

    if (useStreamingApi) {
      if (activeStreamRef.current) {
        const previous = activeStreamRef.current
        removeHistoryMessageByClientId(
          queryClient,
          previous.friendlyId,
          previous.sessionKey,
          previous.streamId,
        )
        clearActiveStream(previous.streamId)
      }

      const streamContext: ActiveStreamContext = {
        streamId: `streaming-${Date.now()}`,
        friendlyId,
        sessionKey,
      }
      activeStreamRef.current = streamContext
      setStreamingMessageId(streamContext.streamId)
      setStreamingText('')
      setStreamingThinking('')

      const streamingPlaceholder: GatewayMessage = {
        role: 'assistant',
        content: [],
        __optimisticId: streamContext.streamId,
        __streamingStatus: 'streaming',
        __streamingText: '',
        __streamingThinking: '',
        timestamp: Date.now(),
      }
      appendHistoryMessage(queryClient, friendlyId, sessionKey, streamingPlaceholder)

      streaming.startStreaming({
        sessionKey,
        friendlyId,
        message: body,
        thinking: 'low',
        attachments: payloadAttachments.length > 0 ? payloadAttachments : undefined,
      }).catch(() => {
        setUseStreamingApi(false)
        if (activeStreamRef.current?.streamId === streamContext.streamId) {
          removeHistoryMessageByClientId(
            queryClient,
            friendlyId,
            sessionKey,
            streamContext.streamId,
          )
          clearActiveStream(streamContext.streamId)
        }
        sendMessageNonStreaming(
          sessionKey,
          friendlyId,
          body,
          payloadAttachments,
          optimisticClientId,
        )
      })

      setSending(false)
      return
    }

    sendMessageNonStreaming(
      sessionKey,
      friendlyId,
      body,
      payloadAttachments,
      optimisticClientId,
    )
  }

  function sendMessageNonStreaming(
    sessionKey: string,
    friendlyId: string,
    body: string,
    payloadAttachments: Array<{
      id?: string
      name?: string
      contentType?: string
      size?: number
      dataUrl?: string
    }>,
    optimisticClientId: string,
  ) {
    fetch('/api/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionKey,
        friendlyId,
        message: body,
        attachments: payloadAttachments.length > 0 ? payloadAttachments : undefined,
        thinking: 'low',
        idempotencyKey: crypto.randomUUID(),
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res))
        streamStart()
      })
      .catch((err) => {
        const messageText = err instanceof Error ? err.message : String(err)
        if (isMissingGatewayAuth(messageText)) {
          navigate({ to: '/connect', replace: true })
          return
        }
        if (optimisticClientId) {
          updateHistoryMessageByClientId(
            queryClient,
            friendlyId,
            sessionKey,
            optimisticClientId,
            function markFailed(message) {
              return { ...message, status: 'error' }
            },
          )
        }
        setError(`Failed to send message. ${messageText}`)
        setPendingGeneration(false)
        setWaitingForResponse(false)
        setPinToTop(false)
      })
      .finally(() => {
        setSending(false)
      })
  }

  const createSessionForMessage = useCallback(async () => {
    setCreatingSession(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(await readError(res))

      const data = (await res.json()) as {
        sessionKey?: string
        friendlyId?: string
      }

      const sessionKey =
        typeof data.sessionKey === 'string' ? data.sessionKey : ''
      const friendlyId =
        typeof data.friendlyId === 'string' && data.friendlyId.trim().length > 0
          ? data.friendlyId.trim()
          : deriveFriendlyIdFromKey(sessionKey)

      if (!sessionKey || !friendlyId) {
        throw new Error('Invalid session response')
      }

      queryClient.invalidateQueries({ queryKey: chatQueryKeys.sessions })
      return { sessionKey, friendlyId }
    } finally {
      setCreatingSession(false)
    }
  }, [queryClient])

  const send = useCallback(
    (
      body: string,
      attachments: Array<ChatComposerAttachment>,
      helpers: ChatComposerHelpers,
    ) => {
      const trimmedBody = body.trim()
      if (trimmedBody.length === 0 && attachments.length === 0) return
      helpers.reset()

      const attachmentPayload: Array<GatewayAttachment> = attachments.map(
        (attachment) => ({
          ...attachment,
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
          id: attachment.id ?? crypto.randomUUID(),
        }),
      )

      if (isNewChat) {
        const { clientId, optimisticId, optimisticMessage } =
          createOptimisticMessage(trimmedBody, attachmentPayload)
        appendHistoryMessage(queryClient, 'new', 'new', optimisticMessage)
        setPendingGeneration(true)
        setSending(true)
        setWaitingForResponse(true)
        setPinToTop(true)

        createSessionForMessage()
          .then(({ sessionKey, friendlyId }) => {
            setRecentSession(friendlyId)
            stashPendingSend({
              sessionKey,
              friendlyId,
              message: trimmedBody,
              attachments: attachmentPayload,
              optimisticMessage,
            })
            if (onSessionResolved) {
              onSessionResolved({ sessionKey, friendlyId })
              return
            }
            navigate({
              to: '/chat/$sessionKey',
              params: { sessionKey: friendlyId },
              replace: true,
            })
          })
          .catch((err: unknown) => {
            removeHistoryMessageByClientId(
              queryClient,
              'new',
              'new',
              clientId,
              optimisticId,
            )
            helpers.setValue(trimmedBody)
            helpers.setAttachments(attachments)
            setError(
              `Failed to create session. ${err instanceof Error ? err.message : String(err)}`,
            )
            setPendingGeneration(false)
            setWaitingForResponse(false)
            setPinToTop(false)
            setSending(false)
          })
        return
      }

      const sessionKeyForSend =
        forcedSessionKey || resolvedSessionKey || activeSessionKey
      sendMessage(
        sessionKeyForSend,
        activeFriendlyId,
        trimmedBody,
        attachmentPayload,
      )
    },
    [
      activeFriendlyId,
      activeSessionKey,
      createSessionForMessage,
      forcedSessionKey,
      isNewChat,
      navigate,
      onSessionResolved,
      queryClient,
      resolvedSessionKey,
    ],
  )

  const _startNewChat = useCallback(() => {
    setWaitingForResponse(false)
    setPinToTop(false)
    clearHistoryMessages(queryClient, 'new', 'new')
    navigate({ to: '/new' })
    if (isMobile) {
      setChatUiState(queryClient, function collapse(state) {
        return { ...state, isSidebarCollapsed: true }
      })
    }
  }, [isMobile, navigate, queryClient])

  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar)
  const setSidebarCollapsed = useWorkspaceStore((s) => s.setSidebarCollapsed)

  const handleToggleSidebarCollapse = useCallback(() => {
    toggleSidebar()
  }, [toggleSidebar])

  const _handleSelectSession = useCallback(() => {
    if (!isMobile) return
    setSidebarCollapsed(true)
  }, [isMobile, setSidebarCollapsed])

  const handleOpenSidebar = useCallback(() => {
    setSidebarCollapsed(false)
  }, [setSidebarCollapsed])

  const handleToggleFileExplorer = useCallback(() => {
    setFileExplorerCollapsed((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        localStorage.setItem('openclaw-studio-file-explorer-collapsed', String(next))
      }
      return next
    })
  }, [])

  useEffect(() => {
    function handleToggleFileExplorerFromSearch() {
      handleToggleFileExplorer()
    }

    window.addEventListener(
      SEARCH_MODAL_EVENTS.TOGGLE_FILE_EXPLORER,
      handleToggleFileExplorerFromSearch,
    )
    window.addEventListener(
      SIDEBAR_TOGGLE_EVENT,
      handleToggleSidebarCollapse,
    )
    return () => {
      window.removeEventListener(
        SEARCH_MODAL_EVENTS.TOGGLE_FILE_EXPLORER,
        handleToggleFileExplorerFromSearch,
      )
      window.removeEventListener(
        SIDEBAR_TOGGLE_EVENT,
        handleToggleSidebarCollapse,
      )
    }
  }, [handleToggleFileExplorer, handleToggleSidebarCollapse])

  const handleInsertFileReference = useCallback((reference: string) => {
    composerHandleRef.current?.insertText(reference)
  }, [])

  const historyLoading =
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
    (historyQuery.isLoading && !historyQuery.data) || isRedirecting
  const showGatewayDown = Boolean(gatewayStatusError)
  const showGatewayNotice =
    showGatewayDown &&
    gatewayStatusQuery.errorUpdatedAt > gatewayStatusMountRef.current
  const historyEmpty = !historyLoading && displayMessages.length === 0
  const gatewayNotice = useMemo(() => {
    if (!showGatewayNotice) return null
    if (!gatewayError) return null
    return (
      <GatewayStatusMessage
        state="error"
        error={gatewayError}
        onRetry={handleGatewayRefetch}
      />
    )
  }, [gatewayError, handleGatewayRefetch, showGatewayNotice])

  const hasActiveStreamPlaceholder = streamingMessageId !== null

  return (
    <div className="relative h-full min-w-0 flex flex-col">
      <div
        className={cn(
          'flex-1 min-h-0 overflow-hidden',
          compact ? 'w-full' : isMobile ? 'relative' : 'grid grid-cols-[auto_1fr]',
        )}
      >
        {hideUi || compact ? null : isMobile ? null : (
          <FileExplorerSidebar
            collapsed={fileExplorerCollapsed}
            onToggle={handleToggleFileExplorer}
            onInsertReference={handleInsertFileReference}
          />
        )}

        <main
          className={cn(
            'flex h-full min-h-0 min-w-0 flex-col transition-[margin-right,margin-bottom] duration-200',
            !compact && isAgentViewOpen ? 'min-[1024px]:mr-80' : 'mr-0',
          )}
          style={{ marginBottom: terminalPanelInset > 0 ? `${terminalPanelInset}px` : undefined }}
          ref={mainRef}
        >
          {!compact && (
            <ChatHeader
              activeTitle={activeTitle}
              wrapperRef={headerRef}
              showSidebarButton={isMobile}
              onOpenSidebar={handleOpenSidebar}
              showFileExplorerButton={!isMobile}
              fileExplorerCollapsed={fileExplorerCollapsed}
              onToggleFileExplorer={handleToggleFileExplorer}
            />
          )}

          <ContextBar compact={compact} />

          {hideUi ? null : (
            <ChatMessageList
              messages={displayMessages}
              loading={historyLoading}
              empty={historyEmpty}
              notice={gatewayNotice}
              noticePosition="end"
              waitingForResponse={waitingForResponse}
              sessionKey={activeCanonicalKey}
              pinToTop={pinToTop}
              pinGroupMinHeight={pinGroupMinHeight}
              headerHeight={headerHeight}
              contentStyle={stableContentStyle}
              bottomOffset={terminalPanelInset}
              isStreaming={streaming.isStreaming || hasActiveStreamPlaceholder}
              streamingMessageId={streamingMessageId}
              streamingText={streamingText}
              streamingThinking={streamingThinking}
            />
          )}
          {showComposer ? (
            <ChatComposer
              onSubmit={send}
              isLoading={sending}
              disabled={sending || hideUi}
              sessionKey={
                isNewChat
                  ? undefined
                  : forcedSessionKey || resolvedSessionKey || activeSessionKey
              }
              wrapperRef={composerRef}
              composerRef={composerHandleRef}
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
              focusKey={`${isNewChat ? 'new' : activeFriendlyId}:${activeCanonicalKey ?? ''}`}
            />
          ) : null}
        </main>
        {!compact && <AgentViewPanel />}
      </div>
      {!compact && !hideUi && !isMobile && <TerminalPanel />}

      {suggestion && (
        <ModelSuggestionToast
          suggestedModel={suggestion.suggestedModel}
          reason={suggestion.reason}
          costImpact={suggestion.costImpact}
          onSwitch={handleSwitchModel}
          onDismiss={dismiss}
          onDismissForSession={dismissForSession}
        />
      )}
    </div>
  )
}
