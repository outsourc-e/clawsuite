import { createPortal } from 'react-dom'
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  Mic01Icon,
  PinIcon,
  StopIcon,
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
import type { CSSProperties, Ref } from 'react'

import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/prompt-kit/prompt-input'
import {
  SlashCommandMenu,
  type SlashCommandDefinition,
  type SlashCommandMenuHandle,
} from '@/components/slash-command-menu'
import { MOBILE_TAB_BAR_OFFSET } from '@/components/mobile-tab-bar'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { Button } from '@/components/ui/button'
import { fetchModels, setDefaultModel, switchModel } from '@/lib/gateway-api'
import type {
  GatewayModelCatalogEntry,
  GatewayModelSwitchResponse,
} from '@/lib/gateway-api'
import { usePinnedModels } from '@/hooks/use-pinned-models'
// import { ModeSelector } from '@/components/mode-selector'
import { cn } from '@/lib/utils'
import { useVoiceInput } from '@/hooks/use-voice-input'
import { useVoiceRecorder } from '@/hooks/use-voice-recorder'
import { toast } from '@/components/ui/toast'

type ChatComposerAttachment = {
  id: string
  name: string
  contentType: string
  size: number
  dataUrl?: string
  previewUrl?: string
  kind?: 'image' | 'file' | 'audio'
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

/** Maximum file size accepted from picker/drop before processing (50MB). */
const MAX_ATTACHMENT_FILE_SIZE = 50 * 1024 * 1024
/** Longest side target for resized images. */
const MAX_IMAGE_DIMENSION = 1920
/** Initial JPEG compression quality (0-1). */
const IMAGE_QUALITY = 0.85
/** Gateway-safe image attachment limit after processing (1MB). */
const MAX_TRANSPORT_IMAGE_SIZE = 1 * 1024 * 1024

const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
}

const TEXT_EXTENSION_TO_MIME: Record<string, string> = {
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  csv: 'text/csv',
  ts: 'text/plain',
  tsx: 'text/plain',
  js: 'text/plain',
  py: 'text/plain',
}

function normalizeMimeType(value: string): string {
  return value.trim().toLowerCase()
}

function isImageMimeType(value: string): boolean {
  const normalized = normalizeMimeType(value)
  return normalized.startsWith('image/')
}

function inferImageMimeTypeFromFileName(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim())
  if (!match?.[1]) return ''
  return IMAGE_EXTENSION_TO_MIME[match[1].toLowerCase()] || ''
}

function inferTextMimeTypeFromFileName(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim())
  if (!match?.[1]) return ''
  return TEXT_EXTENSION_TO_MIME[match[1].toLowerCase()] || ''
}

function isTextMimeType(value: string): boolean {
  const normalized = normalizeMimeType(value)
  return normalized.startsWith('text/') || normalized === 'application/json'
}

function isImageFile(file: File): boolean {
  if (isImageMimeType(file.type)) return true
  return inferImageMimeTypeFromFileName(file.name).length > 0
}

function isTextFile(file: File): boolean {
  if (isTextMimeType(file.type)) return true
  return inferTextMimeTypeFromFileName(file.name).length > 0
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

function hasAttachableData(dt: DataTransfer | null): boolean {
  if (!dt) return false
  const items = Array.from(dt.items)
  if (
    items.some(
      (item) =>
        item.kind === 'file' &&
        (isImageMimeType(item.type) || isTextMimeType(item.type) || item.type.trim().length === 0),
    )
  )
    return true
  const files = Array.from(dt.files)
  return files.some(
    (file) => isImageFile(file) || isTextFile(file) || file.type.trim().length === 0,
  )
}

function collectFilesFromDataTransfer(dt: DataTransfer | null): Array<File> {
  if (!dt) return []
  const files: Array<File> = []
  const seen = new Set<string>()

  const pushFile = (file: File | null) => {
    if (!file) return
    const key = `${file.name}:${file.size}:${file.lastModified}:${file.type}`
    if (seen.has(key)) return
    seen.add(key)
    files.push(file)
  }

  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue
    pushFile(item.getAsFile())
  }

  for (const file of Array.from(dt.files)) {
    pushFile(file)
  }

  return files
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

async function readFileAsText(file: File): Promise<string | null> {
  return await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsText(file)
  })
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isCanvasSupported(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('2d'))
  } catch {
    return false
  }
}

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',')
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl
  if (!base64) return 0
  const padding =
    base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

function readDataUrlMimeType(dataUrl: string): string | null {
  const match = /^data:([^;]+);base64,/.exec(dataUrl)
  return match?.[1]?.trim() || null
}

