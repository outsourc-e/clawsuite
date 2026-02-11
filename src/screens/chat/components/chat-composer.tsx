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
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
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
import { fetchModels, switchModel } from '@/lib/gateway-api'
import type {
  GatewayModelCatalogEntry,
  GatewayModelSwitchResponse,
} from '@/lib/gateway-api'
import { usePinnedModels } from '@/hooks/use-pinned-models'
// import { ModeSelector } from '@/components/mode-selector'
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
  sessionKey?: string
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

type ModelOption = {
  value: string
  label: string
  provider: string
}

type SessionStatusApiResponse = {
  ok?: boolean
  payload?: unknown
  error?: string
  [key: string]: unknown
}

type ModelSwitchNotice = {
  tone: 'success' | 'error'
  message: string
  retryModel?: string
}

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

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readModelFromStatusPayload(payload: unknown): string {
  if (!isRecord(payload)) return ''

  const directCandidates = [
    payload.model,
    payload.currentModel,
    payload.modelAlias,
  ]
  for (const candidate of directCandidates) {
    const text = readText(candidate)
    if (text) return text
  }

  if (isRecord(payload.resolved)) {
    const provider = readText(payload.resolved.modelProvider)
    const model = readText(payload.resolved.model)
    if (provider && model) return `${provider}/${model}`
    if (model) return model
  }

  const nestedCandidates = [payload.status, payload.session, payload.payload]
  for (const nested of nestedCandidates) {
    const nestedModel = readModelFromStatusPayload(nested)
    if (nestedModel) return nestedModel
  }

  return ''
}

function toModelOption(entry: GatewayModelCatalogEntry): ModelOption | null {
  if (typeof entry === 'string') {
    const value = entry.trim()
    if (!value) return null
    return { value, label: value, provider: 'unknown' }
  }

  const alias = readText(entry.alias)
  const provider = readText(entry.provider)
  const _model = readText(entry.model)
  const id = readText(entry.id)
  
  if (!provider || !id) return null

  // Gateway expects provider/model format for sessions.patch
  // Always prepend provider — even if id contains "/" (e.g., openrouter models
  // have ids like "google/gemini-2.5-flash" but need "openrouter/google/gemini-2.5-flash")
  const value = `${provider}/${id}`
  
  const display =
    readText(entry.label) ||
    readText(entry.displayName) ||
    readText(entry.name) ||
    alias ||
    id

  return { value, label: display || value, provider }
}

function isSameModel(option: ModelOption, currentModel: string): boolean {
  const normalizedCurrent = currentModel.trim().toLowerCase()
  if (!normalizedCurrent) return false
  return (
    option.value.trim().toLowerCase() === normalizedCurrent ||
    option.label.trim().toLowerCase() === normalizedCurrent
  )
}

function isTimeoutErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('timed out') ||
    normalized.includes('timeout')
  )
}

async function readResponseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as Record<string, unknown>
    if (typeof payload.error === 'string') return payload.error
    if (typeof payload.message === 'string') return payload.message
    return JSON.stringify(payload)
  } catch {
    const text = await response.text().catch(() => '')
    return text || response.statusText || 'Request failed'
  }
}

