import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Robot01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
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
import { BrailleSpinner } from '@/components/ui/braille-spinner'
import { cn } from '@/lib/utils'

const VIRTUAL_ROW_HEIGHT = 136
const VIRTUAL_OVERSCAN = 8
const NEAR_BOTTOM_THRESHOLD = 200

type MessageSearchMatch = {
  stableId: string
  messageIndex: number
}

function escapeAttributeSelector(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }

  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

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
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const prevSessionKeyRef = useRef<string | undefined>(sessionKey)
  const stickToBottomRef = useRef(true)
  const messageSignatureRef = useRef<Map<string, string>>(new Map())
  const initialRenderRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  const isNearBottomRef = useRef(true)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [expandAllToolSections, setExpandAllToolSections] = useState(false)
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false)
  const [messageSearchValue, setMessageSearchValue] = useState('')
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0)
  const [scrollMetrics] = useState({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
  })

  // Simple scroll handler — only tracks if user is near bottom via refs (no state updates)
  const handleUserScroll = useCallback(function handleUserScroll(metrics: {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
  }) {
    const distanceFromBottom =
      metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight
    const nearBottom = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD
    const wasScrollingUp = metrics.scrollTop < lastScrollTopRef.current - 5
    lastScrollTopRef.current = metrics.scrollTop

    if (wasScrollingUp && !nearBottom) {
      stickToBottomRef.current = false
      isNearBottomRef.current = false
    } else if (nearBottom) {
      stickToBottomRef.current = true
      isNearBottomRef.current = true
    }
  }, [])

  // Simple scroll to bottom — find viewport and scroll
  const scrollToBottom = useCallback(function scrollToBottom(behavior: ScrollBehavior = 'auto') {
    const anchor = anchorRef.current
    if (!anchor) return
    const viewport = anchor.closest('[data-chat-scroll-viewport]') as HTMLElement | null
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior })
    }
  }, [])

  // Filter out toolResult messages - they'll be displayed inside their associated tool calls
  const displayMessages = useMemo(() => {
    const filteredMessages = messages.filter((msg) => {
      if (msg.role === 'toolResult') return false

      const cleanedText = textFromMessage(msg).trim()

      if (msg.role === 'assistant') {
        return cleanedText !== 'HEARTBEAT_OK'
      }

      if (msg.role === 'user') {
        const rawText = (Array.isArray(msg.content) ? msg.content : [])
          .map((part) => (part.type === 'text' ? String(part.text ?? '') : ''))
          .join('')
          .trim()

        // Hide metadata-only user messages after cleanup.
        if (cleanedText.length === 0) return false

        const isSystemPrefixed = /^System:/i.test(rawText)
        if (!isSystemPrefixed) return true

        const normalizedText = cleanedText.toLowerCase()
        const containsSystemFailure =
          normalizedText.includes('exec failed') ||
          normalizedText.includes('gatewayrestart') ||
          normalizedText.includes('signal sigkill')
        const matchesHeartbeatPrompt =
          /read heartbeat\.md if it exists.*?reply heartbeat_ok\./is.test(
            cleanedText,
          )

        if (containsSystemFailure || matchesHeartbeatPrompt) return false
      }

      return true
    })

    const seenUserFingerprints = new Map<string, number>()
    return filteredMessages.filter((message) => {
      if (message.role !== 'user') return true

      const trimmedText = textFromMessage(message).trim()
      if (trimmedText.length === 0) return true

      const fingerprint = `${message.role}:${trimmedText}`
      const timestamp = getMessageTimestamp(message)
      const previousTimestamp = seenUserFingerprints.get(fingerprint)
      if (
        typeof previousTimestamp === 'number' &&
        Math.abs(timestamp - previousTimestamp) <= 5000
      ) {
        return false
      }

      seenUserFingerprints.set(fingerprint, timestamp)
      return true
    })
  }, [messages])

  const normalizedMessageSearch = useMemo(function getNormalizedMessageSearch() {
    return messageSearchValue.trim().toLocaleLowerCase()
  }, [messageSearchValue])

  const isMessageSearchActive =
    isMessageSearchOpen && normalizedMessageSearch.length > 0

  const messageSearchMatches = useMemo<Array<MessageSearchMatch>>(
    function getMessageSearchMatches() {
      if (!isMessageSearchActive) return []

      const matches: Array<MessageSearchMatch> = []
      for (const [index, message] of displayMessages.entries()) {
        const messageText = textFromMessage(message).trim().toLocaleLowerCase()
        if (!messageText.includes(normalizedMessageSearch)) continue
        matches.push({
          stableId: getStableMessageId(message, index),
          messageIndex: index,
        })
      }
      return matches
    },
    [displayMessages, isMessageSearchActive, normalizedMessageSearch],
  )

  const messageSearchMatchIndexById = useMemo(
    function getMessageSearchMatchIndexById() {
      const indexById = new Map<string, number>()
      for (const [index, match] of messageSearchMatches.entries()) {
        indexById.set(match.stableId, index)
      }
      return indexById
    },
    [messageSearchMatches],
  )

  const activeSearchMatch = messageSearchMatches[activeSearchMatchIndex] ?? null

  const focusSearchInput = useCallback(function focusSearchInput() {
    window.requestAnimationFrame(function focusSearchInputField() {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [])

  const closeMessageSearch = useCallback(function closeMessageSearch() {
    setIsMessageSearchOpen(false)
  }, [])

  const openMessageSearch = useCallback(function openMessageSearch() {
    setIsMessageSearchOpen(true)
    setActiveSearchMatchIndex(0)
    focusSearchInput()
  }, [focusSearchInput])

  const jumpToPreviousMatch = useCallback(function jumpToPreviousMatch() {
    if (messageSearchMatches.length === 0) return
    setActiveSearchMatchIndex(function setPreviousMatchIndex(currentIndex) {
      return (
        (currentIndex - 1 + messageSearchMatches.length) %
        messageSearchMatches.length
      )
    })
  }, [messageSearchMatches.length])

  const jumpToNextMatch = useCallback(function jumpToNextMatch() {
    if (messageSearchMatches.length === 0) return
    setActiveSearchMatchIndex(function setNextMatchIndex(currentIndex) {
      return (currentIndex + 1) % messageSearchMatches.length
    })
  }, [messageSearchMatches.length])

  const scrollToMessageById = useCallback(function scrollToMessageById(
    messageId: string,
    behavior: ScrollBehavior = 'smooth',
  ) {
    const anchor = anchorRef.current
    if (!anchor) return

    const viewport = anchor.closest(
      '[data-chat-scroll-viewport]',
    ) as HTMLElement | null
    if (!viewport) return

    const escapedMessageId = escapeAttributeSelector(messageId)
    const selector = `[data-chat-message-id="${escapedMessageId}"]`
    const target = viewport.querySelector(selector) as HTMLElement | null
    if (!target) return

    stickToBottomRef.current = false
    isNearBottomRef.current = false
    setIsNearBottom(false)
    target.scrollIntoView({ behavior, block: 'center', inline: 'nearest' })
  }, [])

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

  const hasUserVisibleTextMessages = useMemo(() => {
    return displayMessages.some((message) => {
      const role = message.role || 'assistant'
      if (role !== 'user' && role !== 'assistant') return false
      return textFromMessage(message).trim().length > 0
    })
  }, [displayMessages])

  const toolInteractionCount = useMemo(() => {
    const seenToolCallIds = new Set<string>()
    let count = 0

    for (const message of messages) {
      const toolCalls = getToolCallsFromMessage(message)
      for (const toolCall of toolCalls) {
        const toolCallId = (toolCall.id || '').trim()
        if (toolCallId.length > 0) {
          if (seenToolCallIds.has(toolCallId)) continue
          seenToolCallIds.add(toolCallId)
        }
        count += 1
      }

      if (message.role !== 'toolResult') continue
      const toolCallId = (message.toolCallId || '').trim()
      if (toolCallId.length > 0 && seenToolCallIds.has(toolCallId)) continue
      if (toolCallId.length > 0) {
        seenToolCallIds.add(toolCallId)
      }
      count += 1
    }

    return count
  }, [messages])

  const showToolOnlyNotice =
    !loading &&
    !empty &&
    displayMessages.length > 0 &&
    !hasUserVisibleTextMessages &&
    toolInteractionCount > 0

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
  // Show typing indicator when waiting for response and no streaming text visible
  // Show typing indicator when waiting for response and no real assistant text visible yet
  const showTypingIndicator = (() => {
    if (!waitingForResponse) return false
    // If streaming has visible text, don't show dots
    if (isStreaming && streamingText && streamingText.length > 0) return false
    // Check if any recent assistant message (after last user message) has real content
    if (typeof lastUserIndex === 'number' && typeof lastAssistantIndex === 'number' && lastAssistantIndex > lastUserIndex) {
      const msg = displayMessages[lastAssistantIndex]
      if (msg && !msg.__optimisticId?.startsWith('streaming-') && !msg.__streamingStatus) {
        // Real assistant message with content exists
        const text = typeof msg.content === 'string' ? msg.content : ''
        if (text.length > 0) return false
        // Check array content
        if (Array.isArray(msg.content)) {
          const hasContent = msg.content.some((c: any) =>
            (typeof c === 'string' && c.length > 0) ||
            (c && typeof c === 'object' && c.type === 'text' && c.text?.length > 0)
          )
          if (hasContent) return false
        }
      }
    }
    return true
  })()

  // Pin the last user+assistant group without adding bottom padding.
  const groupStartIndex = typeof lastUserIndex === 'number' ? lastUserIndex : -1
  const hasGroup = pinToTop && groupStartIndex >= 0
  const shouldVirtualize = false // Disabled — causes scroll glitches

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
    const spacingClass = cn(
      getMessageSpacingClass(displayMessages, realIndex),
      getToolGroupClass(displayMessages, realIndex),
    )
    const forceActionsVisible =
      typeof lastAssistantIndex === 'number' && realIndex === lastAssistantIndex
    const hasToolCalls =
      chatMessage.role === 'assistant' &&
      getToolCallsFromMessage(chatMessage).length > 0

    const searchMatchIndex = messageSearchMatchIndexById.get(stableId)
    const isSearchMatch = typeof searchMatchIndex === 'number'
    const isActiveMatch = isSearchMatch && searchMatchIndex === activeSearchMatchIndex

    return (
      <MessageItem
        key={stableId}
        message={chatMessage}
        toolResultsByCallId={hasToolCalls ? toolResultsByCallId : undefined}
        forceActionsVisible={forceActionsVisible}
        wrapperClassName={spacingClass}
        wrapperDataMessageId={stableId}
        bubbleClassName={
          isActiveMatch
            ? 'ring-2 ring-amber-400 bg-amber-50/50'
            : isSearchMatch
              ? 'bg-amber-50/30'
              : undefined
        }
        isStreaming={messageIsStreaming}
        streamingText={messageIsStreaming ? streamingText : undefined}
        streamingThinking={messageIsStreaming ? streamingThinking : undefined}
        simulateStreaming={simulateStreaming}
        streamingKey={signature}
        expandAllToolSections={expandAllToolSections}
      />
    )
  }

  // Sync near-bottom ref to state every 500ms for button visibility
  useEffect(() => {
    const timer = window.setInterval(() => {
      setIsNearBottom(prev => {
        const current = isNearBottomRef.current
        return prev === current ? prev : current
      })
    }, 500)
    return () => window.clearInterval(timer)
  }, [])

  // Simple: scroll to bottom when messages change and we should stick
  useEffect(() => {
    if (loading) return
    let frameId: number | null = null
    const sessionChanged = prevSessionKeyRef.current !== sessionKey
    prevSessionKeyRef.current = sessionKey

    // Always scroll on session change
    if (sessionChanged) {
      stickToBottomRef.current = true
      // Use requestAnimationFrame to ensure DOM has updated
      frameId = window.requestAnimationFrame(() => scrollToBottom('auto'))
      return () => {
        if (frameId !== null) window.cancelAnimationFrame(frameId)
      }
    }

    // Scroll to bottom if sticking
    if (stickToBottomRef.current) {
      frameId = window.requestAnimationFrame(() => scrollToBottom('auto'))
    }

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
    }
  }, [loading, displayMessages.length, sessionKey, scrollToBottom])

  useEffect(() => {
    setExpandAllToolSections(false)
  }, [sessionKey])

  useEffect(() => {
    if (!isMessageSearchOpen) return

    function handleSearchShortcuts(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return
      if (event.altKey) return

      const hasCommand = event.metaKey || event.ctrlKey
      if (hasCommand && !event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        event.stopPropagation()
        openMessageSearch()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeMessageSearch()
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        if (event.shiftKey) {
          jumpToPreviousMatch()
          return
        }
        jumpToNextMatch()
        return
      }

      const isInputFocused = document.activeElement === searchInputRef.current
      if (!isInputFocused) return

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        jumpToPreviousMatch()
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        event.stopPropagation()
        jumpToNextMatch()
      }
    }

    window.addEventListener('keydown', handleSearchShortcuts, true)
    return () => {
      window.removeEventListener('keydown', handleSearchShortcuts, true)
    }
  }, [
    closeMessageSearch,
    isMessageSearchOpen,
    jumpToNextMatch,
    jumpToPreviousMatch,
    openMessageSearch,
  ])

  useEffect(() => {
    function handleOpenSearchShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return
      if (event.altKey || event.shiftKey) return
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== 'f') return

      event.preventDefault()
      event.stopPropagation()
      openMessageSearch()
    }

    window.addEventListener('keydown', handleOpenSearchShortcut, true)
    return () => {
      window.removeEventListener('keydown', handleOpenSearchShortcut, true)
    }
  }, [openMessageSearch])

  useEffect(() => {
    if (!isMessageSearchActive) {
      setActiveSearchMatchIndex(0)
      return
    }

    setActiveSearchMatchIndex(function clampActiveMatchIndex(currentIndex) {
      if (messageSearchMatches.length === 0) return 0
      return Math.min(currentIndex, messageSearchMatches.length - 1)
    })
  }, [isMessageSearchActive, messageSearchMatches.length])

  useEffect(() => {
    if (!activeSearchMatch) return

    const frameId = window.requestAnimationFrame(function scrollToActiveMatch() {
      scrollToMessageById(activeSearchMatch.stableId, 'smooth')
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [activeSearchMatch, scrollToMessageById])

  const handleScrollToBottom = useCallback(function handleScrollToBottom() {
    stickToBottomRef.current = true
    isNearBottomRef.current = true
    setIsNearBottom(true)
    setUnreadCount(0)
    scrollToBottom('smooth')
  }, [scrollToBottom])

  const scrollToBottomOverlay = useMemo(() => {
    const isVisible = !isNearBottom && displayMessages.length > 0
    return (
      <div
        className="pointer-events-none absolute left-1/2 z-40 -translate-x-1/2"
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

  return (
    // mt-2 is to fix the prompt-input cut off
    <ChatContainerRoot
      className="flex-1 min-h-0"
      stickToBottom={stickToBottomRef.current}
      onUserScroll={handleUserScroll}
      overlay={scrollToBottomOverlay}
    >
      {isMessageSearchOpen && (
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-primary-200 bg-primary-50/95 px-3 py-2 backdrop-blur-sm">
          <input
            ref={searchInputRef}
            type="text"
            value={messageSearchValue}
            onChange={(e) => setMessageSearchValue(e.target.value)}
            placeholder="Search messages..."
            className="min-w-0 flex-1 rounded-md border border-primary-200 bg-white px-2.5 py-1.5 text-sm text-primary-900 outline-none placeholder:text-primary-400 focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
          />
          {isMessageSearchActive && (
            <span className="shrink-0 text-xs text-primary-500">
              {messageSearchMatches.length > 0
                ? `${activeSearchMatchIndex + 1} of ${messageSearchMatches.length}`
                : 'No matches'}
            </span>
          )}
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={jumpToPreviousMatch}
              disabled={messageSearchMatches.length === 0}
              className="rounded p-1 text-primary-500 hover:bg-primary-200 hover:text-primary-700 disabled:opacity-30"
              aria-label="Previous match"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button
              type="button"
              onClick={jumpToNextMatch}
              disabled={messageSearchMatches.length === 0}
              className="rounded p-1 text-primary-500 hover:bg-primary-200 hover:text-primary-700 disabled:opacity-30"
              aria-label="Next match"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button
              type="button"
              onClick={closeMessageSearch}
              className="rounded p-1 text-primary-500 hover:bg-primary-200 hover:text-primary-700"
              aria-label="Close search"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>
      )}
      <ChatContainerContent className="pt-6" style={contentStyle}>
        {notice && noticePosition === 'start' ? notice : null}
        {showToolOnlyNotice ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <HugeiconsIcon
                  icon={Robot01Icon}
                  size={20}
                  strokeWidth={1.5}
                  className="mt-0.5 shrink-0 text-amber-600"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-800 text-balance">
                    This session contains{' '}
                    <span className="tabular-nums">{toolInteractionCount}</span>{' '}
                    tool interactions
                  </p>
                  <p className="mt-1 text-sm text-amber-700 text-pretty">
                    Most content is AI agent tool usage (file reads, code
                    execution, etc.)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandAllToolSections(true)}
                disabled={expandAllToolSections}
                className={cn(
                  'shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  expandAllToolSections
                    ? 'border-amber-300 bg-amber-100 text-amber-700'
                    : 'border-amber-300 bg-amber-100/80 text-amber-800 hover:bg-amber-200',
                )}
              >
                Show All
              </button>
            </div>
          </div>
        ) : null}
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
                    getToolGroupClass(displayMessages, realIndex),
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
                      expandAllToolSections={expandAllToolSections}
                    />
                  )
                })}
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
        {showTypingIndicator ? (
          <div className="flex items-center gap-2 py-2 px-1">
            <BrailleSpinner preset="claw" size={20} speed={120} className="text-primary-500" />
            <span className="text-xs text-primary-400 animate-pulse">Thinking…</span>
          </div>
        ) : null}
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
    return 'mt-1.5'
  }
  if (currentRole === 'assistant') {
    return 'mt-2.5'
  }
  return 'mt-2.5'
}

function getToolGroupClass(
  messages: Array<GatewayMessage>,
  index: number,
): string {
  const message = messages[index]
  if (!message || message.role !== 'assistant') return ''
  const hasToolCalls = getToolCallsFromMessage(message).length > 0
  if (!hasToolCalls) return ''

  let previousUserIndex = -1
  for (let i = index - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      previousUserIndex = i
      break
    }
  }

  let nextUserIndex = -1
  for (let i = index + 1; i < messages.length; i += 1) {
    if (messages[i]?.role === 'user') {
      nextUserIndex = i
      break
    }
  }

  if (previousUserIndex === -1 || nextUserIndex === -1) return ''
  return 'border-l border-primary-200/70 pl-3'
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