async function compressImageToDataUrl(file: File): Promise<string> {
  if (!isCanvasSupported()) {
    throw new Error('Image compression not available')
  }

  return await new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    const cleanup = () => URL.revokeObjectURL(objectUrl)

    image.onload = () => {
      try {
        let width = image.width
        let height = image.height

        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_IMAGE_DIMENSION) / width)
            width = MAX_IMAGE_DIMENSION
          } else {
            width = Math.round((width * MAX_IMAGE_DIMENSION) / height)
            height = MAX_IMAGE_DIMENSION
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) {
          cleanup()
          reject(new Error('Failed to get canvas context'))
          return
        }

        context.drawImage(image, 0, 0, width, height)

        let quality = IMAGE_QUALITY
        let dataUrl = canvas.toDataURL('image/jpeg', quality)
        let bytes = estimateDataUrlBytes(dataUrl)

        while (bytes > MAX_TRANSPORT_IMAGE_SIZE && quality > 0.4) {
          quality -= 0.08
          dataUrl = canvas.toDataURL('image/jpeg', quality)
          bytes = estimateDataUrlBytes(dataUrl)
        }

        cleanup()
        resolve(dataUrl)
      } catch (error) {
        cleanup()
        reject(error instanceof Error ? error : new Error('Compression failed'))
      }
    }

    image.onerror = () => {
      cleanup()
      reject(new Error('Failed to load image'))
    }

    image.src = objectUrl
  })
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

function normalizeDraftSessionKey(sessionKey?: string): string {
  if (typeof sessionKey !== 'string') return 'new'
  const normalized = sessionKey.trim()
  return normalized.length > 0 ? normalized : 'new'
}

function toDraftStorageKey(sessionKey?: string): string {
  return `clawsuite-draft-${normalizeDraftSessionKey(sessionKey)}`
}

function readSlashCommandQuery(inputValue: string): string | null {
  if (!inputValue.startsWith('/')) return null
  const newlineIndex = inputValue.indexOf('\n')
  const firstLine =
    newlineIndex === -1 ? inputValue : inputValue.slice(0, newlineIndex)
  if (/\s/.test(firstLine.slice(1))) return null
  return firstLine.slice(1)
}

function isSameModel(option: ModelOption, currentModel: string): boolean {
  const normalizedCurrent = currentModel.trim().toLowerCase()
  if (!normalizedCurrent) return false
  return (
    option.value.trim().toLowerCase() === normalizedCurrent ||
    option.label.trim().toLowerCase() === normalizedCurrent
  )
}

/** Shorten "anthropic/claude-opus-4-6" → "Claude Opus 4.6" */
function shortenModelName(raw: string): string {
  if (!raw) return ''
  let name = raw
  const prefixes = [
    'openrouter/anthropic/',
    'openrouter/google/',
    'openrouter/openai/',
    'openrouter/',
    'anthropic/',
    'openai/',
    'google-antigravity/',
    'minimax/',
    'moonshot/',
  ]
  for (const prefix of prefixes) {
    if (name.toLowerCase().startsWith(prefix)) {
      name = name.slice(prefix.length)
      break
    }
  }
  return name
    .replace(/-(\d)/g, ' $1')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bGpt\b/g, 'GPT')
}

function isTimeoutErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('timed out') || normalized.includes('timeout')
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