async function fetchCurrentModelFromStatus(): Promise<string> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 7000)

  try {
    const response = await fetch('/api/session-status', {
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(await readResponseError(response))
    }

    const payload = (await response.json()) as SessionStatusApiResponse
    if (payload.ok === false) {
      throw new Error(readText(payload.error) || 'Gateway unavailable')
    }

    return readModelFromStatusPayload(payload.payload ?? payload)
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw new Error('Request timed out')
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

function ChatComposerComponent({
  onSubmit,
  isLoading,
  disabled,
  sessionKey,
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
  const [modelNotice, setModelNotice] = useState<ModelSwitchNotice | null>(null)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const dragCounterRef = useRef(0)
  const shouldRefocusAfterSendRef = useRef(false)
  const modelSelectorRef = useRef<HTMLDivElement | null>(null)
  const isVoiceInputDisabled = true
  const isSupplementalActionDisabled = true
  
  // Phase 4.2: Pinned models
  const { pinned, togglePin, isPinned } = usePinnedModels()
  
  const modelsQuery = useQuery({
    queryKey: ['gateway', 'models'],
    queryFn: fetchModels,
    refetchInterval: 60_000,
    retry: false,
  })
  const currentModelQuery = useQuery({
    queryKey: ['gateway', 'session-status-model'],
    queryFn: fetchCurrentModelFromStatus,
    refetchInterval: 30_000,
    retry: false,
  })

  const modelOptions = useMemo(function buildModelOptions(): Array<ModelOption> {
    const rows = Array.isArray(modelsQuery.data?.models)
      ? modelsQuery.data.models
      : []
    const seen = new Set<string>()
    const options: Array<ModelOption> = []
    for (const row of rows) {
      const option = toModelOption(row)
      if (!option) continue
      if (seen.has(option.value)) continue
      seen.add(option.value)
      options.push(option)
    }
    return options
  }, [modelsQuery.data?.models])

  const groupedModels = useMemo(function groupModelsByProvider() {
    const groups = new Map<string, Array<ModelOption>>()
    for (const option of modelOptions) {
      const existing = groups.get(option.provider) ?? []
      existing.push(option)
      groups.set(option.provider, existing)
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [modelOptions])

  // Phase 4.2: Split pinned and unpinned models
  const availableModelIds = useMemo(() => {
    return new Set(modelOptions.map((opt) => opt.value))
  }, [modelOptions])

  const pinnedModels = useMemo(() => {
    return modelOptions.filter((option) => isPinned(option.value))
  }, [modelOptions, pinned])

  const unavailablePinnedModels = useMemo(() => {
    return pinned.filter((modelId) => !availableModelIds.has(modelId))
  }, [pinned, availableModelIds])

  const unpinnedGroupedModels = useMemo(() => {
    const groups = new Map<string, Array<ModelOption>>()
    for (const option of modelOptions) {
      if (isPinned(option.value)) continue // Skip pinned models
      const existing = groups.get(option.provider) ?? []
      existing.push(option)
      groups.set(option.provider, existing)
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [modelOptions, pinned])

  const modelSwitchMutation = useMutation({
    mutationFn: async function switchGatewayModel(payload: {
      model: string
      sessionKey?: string
    }) {
      return await switchModel(payload.model, payload.sessionKey)
    },
    onSuccess: function onSuccess(
      payload: GatewayModelSwitchResponse,
      variables,
    ) {
      const provider = readText(payload.resolved?.modelProvider)
      const model = readText(payload.resolved?.model)
      const resolvedModel =
        provider && model ? `${provider}/${model}` : model || variables.model
      setModelNotice({
        tone: 'success',
        message: `Model switched to ${resolvedModel}`,
      })
      setIsModelMenuOpen(false)
      void currentModelQuery.refetch()
    },
    onError: function onError(error, variables) {
      const message = error instanceof Error ? error.message : String(error)
      if (isTimeoutErrorMessage(message)) {
        setModelNotice({
          tone: 'error',
          message: 'Request timed out',
          retryModel: variables.model,
        })
        return
      }
      setModelNotice({
        tone: 'error',
        message: message || 'Failed to switch model',
      })
    },
  })

  const handleModelSelect = useCallback(
    function handleModelSelect(nextModel: string) {
      const model = nextModel.trim()
      if (!model) return
      const normalizedSessionKey =
        typeof sessionKey === 'string' && sessionKey.trim().length > 0
          ? sessionKey.trim()
          : undefined
      setModelNotice(null)
      modelSwitchMutation.mutate({
        model,
        sessionKey: normalizedSessionKey,
      })
    },
    [modelSwitchMutation, sessionKey],
  )

  const retryModel = modelNotice?.retryModel ?? ''
  const handleRetryModelSwitch = useCallback(
    function handleRetryModelSwitch() {
      if (!retryModel) return
      handleModelSelect(retryModel)
    },
    [handleModelSelect, retryModel],
  )

  const gatewayDisconnected = modelsQuery.isError
  const noModelsAvailable = modelsQuery.isSuccess && modelOptions.length === 0
  const isModelSwitcherDisabled =
    disabled ||
    modelsQuery.isLoading ||
    gatewayDisconnected ||
    noModelsAvailable ||
    modelSwitchMutation.isPending
  const currentModel = currentModelQuery.data ?? ''
  const modelButtonLabel =
    currentModel ||
    (currentModelQuery.isLoading ? 'Loading model…' : 'Select model')
  const modelAvailabilityLabel = gatewayDisconnected
    ? 'Gateway disconnected'
    : noModelsAvailable
      ? 'No models available'
      : null

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
    // Only focus on focusKey change (session switch), not on every disabled toggle
    focusPrompt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey])

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

  const handleOpenAttachmentPicker = useCallback(
    function handleOpenAttachmentPicker(
      event: React.MouseEvent<HTMLButtonElement>,
    ) {
      event.preventDefault()
      if (disabled) return
      attachmentInputRef.current?.click()
    },
    [disabled],
  )

  const handleAttachmentInputChange = useCallback(
    function handleAttachmentInputChange(
      event: React.ChangeEvent<HTMLInputElement>,
    ) {
      const files = Array.from(event.target.files ?? [])
      event.target.value = ''
      if (files.length === 0) return
      void addAttachments(files)
    },
    [addAttachments],
  )

  return (
    <div
      className="sticky bottom-0 z-30 mx-auto w-full bg-surface/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 backdrop-blur sm:px-5"
      style={{ maxWidth: 'min(768px, 100%)' }}
      ref={wrapperRef}
    >
      <input
        ref={attachmentInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleAttachmentInputChange}
      />
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
                disabled={disabled}
                onClick={handleOpenAttachmentPicker}
              >
                <HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={1.5} />
              </Button>
            </PromptInputAction>
            <PromptInputAction tooltip="Unavailable">
              <Button
                size="icon-sm"
                variant="ghost"
                className={cn(
                  'rounded-lg text-primary-500 hover:bg-primary-100 hover:text-primary-500',
                  isSupplementalActionDisabled && 'cursor-not-allowed opacity-50',
                )}
                aria-label="Web Search"
                aria-disabled={isSupplementalActionDisabled}
                disabled={isSupplementalActionDisabled}
              >
                <HugeiconsIcon icon={GlobeIcon} size={20} strokeWidth={1.5} />
              </Button>
            </PromptInputAction>
            <PromptInputAction tooltip="Unavailable">
              <Button
                size="icon-sm"
                variant="ghost"
                className={cn(
                  'rounded-lg text-primary-500 hover:bg-primary-100 hover:text-primary-500',
                  isSupplementalActionDisabled && 'cursor-not-allowed opacity-50',
                )}
                aria-label="Quick Commands"
                aria-disabled={isSupplementalActionDisabled}
                disabled={isSupplementalActionDisabled}
              >
                <HugeiconsIcon icon={FlashIcon} size={20} strokeWidth={1.5} />
              </Button>
            </PromptInputAction>
            <PromptInputAction tooltip="Unavailable">
              <Button
                size="icon-sm"
                variant="ghost"
                className={cn(
                  'rounded-lg text-primary-500 hover:bg-primary-100 hover:text-primary-500',
                  isSupplementalActionDisabled && 'cursor-not-allowed opacity-50',
                )}
                aria-label="Code"
                aria-disabled={isSupplementalActionDisabled}
                disabled={isSupplementalActionDisabled}
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
                title={modelAvailabilityLabel ?? undefined}
              >
                <span className="max-w-[10rem] truncate">{modelButtonLabel}</span>
                <HugeiconsIcon icon={ArrowDown01Icon} size={20} strokeWidth={1.5} />
              </button>
              {modelAvailabilityLabel ? (
                <span className="text-xs text-primary-500 text-pretty">
                  {modelAvailabilityLabel}
                </span>
              ) : null}
              {modelNotice ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-xs text-pretty',
                    modelNotice.tone === 'error'
                      ? 'text-primary-700'
                      : 'text-primary-500',
                  )}
                >
                  {modelNotice.message}
                  {retryModel ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleRetryModelSwitch()
                      }}
                      className={cn(
                        'rounded px-1 font-medium text-primary-700 hover:bg-primary-100',
                        modelSwitchMutation.isPending && 'cursor-not-allowed opacity-60',
                      )}
                      disabled={modelSwitchMutation.isPending}
                    >
                      Retry
                    </button>
                  ) : null}
                </span>
              ) : null}
              {!isModelSwitcherDisabled && isModelMenuOpen ? (
                <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-40 min-w-[16rem] max-w-[24rem] rounded-xl border border-primary-200 bg-surface shadow-lg">
                  {groupedModels.length === 0 ? (
                    <div className="p-4 text-center text-sm text-primary-500">
                      No models available.{' '}
                      <a
                        href="https://docs.openclaw.ai/configuration"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-700 underline hover:text-primary-900"
                      >
                        Configure providers
                      </a>
                    </div>
                  ) : (
                    <div className="max-h-[20rem] overflow-y-auto p-1">
                      {/* Phase 4.2: Pinned models section */}
                      {(pinnedModels.length > 0 || unavailablePinnedModels.length > 0) && (
                        <div className="mb-2">
                          <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-primary-500">
                            📌 Pinned
                          </div>
                          {pinnedModels.map((option) => {
                            const optionActive = isSameModel(option, currentModel)
                            return (
                              <div key={option.value} className="group relative flex items-center">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setIsModelMenuOpen(false)
                                    handleModelSelect(option.value)
                                  }}
                                  className={cn(
                                    'flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-primary-700 transition-colors hover:bg-primary-100',
                                    optionActive && 'bg-primary-100 text-primary-900',
                                  )}
                                  role="option"
                                  aria-selected={optionActive}
                                  aria-label={`Select ${option.label}`}
                                >
                                  <span className="flex-1 truncate">{option.label}</span>
                                  {optionActive && (
                                    <span className="text-primary-900" aria-label="Currently active">
                                      ✓
                                    </span>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    togglePin(option.value)
                                  }}
                                  className="absolute right-2 rounded px-1 text-base leading-none opacity-100 transition-opacity hover:bg-primary-200 focus:outline-none focus:ring-2 focus:ring-primary-400"
                                  aria-label={`Unpin ${option.label}`}
                                  title="Unpin"
                                >
                                  ⭐
                                </button>
                              </div>
                            )
                          })}
                          {/* Unavailable pinned models */}
                          {unavailablePinnedModels.map((modelId) => (
                            <div key={modelId} className="group relative flex items-center">
                              <div className="flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-primary-400 opacity-60">
                                <span className="flex-1 truncate">{modelId}</span>
                                <span className="text-xs text-red-600">Unavailable</span>
                              </div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  togglePin(modelId)
                                }}
                                className="absolute right-2 rounded px-2 py-0.5 text-xs text-red-600 opacity-100 transition-opacity hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400"
                                aria-label={`Remove unavailable pinned model ${modelId}`}
                                title="Remove"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Regular models grouped by provider */}
                      {unpinnedGroupedModels.map(([provider, models]) => (
                        <div key={provider} className="mb-2 last:mb-0">
                          <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-primary-500">
                            {provider}
                          </div>
                          {models.map((option) => {
                            const optionActive = isSameModel(option, currentModel)
                            return (
                              <div key={option.value} className="group relative flex items-center">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setIsModelMenuOpen(false)
                                    handleModelSelect(option.value)
                                  }}
                                  className={cn(
                                    'flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-primary-700 transition-colors hover:bg-primary-100',
                                    optionActive && 'bg-primary-100 text-primary-900',
                                  )}
                                  role="option"
                                  aria-selected={optionActive}
                                  aria-label={`Select ${option.label}`}
                                >
                                  <span className="flex-1 truncate">{option.label}</span>
                                  {optionActive && (
                                    <span className="text-primary-900" aria-label="Currently active">
                                      ✓
                                    </span>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    togglePin(option.value)
                                  }}
                                  className="absolute right-2 rounded px-1 text-base leading-none opacity-0 transition-opacity hover:bg-primary-200 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:opacity-100 group-hover:opacity-100"
                                  aria-label={`Pin ${option.label}`}
                                  title="Pin"
                                >
                                  ☆
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            {/* ModeSelector disabled — needs UX refinement
            <ModeSelector
              currentModel={currentModel}
              onModelSwitch={handleModelSelect}
              disabled={disabled || isLoading}
              availableModels={modelOptions.map(m => m.value)}
              isStreaming={isLoading}
            />
            */}
          </div>
          <div className="flex items-center gap-1">
            <PromptInputAction tooltip="Voice input unavailable">
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
