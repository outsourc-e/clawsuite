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
import { ChatEmptyState } from './components/chat-empty-state'
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
// import { useRealtimeChatHistory } from './hooks/use-realtime-chat-history'
import { useChatMobile } from './hooks/use-chat-mobile'
import { useChatSessions } from './hooks/use-chat-sessions'
import { useAutoSessionTitle } from './hooks/use-auto-session-title'
import { ContextBar } from './components/context-bar'
import type {
  ChatComposerAttachment,
  ChatComposerHandle,
  ChatComposerHelpers,
} from './components/chat-composer'
import type { GatewayAttachment } from './types'
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
import { useChatActivityStore } from '@/stores/chat-activity-store'

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
  const streamTimer = useRef<number | null>(null)
  const streamIdleTimer = useRef<number | null>(null)
  const lastAssistantSignature = useRef('')
  const refreshHistoryRef = useRef<() => void>(() => {})

  const pendingStartRef = useRef(false)
  const composerHandleRef = useRef<ChatComposerHandle | null>(null)
  const [fileExplorerCollapsed, setFileExplorerCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('clawsuite-file-explorer-collapsed')
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

  // Display messages from polling (proven upstream approach)
  const finalDisplayMessages = displayMessages

  // --- Stream management (upstream webclaw pattern) ---
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
    return () => { streamStop() }
  }, [streamStop])

  const streamFinish = useCallback(() => {
    streamStop()
    setPendingGeneration(false)
    setWaitingForResponse(false)
    setPinToTop(false)
  }, [streamStop])

  const streamStart = useCallback(() => {
    if (!activeFriendlyId || isNewChat) return
    if (streamTimer.current) window.clearInterval(streamTimer.current)
    streamTimer.current = window.setInterval(() => {
      refreshHistoryRef.current()
    }, 350)
  }, [activeFriendlyId, isNewChat])

  refreshHistoryRef.current = function refreshHistory() {
    if (historyQuery.isFetching) return
    void historyQuery.refetch()
  }

  // Idle detection: when latest displayable assistant message is stable for 4s, finish.
  // Uses displayMessages (filtered) instead of historyMessages so that tool calls
  // (which arrive after the text response) don't prevent completion detection.
  useEffect(() => {
    if (displayMessages.length === 0) return
    const latestDisplay = displayMessages[displayMessages.length - 1]
    // Check both display messages and raw history for assistant completion
    if (latestDisplay.role === 'assistant') {
      const signature = `${displayMessages.length}:${textFromMessage(latestDisplay).slice(-64)}`
      if (signature !== lastAssistantSignature.current) {
        lastAssistantSignature.current = signature
        if (streamIdleTimer.current) {
          window.clearTimeout(streamIdleTimer.current)
        }
        streamIdleTimer.current = window.setTimeout(() => {
          streamFinish()
        }, 4000)
      }
    } else if (latestDisplay.role === 'user' && waitingForResponse) {
      // User message is last displayable message — check raw history for
      // assistant responses that were filtered out (e.g. tool-call-only messages).
      // If raw history has grown since we sent, the agent is actively responding.
      const lastRaw = historyMessages[historyMessages.length - 1]
      if (lastRaw && lastRaw.role !== 'user') {
        // Agent is working (tool calls in progress). Reset idle timer so we
        // keep polling, but also set a longer timeout to eventually finish.
        if (streamIdleTimer.current) {
          window.clearTimeout(streamIdleTimer.current)
        }
        streamIdleTimer.current = window.setTimeout(() => {
          streamFinish()
        }, 8000)
      }
    }
  }, [displayMessages, historyMessages, waitingForResponse, streamFinish])

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

  // Sync chat activity to global store for sidebar orchestrator avatar
  const setLocalActivity = useChatActivityStore((s) => s.setLocalActivity)
  useEffect(() => {
    if (waitingForResponse) {
      setLocalActivity('thinking')
    } else {
      setLocalActivity('idle')
    }
  }, [waitingForResponse, setLocalActivity])

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
   
  const _isSidebarCollapsed = useWorkspaceStore((s) => s.sidebarCollapsed)
  const _handleActiveSessionDelete = useCallback(() => {
    setError(null)
    setIsRedirecting(true)
    navigate({ to: '/new', replace: true })
  }, [navigate])

  const terminalPanelInset =
    !isMobile && isTerminalPanelOpen ? terminalPanelHeight : 0
  const stableContentStyle = useMemo<React.CSSProperties>(() => {
    const composerPadding =
      'calc(var(--chat-composer-height, 160px) + env(safe-area-inset-bottom, 0px) + 48px)'
    return {
      paddingBottom:
        terminalPanelInset > 0
          ? `calc(${composerPadding} + ${terminalPanelInset}px)`
          : composerPadding,
    }
  }, [terminalPanelInset])

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

  // Reset state when session changes
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
    setWaitingForResponse(false)
    setPinToTop(false)
  }, [activeFriendlyId, isNewChat, streamStop])

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
    const cached = queryClient.getQueryData(historyKey)
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

  /**
   * Simplified sendMessage - fire and forget.
   * Response arrives via SSE stream, not via this function.
   */
  function sendMessage(
    sessionKey: string,
    friendlyId: string,
    body: string,
    attachments: Array<GatewayAttachment> = [],
    skipOptimistic = false,
  ) {
    setLocalActivity('reading')
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
        localStorage.setItem('clawsuite-file-explorer-collapsed', String(next))
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
  const historyEmpty = !historyLoading && finalDisplayMessages.length === 0
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
              messages={finalDisplayMessages}
              loading={historyLoading}
              empty={historyEmpty}
              emptyState={<ChatEmptyState compact={compact} />}
              notice={gatewayNotice}
              noticePosition="end"
              waitingForResponse={waitingForResponse}
              sessionKey={activeCanonicalKey}
              pinToTop={false}
              pinGroupMinHeight={pinGroupMinHeight}
              headerHeight={headerHeight}
              contentStyle={stableContentStyle}
              bottomOffset={terminalPanelInset}
              isStreaming={false}
              streamingMessageId={null}
              streamingText={''}
              streamingThinking={''}
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
