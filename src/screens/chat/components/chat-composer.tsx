import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  FlashIcon,
  GlobeIcon,
  Mic01Icon,
  SourceCodeIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { Ref } from 'react'

import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/prompt-kit/prompt-input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ChatComposerAttachment = {
  id: string
  name: string
  contentType: string
  size: number
  dataUrl: string
  previewUrl: string
}

type ChatComposerProps = {
  onSubmit: (
    value: string,
    attachments: Array<ChatComposerAttachment>,
    helpers: ChatComposerHelpers,
  ) => void
  isLoading: boolean
  disabled: boolean
  wrapperRef?: Ref<HTMLDivElement>
  composerRef?: Ref<ChatComposerHandle>
  focusKey?: string
}

type ChatComposerHelpers = {
  reset: () => void
  setValue: (value: string) => void
  setAttachments: (attachments: Array<ChatComposerAttachment>) => void
}

type ChatComposerHandle = {
  setValue: (value: string) => void
  insertText: (value: string) => void
}

const MODEL_STORAGE_KEY = 'openclaw-studio-selected-model'
const AVAILABLE_MODELS = [
  'sonnet 4.5',
  'opus 4.6',
  'gpt-5-codex',
  'kimi k2.5',
  'gemini 2.5 flash',
] as const

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB'] as const
  let value = size
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const precision = value >= 100 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(precision)} ${units[unitIndex]}`
}

function hasImageData(dt: DataTransfer | null): boolean {
  if (!dt) return false
  const items = Array.from(dt.items)
  if (items.some((item) => item.kind === 'file' && item.type.startsWith('image/')))
    return true
  const files = Array.from(dt.files)
  return files.some((file) => file.type.startsWith('image/'))
}

async function readFileAsDataUrl(file: File): Promise<string | null> {
  return await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

function ChatComposerComponent({
  onSubmit,
  isLoading,
  disabled,
  wrapperRef,
  composerRef,
  focusKey,
}: ChatComposerProps) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<
    Array<ChatComposerAttachment>
  >([])
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [focusAfterSubmitTick, setFocusAfterSubmitTick] = useState(0)
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window === 'undefined') return AVAILABLE_MODELS[0]
    const stored = window.localStorage.getItem(MODEL_STORAGE_KEY)
    if (stored && AVAILABLE_MODELS.includes(stored as (typeof AVAILABLE_MODELS)[number])) {
      return stored
    }
    return AVAILABLE_MODELS[0]
  })
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const dragCounterRef = useRef(0)
  const shouldRefocusAfterSendRef = useRef(false)
  const modelSelectorRef = useRef<HTMLDivElement | null>(null)
  const isModelSwitcherDisabled = true
  const isVoiceInputDisabled = true

  const focusPrompt = useCallback(() => {
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      promptRef.current?.focus()
    })
  }, [])

  const resetDragState = useCallback(() => {
    dragCounterRef.current = 0
    setIsDraggingOver(false)
  }, [])

  useLayoutEffect(() => {
    focusPrompt()
  }, [focusPrompt])

  useLayoutEffect(() => {
    if (disabled) return
    if (!shouldRefocusAfterSendRef.current) return
    shouldRefocusAfterSendRef.current = false
    focusPrompt()
  }, [disabled, focusPrompt])

  useLayoutEffect(() => {
    if (focusAfterSubmitTick === 0) return
    focusPrompt()
  }, [focusAfterSubmitTick, focusPrompt])

  useLayoutEffect(() => {
    if (disabled) return
    focusPrompt()
  }, [disabled, focusKey, focusPrompt])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(MODEL_STORAGE_KEY, selectedModel)
  }, [selectedModel])

  useEffect(() => {
    if (!isModelMenuOpen) return
    function handleOutsideClick(event: MouseEvent) {
      if (!modelSelectorRef.current) return
      if (modelSelectorRef.current.contains(event.target as Node)) return
      setIsModelMenuOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isModelMenuOpen])

  const reset = useCallback(() => {
    setValue('')
    setAttachments([])
    resetDragState()
    focusPrompt()
  }, [focusPrompt, resetDragState])

  const setComposerValue = useCallback(
    (nextValue: string) => {
      setValue(nextValue)
      focusPrompt()
    },
    [focusPrompt],
  )

  const setComposerAttachments = useCallback(
    (nextAttachments: Array<ChatComposerAttachment>) => {
      setAttachments(nextAttachments)
      focusPrompt()
    },
    [focusPrompt],
  )

  const insertText = useCallback(
    (text: string) => {
      setValue((prev) => (prev.trim().length > 0 ? `${prev}\n${text}` : text))
      focusPrompt()
    },
    [focusPrompt],
  )

  useImperativeHandle(
    composerRef,
    () => ({ setValue: setComposerValue, insertText }),
    [insertText, setComposerValue],
  )

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
  }, [])

  const addAttachments = useCallback(
    async (files: Array<File>) => {
      if (disabled) return
      const imageFiles = files.filter((file) => file.type.startsWith('image/'))
      if (imageFiles.length === 0) return

      const timestamp = Date.now()
      const prepared = await Promise.all(
        imageFiles.map(async (file, index): Promise<ChatComposerAttachment | null> => {
          const dataUrl = await readFileAsDataUrl(file)
          if (!dataUrl) return null
          const name = file.name && file.name.trim().length > 0
            ? file.name.trim()
            : `pasted-image-${timestamp}-${index + 1}.png`
          return {
            id: crypto.randomUUID(),
            name,
            contentType: file.type || 'image/png',
            size: file.size,
            dataUrl,
            previewUrl: dataUrl,
          }
        }),
      )

      const valid = prepared.filter(
        (attachment): attachment is ChatComposerAttachment => attachment !== null,
      )

      if (valid.length === 0) return

      setAttachments((prev) => [...prev, ...valid])
      focusPrompt()
    },
    [disabled, focusPrompt],
  )

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (disabled) return
      const items = Array.from(event.clipboardData.items)
      const files: Array<File> = []
      for (const item of items) {
        if (item.kind !== 'file') continue
        const file = item.getAsFile()
        if (file && file.type.startsWith('image/')) {
          files.push(file)
        }
      }
      if (files.length === 0) return

      const text = event.clipboardData.getData('text/plain')
      if (text.trim().length === 0) {
        event.preventDefault()
      }
      void addAttachments(files)
    },
    [addAttachments, disabled],
  )

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return
      if (!hasImageData(event.dataTransfer)) return
      event.preventDefault()
      dragCounterRef.current += 1
      setIsDraggingOver(true)
      event.dataTransfer.dropEffect = 'copy'
    },
    [disabled],
  )

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return
      if (event.currentTarget.contains(event.relatedTarget as Node)) return
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
      if (dragCounterRef.current === 0) {
        setIsDraggingOver(false)
      }
    },
    [disabled],
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return
      event.preventDefault()
      if (hasImageData(event.dataTransfer)) {
        event.dataTransfer.dropEffect = 'copy'
      }
    },
    [disabled],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return
      event.preventDefault()
      const files = Array.from(event.dataTransfer.files)
      resetDragState()
      if (files.length === 0) return
      void addAttachments(files)
    },
    [addAttachments, disabled, resetDragState],
  )

  const handleSubmit = useCallback(() => {
    if (disabled) return
    const body = value.trim()
    if (body.length === 0 && attachments.length === 0) return
    const attachmentPayload = attachments.map((attachment) => ({
      ...attachment,
    }))
    onSubmit(body, attachmentPayload, {
      reset,
      setValue: setComposerValue,
      setAttachments: setComposerAttachments,
    })
    shouldRefocusAfterSendRef.current = true
    setFocusAfterSubmitTick((prev) => prev + 1)
    focusPrompt()
  }, [attachments, disabled, focusPrompt, onSubmit, reset, setComposerAttachments, setComposerValue, value])

  const submitDisabled =
    disabled || (value.trim().length === 0 && attachments.length === 0)

  return (
    <div
      className="sticky bottom-0 z-30 mx-auto w-full max-w-full bg-surface/95 px-5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 backdrop-blur sm:max-w-[768px] sm:min-w-[400px]"
      ref={wrapperRef}
    >
      <PromptInput
        value={value}
        onValueChange={setValue}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        disabled={disabled}
        className={cn(
          'relative transition-colors duration-150',
          isDraggingOver &&
            'outline-primary-500 ring-2 ring-primary-300 bg-primary-50/80',
        )}
        onPaste={handlePaste}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDraggingOver ? (
          <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-[18px] border-2 border-dashed border-primary-400 bg-primary-50/90 text-sm font-medium text-primary-700">
            Drop images to attach
          </div>
        ) : null}

        {attachments.length > 0 ? (
          <div className="px-3">
            <div className="flex flex-wrap gap-3">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="group relative w-28"
                >
                  <div className="aspect-square overflow-hidden rounded-xl border border-primary-200 bg-primary-50">
                    <img
                      src={attachment.previewUrl}
                      alt={attachment.name || 'Attached image'}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Remove image attachment"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      handleRemoveAttachment(attachment.id)
                    }}
                    className="absolute right-1 top-1 z-10 inline-flex size-6 items-center justify-center rounded-full bg-primary-900/80 text-primary-50 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={20} strokeWidth={1.5} />
                  </button>
                  <div className="mt-1 truncate text-xs font-medium text-primary-700">
                    {attachment.name}
                  </div>
                  <div className="text-[11px] text-primary-400">
                    {formatFileSize(attachment.size)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <PromptInputTextarea
          placeholder="Ask anything..."
          autoFocus
          inputRef={promptRef}
        />
        <PromptInputActions className="justify-between px-3">
          <div className="flex items-center gap-1">
            <PromptInputAction tooltip="Add attachment">
              <Button
                size="icon-sm"
                variant="ghost"
                className="rounded-lg text-primary-500 hover:bg-primary-100 hover:text-primary-500"
                aria-label="Add attachment"
              >
                <HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={1.5} />
              </Button>
            </PromptInputAction>
            <PromptInputAction tooltip="Web Search">
              <Button
                size="icon-sm"
                variant="ghost"
                className="rounded-lg text-primary-500 hover:bg-primary-100 hover:text-primary-500"
                aria-label="Web Search"
              >
                <HugeiconsIcon icon={GlobeIcon} size={20} strokeWidth={1.5} />
              </Button>
            </PromptInputAction>
            <PromptInputAction tooltip="Quick Commands">
              <Button
                size="icon-sm"
                variant="ghost"
                className="rounded-lg text-primary-500 hover:bg-primary-100 hover:text-primary-500"
                aria-label="Quick Commands"
              >
                <HugeiconsIcon icon={FlashIcon} size={20} strokeWidth={1.5} />
              </Button>
            </PromptInputAction>
            <PromptInputAction tooltip="Code">
              <Button
                size="icon-sm"
                variant="ghost"
                className="rounded-lg text-primary-500 hover:bg-primary-100 hover:text-primary-500"
                aria-label="Code"
              >
                <HugeiconsIcon icon={SourceCodeIcon} size={20} strokeWidth={1.5} />
              </Button>
            </PromptInputAction>
            <div className="relative ml-1 flex items-center gap-2" ref={modelSelectorRef}>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  if (isModelSwitcherDisabled) return
                  setIsModelMenuOpen((prev) => !prev)
                }}
                className={cn(
                  'inline-flex h-8 items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-3 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100',
                  isModelSwitcherDisabled && 'cursor-not-allowed opacity-50',
                )}
                aria-haspopup="listbox"
                aria-expanded={!isModelSwitcherDisabled && isModelMenuOpen}
                aria-disabled={isModelSwitcherDisabled}
                disabled={isModelSwitcherDisabled}
                title={isModelSwitcherDisabled ? 'Not wired yet' : undefined}
              >
                <span className="max-w-[10rem] truncate">{selectedModel}</span>
                <HugeiconsIcon icon={ArrowDown01Icon} size={20} strokeWidth={1.5} />
              </button>
              {isModelSwitcherDisabled ? (
                <span className="text-xs text-primary-500 text-pretty">Not wired yet</span>
              ) : null}
              {!isModelSwitcherDisabled && isModelMenuOpen ? (
                <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-40 min-w-[12rem] rounded-xl border border-primary-200 bg-surface p-1 shadow-lg">
                  {AVAILABLE_MODELS.map((model) => (
                    <button
                      key={model}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedModel(model)
                        setIsModelMenuOpen(false)
                      }}
                      className={cn(
                        'flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm text-primary-700 transition-colors hover:bg-primary-100',
                        model === selectedModel && 'bg-primary-100 text-primary-900',
                      )}
                      role="option"
                      aria-selected={model === selectedModel}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <PromptInputAction tooltip="Coming Soon">
              <Button
                size="icon-sm"
                variant="ghost"
                className={cn(
                  'rounded-lg text-primary-500 hover:bg-primary-100 hover:text-primary-500',
                  isVoiceInputDisabled && 'cursor-not-allowed opacity-50',
                )}
                aria-label="Voice input"
                aria-disabled={isVoiceInputDisabled}
                disabled={isVoiceInputDisabled}
              >
                <HugeiconsIcon icon={Mic01Icon} size={20} strokeWidth={1.5} />
              </Button>
            </PromptInputAction>
            <PromptInputAction tooltip="Send message">
              <Button
                onClick={handleSubmit}
                disabled={submitDisabled}
                size="icon-sm"
                className="rounded-full"
                aria-label="Send message"
              >
                <HugeiconsIcon icon={ArrowUp02Icon} size={20} strokeWidth={1.5} />
              </Button>
            </PromptInputAction>
          </div>
        </PromptInputActions>
      </PromptInput>
    </div>
  )
}

const MemoizedChatComposer = memo(ChatComposerComponent)

export { MemoizedChatComposer as ChatComposer }
export type { ChatComposerAttachment, ChatComposerHelpers, ChatComposerHandle }
