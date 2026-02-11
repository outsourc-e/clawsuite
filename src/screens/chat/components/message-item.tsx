import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown01Icon,
  Wrench01Icon,
  Idea01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  getMessageTimestamp,
  getToolCallsFromMessage,
  textFromMessage,
} from '../utils'
import { MessageActionsBar } from './message-actions-bar'
import type {
  GatewayAttachment,
  GatewayMessage,
  ToolCallContent,
} from '../types'
import type { ToolPart } from '@/components/prompt-kit/tool'
import { Message, MessageContent } from '@/components/prompt-kit/message'
import { Tool } from '@/components/prompt-kit/tool'
import { LoadingIndicator } from '@/components/loading-indicator'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

// Streaming cursor component
function StreamingCursor() {
  return <LoadingIndicator ariaLabel="Assistant is streaming" />
}

type MessageItemProps = {
  message: GatewayMessage
  toolResultsByCallId?: Map<string, GatewayMessage>
  forceActionsVisible?: boolean
  wrapperRef?: React.RefObject<HTMLDivElement | null>
  wrapperClassName?: string
  wrapperScrollMarginTop?: number
  isStreaming?: boolean
  streamingText?: string
  streamingThinking?: string
  simulateStreaming?: boolean
  streamingKey?: string | null
  expandAllToolSections?: boolean
}

function mapToolCallToToolPart(
  toolCall: ToolCallContent,
  resultMessage: GatewayMessage | undefined,
): ToolPart {
  const hasResult = resultMessage !== undefined
  const isError = resultMessage?.isError ?? false

  let state: ToolPart['state']
  if (!hasResult) {
    state = 'input-available'
  } else if (isError) {
    state = 'output-error'
  } else {
    state = 'output-available'
  }

  // Extract error text from result message content
  let errorText: string | undefined
  if (isError && resultMessage?.content?.[0]?.type === 'text') {
    errorText = resultMessage.content[0].text || 'Unknown error'
  }

  return {
    type: toolCall.name || 'unknown',
    state,
    input: toolCall.arguments,
    output: resultMessage?.details,
    toolCallId: toolCall.id,
    errorText,
  }
}

function toolCallsSignature(message: GatewayMessage): string {
  const toolCalls = getToolCallsFromMessage(message)
  return toolCalls
    .map((toolCall) => {
      const id = toolCall.id ?? ''
      const name = toolCall.name ?? ''
      const partialJson = toolCall.partialJson ?? ''
      const args = toolCall.arguments ? JSON.stringify(toolCall.arguments) : ''
      return `${id}|${name}|${partialJson}|${args}`
    })
    .join('||')
}

function toolResultSignature(result: GatewayMessage | undefined): string {
  if (!result) return 'missing'
  const content = Array.isArray(result.content) ? result.content : []
  const text = content
    .map((part) => (part.type === 'text' ? String(part.text ?? '') : ''))
    .join('')
    .trim()
  const details = result.details ? JSON.stringify(result.details) : ''
  return `${result.toolCallId ?? ''}|${result.toolName ?? ''}|${result.isError ? '1' : '0'}|${text}|${details}`
}

function toolResultsSignature(
  message: GatewayMessage,
  toolResultsByCallId: Map<string, GatewayMessage> | undefined,
): string {
  if (!toolResultsByCallId) return ''
  const toolCalls = getToolCallsFromMessage(message)
  if (toolCalls.length === 0) return ''
  return toolCalls
    .map((toolCall) => {
      if (!toolCall.id) return 'missing'
      return toolResultSignature(toolResultsByCallId.get(toolCall.id))
    })
    .join('||')
}

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 1_000_000_000_000) return value * 1000
    return value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return null
}

function rawTimestamp(message: GatewayMessage): number | null {
  const candidates = [
    (message as any).createdAt,
    (message as any).created_at,
    (message as any).timestamp,
    (message as any).time,
    (message as any).ts,
  ]
  for (const candidate of candidates) {
    const normalized = normalizeTimestamp(candidate)
    if (normalized) return normalized
  }
  return null
}

function thinkingFromMessage(msg: GatewayMessage): string | null {
  const parts = Array.isArray(msg.content) ? msg.content : []
  const thinkingPart = parts.find((part) => part.type === 'thinking')
  if (thinkingPart && 'thinking' in thinkingPart) {
    return String(thinkingPart.thinking ?? '')
  }
  return null
}