function focusPromptTarget(target: HTMLTextAreaElement | null) {
  if (!target) return
  try {
    target.focus({ preventScroll: true })
  } catch {
    target.focus()
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
  const mobileKeyboardInset = useWorkspaceStore((s) => s.mobileKeyboardInset)
  const mobileComposerFocused = useWorkspaceStore((s) => s.mobileComposerFocused)
  const setMobileKeyboardOpen = useWorkspaceStore((s) => s.setMobileKeyboardOpen)
  const setMobileKeyboardInset = useWorkspaceStore(
    (s) => s.setMobileKeyboardInset,
  )
  const setMobileComposerFocused = useWorkspaceStore(
    (s) => s.setMobileComposerFocused,
  )
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<Array<ChatComposerAttachment>>(
    [],
  )
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null)
  const [focusAfterSubmitTick, setFocusAfterSubmitTick] = useState(0)
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 767px)').matches
  })
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [isSlashMenuDismissed, setIsSlashMenuDismissed] = useState(false)
  const [modelNotice, setModelNotice] = useState<ModelSwitchNotice | null>(null)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const slashMenuRef = useRef<SlashCommandMenuHandle | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const dragCounterRef = useRef(0)
  const shouldRefocusAfterSendRef = useRef(false)
  const submittingRef = useRef(false)
  const modelSelectorRef = useRef<HTMLDivElement | null>(null)
  const composerWrapperRef = useRef<HTMLDivElement | null>(null)
  const focusFrameRef = useRef<number | null>(null)

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

  const modelOptions = useMemo(
    function buildModelOptions(): Array<ModelOption> {
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
    },
    [modelsQuery.data?.models],
  )

  const groupedModels = useMemo(
    function groupModelsByProvider() {
      const groups = new Map<string, Array<ModelOption>>()
      for (const option of modelOptions) {
        const existing = groups.get(option.provider) ?? []
        existing.push(option)
        groups.set(option.provider, existing)
      }
      return Array.from(groups.entries()).sort((a, b) =>
        a[0].localeCompare(b[0]),
      )
    },
    [modelOptions],
  )

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

  const defaultModelMutation = useMutation({
    mutationFn: async (model: string) => await setDefaultModel(model),
    onSuccess: (_payload, model) => {
      setModelNotice({
        tone: 'success',
        message: `Default model set to ${model}`,
      })
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error)
      setModelNotice({
        tone: 'error',
        message: message || 'Failed to set default model',
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

  const currentModel = currentModelQuery.data ?? ''

  const handleSetDefaultModel = useCallback(() => {
    const model = currentModel.trim()
    if (!model) return
    setModelNotice(null)
    defaultModelMutation.mutate(model)
  }, [currentModel, defaultModelMutation])

  const modelsUnavailable = modelsQuery.isError
  const isModelSwitcherDisabled =
    disabled || modelsQuery.isLoading || modelSwitchMutation.isPending
  const isDefaultModelDisabled =
    disabled || defaultModelMutation.isPending || currentModel.trim().length === 0
  const draftStorageKey = useMemo(
    () => toDraftStorageKey(sessionKey),
    [sessionKey],
  )
  const modelButtonLabel =
    shortenModelName(currentModel) ||
    (currentModelQuery.isLoading ? '…' : 'Model')
  // Don't show "Gateway disconnected" for models query failures - it's confusing
  // since the main gateway connection might be fine. Show a subtler message instead.
  const modelAvailabilityLabel = modelsUnavailable ? 'Click to configure' : null

  // Measure composer height and set CSS variable for scroll padding
  useLayoutEffect(() => {
    const wrapper = composerWrapperRef.current
    if (!wrapper) return

    const updateHeight = () => {
      const height = wrapper.offsetHeight
      if (height > 0) {
        document.documentElement.style.setProperty(
          '--chat-composer-height',
          `${height}px`,
        )
      }
    }

    updateHeight()

    // Use ResizeObserver to track height changes (e.g., when textarea grows)
    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(wrapper)

    return () => {
      resizeObserver.disconnect()
    }
  }, [attachments.length, value])

  const cancelFocusPromptFrame = useCallback(function cancelFocusPromptFrame() {
    if (focusFrameRef.current === null) return
    window.cancelAnimationFrame(focusFrameRef.current)
    focusFrameRef.current = null
  }, [])

  const focusPrompt = useCallback(
    function focusPrompt() {
      if (typeof window === 'undefined') return
      cancelFocusPromptFrame()
      focusFrameRef.current = window.requestAnimationFrame(
        function focusPromptInFrame() {
          focusFrameRef.current = null
          focusPromptTarget(promptRef.current)
        },
      )
    },
    [cancelFocusPromptFrame],
  )

  useEffect(
    function cleanupFocusPromptFrameOnUnmount() {
      return function cleanupFocusPromptFrame() {
        cancelFocusPromptFrame()
      }
    },
    [cancelFocusPromptFrame],
  )

  useEffect(
    function cleanupMobileComposerFocusOnUnmount() {
      return function cleanupMobileComposerFocus() {
        setMobileComposerFocused(false)
      }
    },
    [setMobileComposerFocused],
  )

  const resetDragState = useCallback(() => {
    dragCounterRef.current = 0
    setIsDraggingOver(false)
  }, [])

  useLayoutEffect(() => {
    if (isMobileViewport) return
    focusPrompt()
  }, [focusPrompt, isMobileViewport])

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
    if (isMobileViewport) return
    // Only focus on focusKey change (session switch), not on every disabled toggle
    focusPrompt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, isMobileViewport])

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 767px)')
    const updateIsMobile = () => setIsMobileViewport(media.matches)
    updateIsMobile()
    media.addEventListener('change', updateIsMobile)
    return () => media.removeEventListener('change', updateIsMobile)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedDraft = window.sessionStorage.getItem(draftStorageKey)
    setValue(savedDraft ?? '')
  }, [draftStorageKey])

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

  const persistDraft = useCallback(
    function persistDraft(nextValue: string) {
      if (typeof window === 'undefined') return
      if (nextValue.length === 0) {
        window.sessionStorage.removeItem(draftStorageKey)
        return
      }
      window.sessionStorage.setItem(draftStorageKey, nextValue)
    },
    [draftStorageKey],
  )

  const clearDraft = useCallback(
    function clearDraft() {
      if (typeof window === 'undefined') return
      window.sessionStorage.removeItem(draftStorageKey)
    },
    [draftStorageKey],
  )

  const handleValueChange = useCallback(
    function handleValueChange(nextValue: string) {
      setIsSlashMenuDismissed(false)
      setValue(nextValue)
      persistDraft(nextValue)
    },
    [persistDraft],
  )

  const reset = useCallback(() => {
    setIsSlashMenuDismissed(false)
    setValue('')
    clearDraft()
    setAttachments([])
    resetDragState()
    focusPrompt()
  }, [clearDraft, focusPrompt, resetDragState])

  const setComposerValue = useCallback(
    (nextValue: string) => {
      setIsSlashMenuDismissed(false)
      setValue(nextValue)
      persistDraft(nextValue)
      focusPrompt()
    },
    [focusPrompt, persistDraft],
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
      setIsSlashMenuDismissed(false)
      setValue((prev) => {
        const nextValue = prev.trim().length > 0 ? `${prev}\n${text}` : text
        persistDraft(nextValue)
        return nextValue
      })
      focusPrompt()
    },
    [focusPrompt, persistDraft],
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

      const timestamp = Date.now()
      const prepared = await Promise.all(
        files.map(async (file, index): Promise<ChatComposerAttachment | null> => {
          const imageFile = isImageFile(file)
          const textFile = isTextFile(file)
          if (!imageFile && !textFile && file.type.trim().length > 0) {
            return null
          }

          if (file.size > MAX_ATTACHMENT_FILE_SIZE) {
            toast(
              `“${file.name || 'file'}” is ${formatFileSize(file.size)}. Max upload input size is ${formatFileSize(MAX_ATTACHMENT_FILE_SIZE)}.`,
              { type: 'warning' },
            )
            return null
          }

          if (textFile) {
            const textContent = await readFileAsText(file)
            if (textContent === null) return null
            const name =
              file.name && file.name.trim().length > 0
                ? file.name.trim()
                : `pasted-text-${timestamp}-${index + 1}.txt`
            const textBytes = new TextEncoder().encode(textContent).length
            return {
              id: crypto.randomUUID(),
              name,
              contentType:
                (isTextMimeType(file.type) ? normalizeMimeType(file.type) : '') ||
                inferTextMimeTypeFromFileName(name) ||
                'text/plain',
              size: textBytes,
              dataUrl: textContent,
              kind: 'file',
            }
          }

          const compressedDataUrl = await compressImageToDataUrl(file).catch(() => null)
          const dataUrl = compressedDataUrl || (await readFileAsDataUrl(file))
          if (!dataUrl) return null

          const dataUrlMimeType = readDataUrlMimeType(dataUrl)
          if (!isImageMimeType(dataUrlMimeType || '')) {
            return null
          }

          const transportBytes = estimateDataUrlBytes(dataUrl)
          if (transportBytes > MAX_TRANSPORT_IMAGE_SIZE) {
            toast(
              `Image compressed to ${(transportBytes / (1024 * 1024)).toFixed(2)}mb — still over the 1mb limit. Try a smaller screenshot.`,
              { type: 'warning' },
            )
            return null
          }

          const name =
            file.name && file.name.trim().length > 0
              ? file.name.trim()
              : `pasted-image-${timestamp}-${index + 1}.jpg`
          const detectedMimeType =
            dataUrlMimeType ||
            (isImageMimeType(file.type) ? normalizeMimeType(file.type) : '') ||
            inferImageMimeTypeFromFileName(name) ||
            'image/jpeg'
          return {
            id: crypto.randomUUID(),
            name,
            contentType: detectedMimeType,
            size: transportBytes,
            dataUrl,
            previewUrl: dataUrl,
            kind: 'image',
          }
        }),
      )

      const valid = prepared.filter(
        (attachment): attachment is ChatComposerAttachment => attachment !== null,
      )

      const skippedCount = prepared.length - valid.length
      if (skippedCount > 0) {
        toast(
          skippedCount === 1
            ? '1 file could not be attached.'
            : `${skippedCount} files could not be attached.`,
          { type: 'warning' },
        )
      }

      if (valid.length === 0) return

      setAttachments((prev) => [...prev, ...valid])
      focusPrompt()
    },
    [disabled, focusPrompt],
  )

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (disabled) return
      const files = collectFilesFromDataTransfer(event.clipboardData)
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
      if (!hasAttachableData(event.dataTransfer)) return
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
      if (hasAttachableData(event.dataTransfer)) {
        event.dataTransfer.dropEffect = 'copy'
      }
    },
    [disabled],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return
      event.preventDefault()
      const files = collectFilesFromDataTransfer(event.dataTransfer)
      resetDragState()
      if (files.length === 0) return
      void addAttachments(files)
    },
    [addAttachments, disabled, resetDragState],
  )

  const handleSubmit = useCallback(() => {
    if (disabled) return
    if (submittingRef.current) return
    const body = value.trim()
    if (body.length === 0 && attachments.length === 0) return
    submittingRef.current = true
    const attachmentPayload = attachments.map((attachment) => ({
      ...attachment,
    }))
    try {
      onSubmit(body, attachmentPayload, {
        reset,
        setValue: setComposerValue,
        setAttachments: setComposerAttachments,
      })
    } finally {
      // Reset after a tick so rapid re-fires (double-click, Enter+form submit) are blocked
      setTimeout(() => {
        submittingRef.current = false
      }, 300)
    }
    clearDraft()
    shouldRefocusAfterSendRef.current = true
    setFocusAfterSubmitTick((prev) => prev + 1)
    focusPrompt()
  }, [
    attachments,
    clearDraft,
    disabled,
    focusPrompt,
    onSubmit,
    reset,
    setComposerAttachments,
    setComposerValue,
    value,
  ])

  // Cmd+Enter to send
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        if (document.activeElement === promptRef.current) {
          event.preventDefault()
          handleSubmit()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSubmit])

  // ⌘+Shift+M (Mac) / Ctrl+Shift+M (Win) to open model selector
  useEffect(() => {
    const handleModelShortcut = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'm'
      ) {
        event.preventDefault()
        event.stopPropagation()
        setIsModelMenuOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleModelShortcut, true)
    return () => window.removeEventListener('keydown', handleModelShortcut, true)
  }, [])

  const submitDisabled =
    disabled || (value.trim().length === 0 && attachments.length === 0)

  const hasDraft = value.trim().length > 0 || attachments.length > 0
  const promptPlaceholder = isMobileViewport
    ? 'Message...'
    : 'Ask anything... (↵ to send · ⇧↵ new line · ⌘⇧M switch model)'
  const slashCommandQuery = useMemo(() => readSlashCommandQuery(value), [value])
  const isSlashMenuOpen =
    slashCommandQuery !== null && !disabled && !isSlashMenuDismissed

  const handleClearDraft = useCallback(() => {
    reset()
  }, [reset])

  // Voice input (tap = speech-to-text)
  const voiceInput = useVoiceInput({
    onResult: useCallback(
      (text: string) => {
        if (!text.trim()) return
        setValue((prev) => {
          const next = prev.trim().length > 0 ? `${prev} ${text}` : text
          persistDraft(next)
          return next
        })
      },
      [persistDraft],
    ),
  })

  // Voice recorder (long-press = voice note)
  const voiceRecorder = useVoiceRecorder({
    onRecorded: useCallback(
      (blob: Blob, durationMs: number) => {
        const ext = blob.type.includes('webm') ? 'webm' : 'mp4'
        const name = `voice-note-${Date.now()}.${ext}`
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : ''
          if (!dataUrl) return
          const secs = Math.round(durationMs / 1000)
          setAttachments((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              name,
              contentType: blob.type || 'audio/webm',
              size: blob.size,
              dataUrl,
              previewUrl: '',
            },
          ])
          // Auto-add duration caption to message
          setValue((prev) => {
            const caption = `🎤 Voice note (${secs}s)`
            const next =
              prev.trim().length > 0 ? `${prev}\n${caption}` : caption
            persistDraft(next)
            return next
          })
        }
        reader.readAsDataURL(blob)
      },
      [persistDraft],
    ),
  })

  // Long-press detection for mic button
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPressRef = useRef(false)
  const handleMicPointerDown = useCallback(() => {
    isLongPressRef.current = false
    // Start long-press timer for voice note recording (only if not already doing voice-to-text)
    if (!voiceInput.isListening && !voiceRecorder.isRecording) {
      longPressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true
        voiceRecorder.start()
      }, 500)
    }
  }, [voiceRecorder, voiceInput.isListening])
  const handleMicPointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (isLongPressRef.current) {
      // Was a long press — stop voice note recording
      voiceRecorder.stop()
      isLongPressRef.current = false
    }
    // Short taps are handled by onClick for voice-to-text toggle
  }, [voiceRecorder])

  const handleAbort = useCallback(
    async function handleAbort() {
      try {
        await fetch('/api/chat-abort', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionKey }),
        })
      } catch {
        // Ignore abort errors
      }
    },
    [sessionKey],
  )

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

  const handleSelectSlashCommand = useCallback(
    function handleSelectSlashCommand(command: SlashCommandDefinition) {
      const nextValue = `${command.command} `
      setIsSlashMenuDismissed(false)
      setValue(nextValue)
      persistDraft(nextValue)
      focusPrompt()
    },
    [focusPrompt, persistDraft],
  )

  const handleDismissSlashMenu = useCallback(() => {
    setIsSlashMenuDismissed(true)
  }, [])

  const handlePromptSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    if (isSlashMenuOpen) {
      const applied = slashMenuRef.current?.selectActive() ?? false
      if (!applied) {
        setIsSlashMenuDismissed(true)
      }
      return
    }
    handleSubmit()
  }, [handleSubmit, isSlashMenuOpen])

  const handlePromptKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Slash menu navigation takes priority
      if (isSlashMenuOpen) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          slashMenuRef.current?.moveSelection(1)
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          slashMenuRef.current?.moveSelection(-1)
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          handleDismissSlashMenu()
          return
        }
      }
      // Enter to send (Shift+Enter inserts newline — default textarea behavior)
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault()
        handleSubmit()
      }
    },
    [handleDismissSlashMenu, handleSubmit, isSlashMenuOpen],
  )

  // Combine internal ref with external wrapperRef
  const setWrapperRefs = useCallback(
    (node: HTMLDivElement | null) => {
      composerWrapperRef.current = node
      if (typeof wrapperRef === 'function') {
        wrapperRef(node)
      } else if (wrapperRef && 'current' in wrapperRef) {
        ;(wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current =
          node
      }
    },
    [wrapperRef],
  )

  const keyboardOrFocusActive = mobileKeyboardInset > 0 || mobileComposerFocused
  const composerWrapperStyle = useMemo(
    () => {
      const tabBarOffset = keyboardOrFocusActive
        ? '0px'
        : 'max(0px, calc(var(--mobile-tab-bar-offset) - 0.375rem))'
      const mobileTranslate = `translateY(calc(-1 * (${tabBarOffset} + var(--kb-inset, 0px))))`
      return {
        maxWidth: 'min(768px, 100%)',
        '--mobile-tab-bar-offset': MOBILE_TAB_BAR_OFFSET,
        transform: isMobileViewport ? mobileTranslate : undefined,
        WebkitTransform: isMobileViewport ? mobileTranslate : undefined,
      } as CSSProperties
    },
    [isMobileViewport, keyboardOrFocusActive],
  )

  return (
    <div
      className={cn(
        'no-swipe pointer-events-auto mx-auto w-full bg-surface px-3 pt-2 sm:px-5 touch-manipulation',
        isMobileViewport
          ? 'fixed inset-x-0 bottom-0 z-[70] transition-transform duration-200'
          : 'relative z-40 shrink-0',
        'pb-[max(var(--safe-b),0px)] md:pb-[calc(var(--safe-b)+0.75rem)]',
        'md:bg-surface/95 md:backdrop-blur md:transition-[padding-bottom,background-color,backdrop-filter] md:duration-200',
      )}
      style={composerWrapperStyle}
      ref={setWrapperRefs}
    >
      <input
        ref={attachmentInputRef}
        type="file"
        accept="image/*,.md,.txt,.json,.csv,.ts,.tsx,.js,.py"
        multiple
        className="hidden"
        onChange={handleAttachmentInputChange}
      />
      <PromptInput
        value={value}
        onValueChange={handleValueChange}
        onSubmit={handlePromptSubmit}
        isLoading={isLoading}
        disabled={disabled}
        className={cn(
          'relative z-50 transition-all duration-300',
          isDraggingOver &&
            'outline-primary-500 ring-2 ring-primary-300 bg-primary-50/80',
          isLoading &&
            'ring-2 ring-accent-400/50 shadow-[0_0_15px_rgba(249,115,22,0.15)]',
        )}
        onPaste={handlePaste}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <SlashCommandMenu
          ref={slashMenuRef}
          open={isSlashMenuOpen}
          query={slashCommandQuery ?? ''}
          onSelect={handleSelectSlashCommand}
        />

        {isDraggingOver ? (
          <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-[18px] border-2 border-dashed border-primary-400 bg-primary-50/90 text-sm font-medium text-primary-700">
            Drop files to attach
          </div>
        ) : null}

        {attachments.length > 0 ? (
          <div className="px-3">
            <div className="flex flex-wrap gap-3">
              {attachments.map((attachment) => {
                const isImageAttachment =
                  Boolean(attachment.previewUrl) &&
                  isImageMimeType(attachment.contentType)

                return (
                  <div
                    key={attachment.id}
                    className={cn(
                      'group relative',
                      isImageAttachment ? 'w-28' : 'w-auto max-w-[16rem]',
                    )}
                  >
                    {isImageAttachment ? (
                      <button
                        type="button"
                        className="aspect-square w-full overflow-hidden rounded-xl border border-primary-200 bg-primary-50"
                        onClick={() =>
                          setPreviewImage({
                            url: attachment.previewUrl || '',
                            name: attachment.name || 'Attached image',
                          })
                        }
                        aria-label={`Preview ${attachment.name || 'image'}`}
                      >
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.name || 'Attached image'}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-700">
                        <span className="mr-1">📄</span>
                        <span className="truncate">{attachment.name}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        handleRemoveAttachment(attachment.id)
                      }}
                      className="absolute right-1 top-1 z-10 inline-flex size-6 items-center justify-center rounded-full bg-primary-900/80 text-primary-50 opacity-100 md:opacity-0 transition-opacity md:group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <HugeiconsIcon
                        icon={Cancel01Icon}
                        size={20}
                        strokeWidth={1.5}
                      />
                    </button>
                    <div className="mt-1 truncate text-xs font-medium text-primary-700">
                      {attachment.name}
                    </div>
                    <div className="text-[11px] text-primary-400">
                      {formatFileSize(attachment.size)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        <PromptInputTextarea
          placeholder={promptPlaceholder}
          autoFocus
          inputRef={promptRef}
          onKeyDown={handlePromptKeyDown}
          onFocus={() => {
            setMobileComposerFocused(true)
            // Keep fallback behavior for browsers without visualViewport.
            if (!window.visualViewport) {
              setMobileKeyboardOpen(true)
              setMobileKeyboardInset(0)
            }
          }}
          onBlur={() => {
            setMobileComposerFocused(false)
            if (!window.visualViewport) {
              setMobileKeyboardOpen(false)
              setMobileKeyboardInset(0)
            }
          }}
          className="min-h-[44px]"
        />
        <PromptInputActions className="justify-between px-1.5 md:px-3 gap-0.5 md:gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-0 md:gap-1">
            <PromptInputAction tooltip="Add attachment">
              <Button
                size="icon-sm"
                variant="ghost"
                className="rounded-lg text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-800 hover:text-primary-500"
                aria-label="Add attachment"
                disabled={disabled}
                onClick={handleOpenAttachmentPicker}
              >
                <HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={1.5} />
              </Button>
            </PromptInputAction>
            {hasDraft && !isLoading && (
              <PromptInputAction tooltip="Clear draft">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="rounded-lg text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-800 hover:text-red-600"
                  aria-label="Clear draft"
                  onClick={handleClearDraft}
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={20}
                    strokeWidth={1.5}
                  />
                </Button>
              </PromptInputAction>
            )}
            <div
              className="relative ml-0.5 md:ml-1 flex min-w-0 items-center gap-1 md:gap-2"
              ref={modelSelectorRef}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  if (isModelSwitcherDisabled) return
                  setIsModelMenuOpen((prev) => !prev)
                }}
                className={cn(
                  'inline-flex h-7 max-w-[8rem] items-center gap-0.5 rounded-full bg-primary-100/70 px-1.5 md:max-w-none md:px-2.5 md:gap-1 text-[11px] font-medium text-primary-600 transition-colors hover:bg-primary-200 dark:hover:bg-primary-800 hover:text-primary-800',
                  isModelSwitcherDisabled &&
                    'cursor-not-allowed opacity-50',
                )}
                aria-haspopup="listbox"
                aria-expanded={
                  !isModelSwitcherDisabled && isModelMenuOpen
                }
                aria-disabled={isModelSwitcherDisabled}
                disabled={isModelSwitcherDisabled}
                title={currentModel || modelAvailabilityLabel || 'Select model'}
              >
                <span className="max-w-[5.5rem] truncate sm:max-w-[8.5rem] md:max-w-[12rem]">
                  {modelButtonLabel}
                </span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={12}
                  strokeWidth={2}
                  className="opacity-60"
                />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  handleSetDefaultModel()
                }}
                className={cn(
                  'hidden md:inline-flex h-7 items-center rounded-full border border-primary-200 bg-primary-50 px-2 text-[11px] font-medium text-primary-600 transition-colors hover:bg-primary-100 dark:hover:bg-primary-800',
                  isDefaultModelDisabled && 'cursor-not-allowed opacity-50',
                )}
                disabled={isDefaultModelDisabled}
                title={currentModel ? `Set ${currentModel} as default` : 'No active model'}
              >
                Set as default
              </button>
              {modelAvailabilityLabel ? (
                <span className="hidden text-xs text-primary-500 text-pretty md:inline">
                  {modelAvailabilityLabel}
                </span>
              ) : null}
              {modelNotice ? (
                <span
                  className={cn(
                    'hidden md:inline-flex items-center gap-1 text-xs text-pretty',
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
                        'rounded px-1 font-medium text-primary-700 hover:bg-primary-100 dark:hover:bg-primary-800',
                        modelSwitchMutation.isPending &&
                          'cursor-not-allowed opacity-60',
                      )}
                      disabled={modelSwitchMutation.isPending}
                    >
                      Retry
                    </button>
                  ) : null}
                </span>
              ) : null}
              {!isModelSwitcherDisabled && isModelMenuOpen ? (
                <div className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 sm:right-auto z-40 min-w-[16rem] max-w-[calc(100vw-2rem)] sm:max-w-[24rem] rounded-xl border border-primary-200 bg-surface shadow-lg">
                  {groupedModels.length === 0 && modelsUnavailable ? (
                    <div className="p-4 text-center text-sm text-primary-500">
                      <p className="font-medium text-primary-700 mb-1">
                        Gateway not connected
                      </p>
                      <p className="text-xs">
                        Make sure OpenClaw is running and the gateway URL is
                        configured.
                      </p>
                    </div>
                  ) : groupedModels.length === 0 ? (
                    <div className="p-4 text-center text-sm text-primary-500">
                      <p className="font-medium text-primary-700 mb-1">
                        No models configured
                      </p>
                      <p className="text-xs mb-2">
                        Add API keys for providers in your OpenClaw config to
                        unlock more models.
                      </p>
                      <a
                        href="https://docs.openclaw.ai/configuration"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-accent-500/10 px-3 py-1.5 text-xs font-medium text-accent-600 hover:bg-accent-50 dark:hover:bg-accent-900/300/20 transition-colors"
                      >
                        Setup Guide →
                      </a>
                    </div>
                  ) : (
                    <div className="max-h-[20rem] overflow-y-auto p-1">
                      {/* Phase 4.2: Pinned models section */}
                      {(pinnedModels.length > 0 ||
                        unavailablePinnedModels.length > 0) && (
                        <div className="mb-2 border-t border-neutral-200 bg-neutral-50 py-2">
                          <div className="mb-1.5 flex items-center gap-1 px-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                            <HugeiconsIcon
                              icon={PinIcon}
                              size={14}
                              strokeWidth={1.5}
                              className="text-accent-500"
                            />
                            <span>Pinned</span>
                          </div>
                          {pinnedModels.map((option) => {
                            const optionActive = isSameModel(
                              option,
                              currentModel,
                            )
                            return (
                              <div
                                key={option.value}
                                className="group relative flex items-center"
                              >
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setIsModelMenuOpen(false)
                                    handleModelSelect(option.value)
                                  }}
                                  className={cn(
                                    'flex flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:hover:bg-white/10',
                                    optionActive &&
                                      'border-l-2 border-accent-500 bg-neutral-100 text-neutral-900',
                                  )}
                                  role="option"
                                  aria-selected={optionActive}
                                  aria-label={`Select ${option.label}`}
                                >
                                  <span className="flex-1 truncate font-medium">
                                    {option.label}
                                  </span>
                                  {optionActive && (
                                    <span
                                      className="h-1.5 w-1.5 rounded-full bg-accent-500"
                                      aria-label="Currently active"
                                    />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    togglePin(option.value)
                                  }}
                                  className="absolute right-3 rounded px-1 text-xs leading-none text-accent-500 opacity-80 transition-opacity hover:bg-accent-50 dark:hover:bg-accent-900/30 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-accent-300"
                                  aria-label={`Unpin ${option.label}`}
                                  title="Unpin"
                                >
                                  <HugeiconsIcon
                                    icon={PinIcon}
                                    size={12}
                                    strokeWidth={2}
                                  />
                                </button>
                              </div>
                            )
                          })}
                          {/* Unavailable pinned models */}
                          {unavailablePinnedModels.map((modelId) => (
                            <div
                              key={modelId}
                              className="group relative flex items-center"
                            >
                              <div className="flex flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm text-neutral-400 opacity-60">
                                <span className="flex-1 truncate font-medium">
                                  {modelId}
                                </span>
                                <span className="text-xs text-red-500">
                                  Unavailable
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  togglePin(modelId)
                                }}
                                className="absolute right-3 rounded px-2 py-0.5 text-[10px] text-red-500 opacity-80 transition-opacity hover:bg-red-50 dark:hover:bg-red-900/30 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-red-300"
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
                          <div className="border-t border-neutral-100 px-3 pb-2 pt-3 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                            {provider}
                          </div>
                          {models.map((option) => {
                            const optionActive = isSameModel(
                              option,
                              currentModel,
                            )
                            return (
                              <div
                                key={option.value}
                                className="group relative flex items-center"
                              >
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setIsModelMenuOpen(false)
                                    handleModelSelect(option.value)
                                  }}
                                  className={cn(
                                    'flex flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:hover:bg-white/10',
                                    optionActive &&
                                      'border-l-2 border-accent-500 bg-neutral-100 text-neutral-900',
                                  )}
                                  role="option"
                                  aria-selected={optionActive}
                                  aria-label={`Select ${option.label}`}
                                >
                                  <span className="flex-1 truncate font-medium">
                                    {option.label}
                                  </span>
                                  {optionActive && (
                                    <span
                                      className="h-1.5 w-1.5 rounded-full bg-accent-500"
                                      aria-label="Currently active"
                                    />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    togglePin(option.value)
                                  }}
                                  className="absolute right-3 rounded px-1 text-xs leading-none text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-100 dark:hover:bg-white/10 hover:text-accent-500 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-accent-300 group-hover:opacity-100"
                                  aria-label={`Pin ${option.label}`}
                                  title="Pin"
                                >
                                  <HugeiconsIcon
                                    icon={PinIcon}
                                    size={12}
                                    strokeWidth={2}
                                  />
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
          <div className="ml-1 flex shrink-0 items-center gap-0.5 md:gap-1">
            {voiceInput.isSupported || voiceRecorder.isSupported ? (
              <PromptInputAction
                tooltip={
                  voiceRecorder.isRecording
                    ? `Recording… ${Math.round(voiceRecorder.durationMs / 1000)}s`
                    : voiceInput.isListening
                      ? 'Listening — tap to stop'
                      : 'Tap: dictate · Hold: voice note'
                }
              >
                <Button
                  onClick={() => {
                    // Toggle voice input on click
                    if (voiceInput.isListening) {
                      voiceInput.stop()
                    } else if (voiceRecorder.isRecording) {
                      voiceRecorder.stop()
                    } else {
                      voiceInput.start()
                    }
                  }}
                  onPointerDown={handleMicPointerDown}
                  onPointerUp={handleMicPointerUp}
                  onPointerLeave={handleMicPointerUp}
                  size="icon-sm"
                  variant="ghost"
                  className={cn(
                    'rounded-lg transition-colors select-none',
                    voiceRecorder.isRecording
                      ? 'text-red-600 bg-red-100 hover:bg-red-200 animate-pulse'
                      : voiceInput.isListening
                        ? 'text-red-500 bg-red-50 hover:bg-red-100 animate-pulse'
                        : 'text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-800 hover:text-primary-700',
                  )}
                  aria-label={
                    voiceRecorder.isRecording
                      ? 'Recording voice note'
                      : voiceInput.isListening
                        ? 'Stop listening'
                        : 'Voice input'
                  }
                  disabled={disabled}
                >
                  <HugeiconsIcon icon={Mic01Icon} size={20} strokeWidth={1.5} />
                  {voiceRecorder.isRecording ? (
                    <span className="absolute -top-1 -right-1 flex size-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex size-3 rounded-full bg-red-500" />
                    </span>
                  ) : null}
                </Button>
              </PromptInputAction>
            ) : null}
            {isLoading ? (
              <PromptInputAction tooltip="Stop generation">
                <Button
                  onClick={handleAbort}
                  size="icon-sm"
                  variant="destructive"
                  className="rounded-md"
                  aria-label="Stop generation"
                >
                  <HugeiconsIcon icon={StopIcon} size={20} strokeWidth={1.5} />
                </Button>
              </PromptInputAction>
            ) : (
              <PromptInputAction tooltip="Send message">
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitDisabled}
                  size="icon-sm"
                  className="rounded-full"
                  aria-label="Send message"
                >
                  <HugeiconsIcon
                    icon={ArrowUp02Icon}
                    size={20}
                    strokeWidth={1.5}
                  />
                </Button>
              </PromptInputAction>
            )}
          </div>
        </PromptInputActions>
      </PromptInput>

      {/* Fullscreen image preview overlay — portaled to body to escape stacking context */}
      {previewImage && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
          role="dialog"
          aria-label="Image preview"
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white dark:hover:bg-white/10/30 active:bg-white/40 transition-colors"
            onClick={(e) => { e.stopPropagation(); setPreviewImage(null) }}
            aria-label="Close preview"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={24} strokeWidth={2} />
          </button>
          <img
            src={previewImage.url}
            alt={previewImage.name}
            className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}

const MemoizedChatComposer = memo(ChatComposerComponent)

export { MemoizedChatComposer as ChatComposer }
export type { ChatComposerAttachment, ChatComposerHelpers, ChatComposerHandle }
