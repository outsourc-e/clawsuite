import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  getMessageTimestamp,
  getToolCallsFromMessage,
  textFromMessage,
} from '../utils'
import { MessageItem } from './message-item'
import { ScrollToBottomButton } from './scroll-to-bottom-button'
import type { GatewayMessage } from '../types'
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from '@/components/prompt-kit/chat-container'
import { TypingIndicator } from '@/components/prompt-kit/typing-indicator'
import { cn } from '@/lib/utils'

const VIRTUAL_ROW_HEIGHT = 136
const VIRTUAL_OVERSCAN = 8
const NEAR_BOTTOM_THRESHOLD = 120

type ChatMessageListProps = {
  messages: Array<GatewayMessage>
  loading: boolean
  empty: boolean
  emptyState?: React.ReactNode
  notice?: React.ReactNode
  noticePosition?: 'start' | 'end'
  waitingForResponse: boolean
  sessionKey?: string
  pinToTop: boolean
  pinGroupMinHeight: number
  headerHeight: number
  contentStyle?: React.CSSProperties
  // Streaming support
  streamingMessageId?: string | null
  streamingText?: string
  streamingThinking?: string
  isStreaming?: boolean
  bottomOffset?: number
}

function ChatMessageListComponent({
  messages,
  loading,
  empty,
  emptyState,
  notice,
  noticePosition = 'start',
  waitingForResponse,
  sessionKey,
  pinToTop,
  pinGroupMinHeight,
  headerHeight,
  contentStyle,
  streamingMessageId,
  streamingText,
  streamingThinking,
  isStreaming = false,
  bottomOffset = 0,
}: ChatMessageListProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const lastUserRef = useRef<HTMLDivElement | null>(null)
  const programmaticScroll = useRef(false)
  const prevPinRef = useRef(pinToTop)
  const prevUserIndexRef = useRef<number | undefined>(undefined)
  const prevSessionKeyRef = useRef<string | undefined>(sessionKey)
  const stickToBottomRef = useRef(true)
  const messageSignatureRef = useRef<Map<string, string>>(new Map())
  const initialRenderRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  const smoothScrollFrameRef = useRef<number | null>(null)
  const releaseProgrammaticScrollTimerRef = useRef<number | null>(null)
  const prevDisplayMessageCountRef = useRef(0)
  const prevUnreadSessionKeyRef = useRef<string | undefined>(sessionKey)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [scrollMetrics, setScrollMetrics] = useState({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
  })

  const handleUserScroll = useCallback(function handleUserScroll(metrics: {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
  }) {
    const isUserScrollingUp = metrics.scrollTop < lastScrollTopRef.current - 2
    lastScrollTopRef.current = metrics.scrollTop

    if (isUserScrollingUp) {
      stickToBottomRef.current = false
    }

    if (!programmaticScroll.current) {
      const distanceFromBottom =
        metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight
      const nearBottom = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD
      stickToBottomRef.current = nearBottom
      setIsNearBottom(nearBottom)
      if (nearBottom) {
        setUnreadCount(0)
      }
    }
    setScrollMetrics(metrics)
  }, [])

  const setProgrammaticScroll = useCallback(function setProgrammaticScroll(
    activeForMs: number,
  ) {
    programmaticScroll.current = true
    if (releaseProgrammaticScrollTimerRef.current !== null) {
      window.clearTimeout(releaseProgrammaticScrollTimerRef.current)
    }
    releaseProgrammaticScrollTimerRef.current = window.setTimeout(() => {
      programmaticScroll.current = false
      releaseProgrammaticScrollTimerRef.current = null
    }, activeForMs)
  }, [])

  const scrollToAnchor = useCallback(
    function scrollToAnchor(behavior: ScrollBehavior, activeForMs: number) {
      const anchor = anchorRef.current
      if (!anchor) return
      setProgrammaticScroll(activeForMs)
      const viewport = anchor.closest(
        '[data-chat-scroll-viewport]'
      )
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior })
        return
      }
      anchor.scrollIntoView({ behavior, block: 'end' })
    },
    [setProgrammaticScroll],
  )

  // Filter out toolResult messages - they'll be displayed inside their associated tool calls
  const displayMessages = useMemo(() => {
    return messages.filter((msg) => msg.role !== 'toolResult')
  }, [messages])

  const toolResultsByCallId = useMemo(() => {
    const map = new Map<string, GatewayMessage>()
    for (const message of messages) {
      if (message.role !== 'toolResult') continue
      const toolCallId = message.toolCallId
      if (typeof toolCallId === 'string' && toolCallId.trim().length > 0) {
        map.set(toolCallId, message)
      }
    }
    return map
  }, [messages])

  const streamingState = useMemo(() => {
    const prevSignatures = messageSignatureRef.current
    const nextSignatures = new Map<string, string>()
    const toStream = new Set<string>()
    const isInitialRender = initialRenderRef.current

    displayMessages.forEach((message, index) => {
      const stableId = getStableMessageId(message, index)
      const text = textFromMessage(message)
      const timestamp = getMessageTimestamp(message)
      const streamingStatus = message.__streamingStatus ?? 'idle'
      const signature = `${streamingStatus}:${timestamp}:${text.length}:${text.slice(-48)}`
      nextSignatures.set(stableId, signature)

      if (
        !isInitialRender &&
        message.role === 'assistant' &&
        streamingStatus !== 'streaming'
      ) {
        const prevSignature = prevSignatures.get(stableId)
        if (prevSignature !== signature && text.trim().length > 0) {
          toStream.add(stableId)
        }
      }
    })

    messageSignatureRef.current = nextSignatures
    if (isInitialRender) {
      initialRenderRef.current = false
      return { streamingTargets: new Set<string>(), signatureById: nextSignatures }
    }

    return { streamingTargets: toStream, signatureById: nextSignatures }
  }, [displayMessages])

  const lastAssistantIndex = displayMessages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role !== 'user')
    .map(({ index }) => index)
    .pop()
  const lastUserIndex = displayMessages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === 'user')
    .map(({ index }) => index)
    .pop()
  // Don't show typing indicator if we're streaming
  const showTypingIndicator =
    !isStreaming &&
    streamingState.streamingTargets.size === 0 &&
    waitingForResponse &&
    (typeof lastUserIndex !== 'number' ||
      typeof lastAssistantIndex !== 'number' ||
      lastAssistantIndex < lastUserIndex)

  // Pin the last user+assistant group without adding bottom padding.
  const groupStartIndex = typeof lastUserIndex === 'number' ? lastUserIndex : -1
  const hasGroup = pinToTop && groupStartIndex >= 0
  const shouldVirtualize = !hasGroup && displayMessages.length > 80

  const virtualRange = useMemo(() => {
    if (!shouldVirtualize || scrollMetrics.clientHeight <= 0) {
      return {
        startIndex: 0,
        endIndex: displayMessages.length,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      }
    }

    const startIndex = Math.max(
      0,
      Math.floor(scrollMetrics.scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN,
    )
    const visibleCount = Math.ceil(
      scrollMetrics.clientHeight / VIRTUAL_ROW_HEIGHT,
    )
    const endIndex = Math.min(
      displayMessages.length,
      startIndex + visibleCount + VIRTUAL_OVERSCAN * 2,
    )

    return {
      startIndex,
      endIndex,
      topSpacerHeight: startIndex * VIRTUAL_ROW_HEIGHT,
      bottomSpacerHeight: (displayMessages.length - endIndex) * VIRTUAL_ROW_HEIGHT,
    }
  }, [displayMessages.length, scrollMetrics, shouldVirtualize])

  function isMessageStreaming(message: GatewayMessage, index: number) {
    if (!isStreaming || !streamingMessageId) return false
    const messageId = message.__optimisticId || (message as any).id
    return (
      messageId === streamingMessageId ||
      (message.role === 'assistant' && index === lastAssistantIndex)
    )
  }

  function renderMessage(chatMessage: GatewayMessage, realIndex: number) {
    const messageIsStreaming = isMessageStreaming(chatMessage, realIndex)
    const stableId = getStableMessageId(chatMessage, realIndex)
    const signature = streamingState.signatureById.get(stableId)
    const simulateStreaming =
      !messageIsStreaming && streamingState.streamingTargets.has(stableId)
    const spacingClass = getMessageSpacingClass(displayMessages, realIndex)
    const forceActionsVisible =
      typeof lastAssistantIndex === 'number' && realIndex === lastAssistantIndex
    const hasToolCalls =
      chatMessage.role === 'assistant' &&
      getToolCallsFromMessage(chatMessage).length > 0

    return (
      <MessageItem
        key={stableId}
        message={chatMessage}
        toolResultsByCallId={hasToolCalls ? toolResultsByCallId : undefined}
        forceActionsVisible={forceActionsVisible}
        wrapperClassName={spacingClass}
        isStreaming={messageIsStreaming}
        streamingText={messageIsStreaming ? streamingText : undefined}
        streamingThinking={messageIsStreaming ? streamingThinking : undefined}
        simulateStreaming={simulateStreaming}
        streamingKey={signature}
      />
    )
  }

  useLayoutEffect(() => {
    if (loading) return
    if (pinToTop) {
      const shouldPin =
        !prevPinRef.current || prevUserIndexRef.current !== lastUserIndex
      prevPinRef.current = true
      prevUserIndexRef.current = lastUserIndex
      if (shouldPin && lastUserRef.current) {
        setProgrammaticScroll(32)
        lastUserRef.current.scrollIntoView({ behavior: 'auto', block: 'start' })
      }
      return
    }

    prevPinRef.current = false
    prevUserIndexRef.current = lastUserIndex
    const sessionChanged = prevSessionKeyRef.current !== sessionKey
    prevSessionKeyRef.current = sessionKey
    if (!stickToBottomRef.current && !sessionChanged) return

    if (anchorRef.current) {
      scrollToAnchor(sessionChanged ? 'auto' : 'smooth', sessionChanged ? 32 : 220)
    }
  }, [loading, displayMessages.length, sessionKey, pinToTop, lastUserIndex])

  useLayoutEffect(() => {
    if (loading || pinToTop || !isStreaming) return
    if (!stickToBottomRef.current) return
    if (smoothScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(smoothScrollFrameRef.current)
    }
    smoothScrollFrameRef.current = window.requestAnimationFrame(() => {
      smoothScrollFrameRef.current = null
      scrollToAnchor('auto', 72)
    })
  }, [isStreaming, loading, pinToTop, streamingText, streamingThinking])

  useEffect(() => {
    const sessionChanged = prevUnreadSessionKeyRef.current !== sessionKey
    if (sessionChanged) {
      prevUnreadSessionKeyRef.current = sessionKey
      prevDisplayMessageCountRef.current = displayMessages.length
      setUnreadCount(0)
      return
    }

    const previousCount = prevDisplayMessageCountRef.current
    const nextCount = displayMessages.length
    if (previousCount === 0) {
      prevDisplayMessageCountRef.current = nextCount
      return
    }

    const addedCount = nextCount - previousCount
    if (addedCount > 0 && !stickToBottomRef.current && !loading) {
      setUnreadCount((currentCount) => currentCount + addedCount)
    }
    prevDisplayMessageCountRef.current = nextCount
  }, [displayMessages.length, loading, sessionKey])

  const handleScrollToBottom = useCallback(function handleScrollToBottom() {
    stickToBottomRef.current = true
    setIsNearBottom(true)
    setUnreadCount(0)
    scrollToAnchor('smooth', 220)
  }, [scrollToAnchor])

  const scrollToBottomOverlay = useMemo(() => {
    const isVisible = !isNearBottom && displayMessages.length > 0
    return (
      <div
        className="pointer-events-none fixed left-1/2 z-40 -translate-x-1/2"
        style={{ bottom: `${bottomOffset + 24}px` }}
      >
        <ScrollToBottomButton
          isVisible={isVisible}
          unreadCount={unreadCount}
          onClick={handleScrollToBottom}
        />
      </div>
    )
  }, [
    bottomOffset,
    displayMessages.length,
    handleScrollToBottom,
    isNearBottom,
    unreadCount,
  ])

  useEffect(() => {
    return () => {
      if (smoothScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(smoothScrollFrameRef.current)
      }
      if (releaseProgrammaticScrollTimerRef.current !== null) {
        window.clearTimeout(releaseProgrammaticScrollTimerRef.current)
      }
    }
  }, [])

  return (
    // mt-2 is to fix the prompt-input cut off
    <ChatContainerRoot
      className="flex-1 min-h-0"
      onUserScroll={handleUserScroll}
      overlay={scrollToBottomOverlay}
    >
      <ChatContainerContent className="pt-6" style={contentStyle}>
        {notice && noticePosition === 'start' ? notice : null}
        {empty && !notice ? (
          (emptyState ?? <div aria-hidden></div>)
        ) : hasGroup ? (
          <>
            {displayMessages.slice(0, groupStartIndex).map(renderMessage)}
            {/* // Keep the last exchange pinned without extra tail gap. // Account
            for space-y-6 (24px) when pinning. */}
            <div
              className="my-3 flex flex-col gap-3"
              style={{ minHeight: `${Math.max(0, pinGroupMinHeight - 12)}px` }}
            >
              {displayMessages
                .slice(groupStartIndex)
                .map((chatMessage, index) => {
                  const realIndex = groupStartIndex + index
                  const messageIsStreaming = isMessageStreaming(
                    chatMessage,
                    realIndex,
                  )
                  const stableId = getStableMessageId(chatMessage, realIndex)
                  const signature = streamingState.signatureById.get(stableId)
                  const simulateStreaming =
                    !messageIsStreaming &&
                    streamingState.streamingTargets.has(stableId)
                  const forceActionsVisible =
                    typeof lastAssistantIndex === 'number' &&
                    realIndex === lastAssistantIndex
                  const wrapperRef =
                    realIndex === lastUserIndex ? lastUserRef : undefined
                  const wrapperClassName = cn(
                    getMessageSpacingClass(displayMessages, realIndex),
                    realIndex === lastUserIndex ? 'scroll-mt-0' : '',
                  )
                  const wrapperScrollMarginTop =
                    realIndex === lastUserIndex ? headerHeight : undefined
                  const hasToolCalls =
                    chatMessage.role === 'assistant' &&
                    getToolCallsFromMessage(chatMessage).length > 0
                  return (
                    <MessageItem
                      key={stableId}
                      message={chatMessage}
                      toolResultsByCallId={
                        hasToolCalls ? toolResultsByCallId : undefined
                      }
                      forceActionsVisible={forceActionsVisible}
                      wrapperRef={wrapperRef}
                      wrapperClassName={wrapperClassName}
                      wrapperScrollMarginTop={wrapperScrollMarginTop}
                      isStreaming={messageIsStreaming}
                      streamingText={messageIsStreaming ? streamingText : undefined}
                      streamingThinking={
                        messageIsStreaming ? streamingThinking : undefined
                      }
                      simulateStreaming={simulateStreaming}
                      streamingKey={signature}
                    />
                  )
                })}
              {showTypingIndicator ? (
                <div className="py-2">
                  <TypingIndicator />
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            {shouldVirtualize && virtualRange.topSpacerHeight > 0 ? (
              <div
                aria-hidden="true"
                style={{ height: `${virtualRange.topSpacerHeight}px` }}
              />
            ) : null}
            {displayMessages
              .slice(virtualRange.startIndex, virtualRange.endIndex)
              .map((chatMessage, index) =>
                renderMessage(chatMessage, virtualRange.startIndex + index),
              )}
            {shouldVirtualize && virtualRange.bottomSpacerHeight > 0 ? (
              <div
                aria-hidden="true"
                style={{ height: `${virtualRange.bottomSpacerHeight}px` }}
              />
            ) : null}
          </>
        )}
        {notice && noticePosition === 'end' ? notice : null}
        <ChatContainerScrollAnchor ref={anchorRef} />
      </ChatContainerContent>
    </ChatContainerRoot>
  )
}

function getMessageSpacingClass(
  messages: Array<GatewayMessage>,
  index: number,
): string {
  if (index === 0) return 'mt-0'
  const currentRole = messages[index]?.role ?? 'assistant'
  const previousRole = messages[index - 1]?.role ?? 'assistant'
  if (currentRole === previousRole) {
    return 'mt-3'
  }
  if (currentRole === 'assistant') {
    return 'mt-4 pt-1'
  }
  return 'mt-4'
}

function getStableMessageId(message: GatewayMessage, index: number): string {
  if (message.__optimisticId) return message.__optimisticId

  const idCandidates = ['id', 'messageId', 'uuid', 'clientId'] as const
  for (const key of idCandidates) {
    const value = (message as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }

  const timestamp = getRawMessageTimestamp(message)
  if (timestamp) {
    return `${message.role ?? 'assistant'}-${timestamp}-${index}`
  }

  return `${message.role ?? 'assistant'}-${index}`
}

function getRawMessageTimestamp(message: GatewayMessage): number | null {
  const candidates = [
    (message as any).createdAt,
    (message as any).created_at,
    (message as any).timestamp,
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
  return null
}

function areChatMessageListEqual(
  prev: ChatMessageListProps,
  next: ChatMessageListProps,
) {
  return (
    prev.messages === next.messages &&
    prev.loading === next.loading &&
    prev.empty === next.empty &&
    prev.emptyState === next.emptyState &&
    prev.notice === next.notice &&
    prev.noticePosition === next.noticePosition &&
    prev.waitingForResponse === next.waitingForResponse &&
    prev.sessionKey === next.sessionKey &&
    prev.pinToTop === next.pinToTop &&
    prev.pinGroupMinHeight === next.pinGroupMinHeight &&
    prev.headerHeight === next.headerHeight &&
    prev.contentStyle === next.contentStyle &&
    prev.streamingMessageId === next.streamingMessageId &&
    prev.streamingText === next.streamingText &&
    prev.streamingThinking === next.streamingThinking &&
    prev.isStreaming === next.isStreaming
  )
}

const MemoizedChatMessageList = memo(
  ChatMessageListComponent,
  areChatMessageListEqual,
)

export { MemoizedChatMessageList as ChatMessageList }