function summarizeToolNames(toolCalls: Array<ToolCallContent>): string {
  const seen = new Set<string>()
  const uniqueNames: Array<string> = []
  for (const toolCall of toolCalls) {
    const normalized = (toolCall.name || '').trim()
    const name = normalized.length > 0 ? normalized : 'unknown'
    if (seen.has(name)) continue
    seen.add(name)
    uniqueNames.push(name)
  }
  if (uniqueNames.length === 0) return 'tools'
  if (uniqueNames.length <= 3) return uniqueNames.join(', ')
  return `${uniqueNames.slice(0, 3).join(', ')} +${uniqueNames.length - 3} more`
}

function attachmentSource(attachment: GatewayAttachment | undefined): string {
  if (!attachment) return ''
  const candidates = [attachment.previewUrl, attachment.dataUrl, attachment.url]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate
    }
  }
  return ''
}

function MessageItemComponent({
  message,
  toolResultsByCallId,
  forceActionsVisible = false,
  wrapperRef,
  wrapperClassName,
  wrapperScrollMarginTop,
  isStreaming = false,
  streamingText,
  streamingThinking,
  simulateStreaming = false,
  streamingKey,
  expandAllToolSections = false,
}: MessageItemProps) {
  const role = message.role || 'assistant'

  const messageStreamingStatus = message.__streamingStatus
  const messageStreamingText =
    typeof message.__streamingText === 'string'
      ? message.__streamingText
      : undefined
  const messageStreamingThinking =
    typeof message.__streamingThinking === 'string'
      ? message.__streamingThinking
      : undefined
  const remoteStreamingText =
    streamingText !== undefined ? streamingText : messageStreamingText
  const remoteStreamingThinking =
    streamingThinking !== undefined
      ? streamingThinking
      : messageStreamingThinking
  const remoteStreamingActive =
    isStreaming || messageStreamingStatus === 'streaming'

  const fullText = useMemo(() => textFromMessage(message), [message])
  const [displayText, setDisplayText] = useState(() =>
    remoteStreamingActive ? remoteStreamingText ?? fullText : fullText,
  )
  const [isLocalStreaming, setIsLocalStreaming] = useState(false)
  const animationKeyRef = useRef<string | null>(null)
  const animationTimeoutRef = useRef<number | null>(null)
  const animationIndexRef = useRef(0)

  const shouldFakeStream =
    Boolean(simulateStreaming && !remoteStreamingActive && fullText.length > 0)

  useEffect(() => {
    if (remoteStreamingActive) {
      setIsLocalStreaming(false)
      animationKeyRef.current = null
      if (animationTimeoutRef.current) {
        window.clearTimeout(animationTimeoutRef.current)
        animationTimeoutRef.current = null
      }
      setDisplayText(remoteStreamingText ?? fullText)
      return
    }

    if (!shouldFakeStream) {
      setDisplayText((current) =>
        current === fullText ? current : fullText,
      )
      setIsLocalStreaming(false)
      animationKeyRef.current = null
      if (animationTimeoutRef.current) {
        window.clearTimeout(animationTimeoutRef.current)
        animationTimeoutRef.current = null
      }
    }
  }, [remoteStreamingActive, remoteStreamingText, fullText, shouldFakeStream])

  useEffect(() => {
    if (!shouldFakeStream) {
      return
    }

    const key = streamingKey ?? `${fullText.length}:${fullText.slice(-24)}`
    if (animationKeyRef.current === key) {
      return
    }
    animationKeyRef.current = key

    if (animationTimeoutRef.current) {
      window.clearTimeout(animationTimeoutRef.current)
      animationTimeoutRef.current = null
    }

    animationIndexRef.current = 0
    setIsLocalStreaming(true)
    setDisplayText('')

    if (fullText.length === 0) {
      setIsLocalStreaming(false)
      return
    }

    const targetDuration = Math.min(4200, Math.max(900, fullText.length * 26))
    const stepDelay = 18
    const totalSteps = Math.max(1, Math.round(targetDuration / stepDelay))
    const chunkSize = Math.max(1, Math.ceil(fullText.length / totalSteps))

    const tick = () => {
      const nextIndex = Math.min(
        fullText.length,
        animationIndexRef.current + chunkSize,
      )
      animationIndexRef.current = nextIndex
      setDisplayText(fullText.slice(0, nextIndex))

      if (nextIndex >= fullText.length) {
        setIsLocalStreaming(false)
        animationTimeoutRef.current = null
        return
      }

      animationTimeoutRef.current = window.setTimeout(tick, stepDelay)
    }

    animationTimeoutRef.current = window.setTimeout(tick, stepDelay)

    return () => {
      if (animationTimeoutRef.current) {
        window.clearTimeout(animationTimeoutRef.current)
        animationTimeoutRef.current = null
      }
    }
  }, [shouldFakeStream, streamingKey, fullText])

  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        window.clearTimeout(animationTimeoutRef.current)
      }
    }
  }, [])

  const effectiveIsStreaming =
    remoteStreamingActive || isLocalStreaming

  const thinking =
    remoteStreamingActive && remoteStreamingThinking !== undefined
      ? remoteStreamingThinking
      : thinkingFromMessage(message)
  const isUser = role === 'user'
  const timestamp = getMessageTimestamp(message)
  const attachments = Array.isArray(message.attachments)
    ? (message.attachments).filter(
        (attachment) => attachmentSource(attachment).length > 0,
      )
    : []
  const hasAttachments = attachments.length > 0
  const hasText = displayText.length > 0 || effectiveIsStreaming

  // Get tool calls from this message (for assistant messages)
  const toolCalls = role === 'assistant' ? getToolCallsFromMessage(message) : []
  const hasToolCalls = toolCalls.length > 0
  const toolParts = useMemo(() => {
    return toolCalls.map((toolCall) => {
      const resultMessage = toolCall.id
        ? toolResultsByCallId?.get(toolCall.id)
        : undefined
      return mapToolCallToToolPart(toolCall, resultMessage)
    })
  }, [toolCalls, toolResultsByCallId])
  const toolSummary = useMemo(() => {
    if (!hasToolCalls) return ''
    const count = toolCalls.length
    const toolLabel = count === 1 ? 'tool' : 'tools'
    return `Used: ${summarizeToolNames(toolCalls)} (${count} ${toolLabel})`
  }, [hasToolCalls, toolCalls])
  const hasToolErrors = useMemo(
    () => toolParts.some((toolPart) => toolPart.state === 'output-error'),
    [toolParts],
  )
  const [toolCallsOpen, setToolCallsOpen] = useState(false)

  useEffect(() => {
    if (expandAllToolSections) {
      setToolCallsOpen(true)
    }
  }, [expandAllToolSections])

  return (
    <div
      ref={wrapperRef}
      data-chat-message-role={role}
      style={
        typeof wrapperScrollMarginTop === 'number'
          ? { scrollMarginTop: `${wrapperScrollMarginTop}px` }
          : undefined
      }
      className={cn(
        'group flex flex-col gap-1',
        wrapperClassName,
        isUser ? 'items-end' : 'items-start',
      )}
    >
      {thinking && (
        <div className="w-full max-w-[900px]">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="w-fit">
              <HugeiconsIcon
                icon={Idea01Icon}
                size={20}
                strokeWidth={1.5}
                className="opacity-70"
              />
              <span>💭 Thinking...</span>
              {effectiveIsStreaming ? (
                <LoadingIndicator ariaLabel="Assistant thinking" />
              ) : null}
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={20}
                strokeWidth={1.5}
                className="opacity-60 transition-transform duration-150 group-data-panel-open:rotate-180"
              />
            </CollapsibleTrigger>
            <CollapsiblePanel>
              <div className="rounded-md border border-primary-200 bg-primary-50 p-3">
                <p className="text-sm text-primary-700 whitespace-pre-wrap text-pretty">
                  {thinking}
                </p>
              </div>
            </CollapsiblePanel>
          </Collapsible>
        </div>
      )}
      {(hasText || hasAttachments) && (
        <Message className={cn(isUser ? 'flex-row-reverse' : '')}>
          <div
            data-chat-message-bubble={isUser ? 'true' : undefined}
            className={cn(
              'rounded-[12px] break-words whitespace-normal min-w-0 text-primary-900 flex flex-col gap-2',
              effectiveIsStreaming && !isUser ? 'chat-streaming-message' : '',
              !isUser
                ? 'bg-transparent w-full'
                : 'bg-primary-100 max-w-[75%] rounded-2xl px-4 py-2.5',
            )}
          >
            {hasAttachments && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachmentSource(attachment)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg border border-primary-200 hover:border-primary-400 transition-colors"
                  >
                    <img
                      src={attachmentSource(attachment)}
                      alt={attachment.name || 'Attached image'}
                      className="max-h-48 max-w-full object-contain"
                    />
                  </a>
                ))}
              </div>
            )}
            {hasText &&
              (isUser ? (
                <span className="text-pretty">{displayText}</span>
              ) : (
                <div className="relative">
                  <MessageContent
                    markdown
                    className="text-primary-900 bg-transparent w-full text-pretty"
                  >
                    {displayText}
                  </MessageContent>
                  {effectiveIsStreaming && <StreamingCursor />}
                </div>
              ))}
            {effectiveIsStreaming && !hasText && (
              <div className="flex items-center gap-1.5 text-primary-500">
                <span className="animate-pulse">Lobster is thinking</span>
                <StreamingCursor />
              </div>
            )}
          </div>
        </Message>
      )}

      {/* Render tool calls - either expanded or as compact indicator */}
      {hasToolCalls && (
        <div className="w-full max-w-[900px] mt-2">
          <Collapsible open={toolCallsOpen} onOpenChange={setToolCallsOpen}>
            <CollapsibleTrigger className="w-full justify-between bg-primary-50/50 hover:bg-primary-100/80 data-panel-open:bg-primary-100/80">
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  hasToolErrors ? 'bg-red-500' : 'bg-emerald-500',
                )}
              />
              <HugeiconsIcon
                icon={Wrench01Icon}
                size={20}
                strokeWidth={1.5}
                className="opacity-70"
              />
              <span className="flex-1 truncate text-left">{toolSummary}</span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={20}
                strokeWidth={1.5}
                className="text-primary-700 transition-transform duration-150 group-data-panel-open:rotate-180"
              />
            </CollapsibleTrigger>
            <CollapsiblePanel>
              <div className="flex flex-col gap-3 border-l-2 border-primary-200 pl-2">
                {toolParts.map((toolPart, index) => (
                  <Tool
                    key={toolPart.toolCallId || `${toolPart.type}-${index}`}
                    toolPart={toolPart}
                    defaultOpen={false}
                  />
                ))}
              </div>
            </CollapsiblePanel>
          </Collapsible>
        </div>
      )}

      {!hasToolCalls && (
        <MessageActionsBar
          text={fullText}
          timestamp={timestamp}
          align={isUser ? 'end' : 'start'}
          forceVisible={forceActionsVisible}
        />
      )}
    </div>
  )
}

function areMessagesEqual(
  prevProps: MessageItemProps,
  nextProps: MessageItemProps,
): boolean {
  if (prevProps.forceActionsVisible !== nextProps.forceActionsVisible) {
    return false
  }
  if (prevProps.wrapperClassName !== nextProps.wrapperClassName) return false
  if (prevProps.wrapperRef !== nextProps.wrapperRef) return false
  if (prevProps.wrapperScrollMarginTop !== nextProps.wrapperScrollMarginTop) {
    return false
  }
  // Check streaming state
  if (prevProps.isStreaming !== nextProps.isStreaming) {
    return false
  }
  if (prevProps.streamingText !== nextProps.streamingText) {
    return false
  }
  if (prevProps.streamingThinking !== nextProps.streamingThinking) {
    return false
  }
  if (prevProps.simulateStreaming !== nextProps.simulateStreaming) {
    return false
  }
  if (prevProps.streamingKey !== nextProps.streamingKey) {
    return false
  }
  if (
    prevProps.expandAllToolSections !== nextProps.expandAllToolSections
  ) {
    return false
  }
  if (
    prevProps.message.__streamingStatus !==
    nextProps.message.__streamingStatus
  ) {
    return false
  }
  if (prevProps.message.__streamingText !== nextProps.message.__streamingText) {
    return false
  }
  if (
    prevProps.message.__streamingThinking !==
    nextProps.message.__streamingThinking
  ) {
    return false
  }
  if (
    (prevProps.message.role || 'assistant') !==
    (nextProps.message.role || 'assistant')
  ) {
    return false
  }
  if (
    textFromMessage(prevProps.message) !== textFromMessage(nextProps.message)
  ) {
    return false
  }
  if (
    thinkingFromMessage(prevProps.message) !==
    thinkingFromMessage(nextProps.message)
  ) {
    return false
  }
  if (
    toolCallsSignature(prevProps.message) !==
    toolCallsSignature(nextProps.message)
  ) {
    return false
  }
  if (
    toolResultsSignature(prevProps.message, prevProps.toolResultsByCallId) !==
    toolResultsSignature(nextProps.message, nextProps.toolResultsByCallId)
  ) {
    return false
  }
  if (rawTimestamp(prevProps.message) !== rawTimestamp(nextProps.message)) {
    return false
  }
  // Check attachments
  const prevAttachments = Array.isArray(prevProps.message.attachments)
    ? prevProps.message.attachments
    : []
  const nextAttachments = Array.isArray(nextProps.message.attachments)
    ? nextProps.message.attachments
    : []
  if (prevAttachments.length !== nextAttachments.length) {
    return false
  }
  // No need to check settings here as the hook will cause a re-render
  // and areMessagesEqual is for props only.
  // However, memo components with hooks will re-render if the hook state changes.
  return true
}

const MemoizedMessageItem = memo(MessageItemComponent, areMessagesEqual)

export { MemoizedMessageItem as MessageItem }
