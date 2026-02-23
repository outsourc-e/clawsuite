import { HugeiconsIcon } from '@hugeicons/react'
import { GlobeIcon, Loading03Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import { useMutation, useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { BrowserScreenshot } from './BrowserScreenshot'
import { BrowserTabs } from './BrowserTabs'

type BrowserTab = {
  id: string
  title: string
  url: string
  isActive: boolean
}

type BrowserStatusResponse = {
  active: boolean
  url?: string
  screenshotUrl?: string
  message?: string
  gatewaySupportRequired?: boolean
}

type BrowserTabsResponse = {
  ok: boolean
  tabs: Array<BrowserTab>
  activeTabId: string | null
  updatedAt: string
  demoMode: boolean
  error?: string
  gatewaySupportRequired?: boolean
}

type BrowserScreenshotResponse = {
  ok: boolean
  imageDataUrl: string
  currentUrl: string
  activeTabId: string | null
  capturedAt: string
  demoMode: boolean
  error?: string
  gatewaySupportRequired?: boolean
}

type NavigateResponse = {
  ok: boolean
  url?: string
  error?: string
}

const GATEWAY_SUPPORT_PATTERNS = [
  'missing gateway auth',
  'gateway connection closed',
  'connect econnrefused',
  'method not found',
  'unknown method',
  'not implemented',
  'unsupported',
  'browser api unavailable',
  'browser tool request failed',
]

const BROWSER_CDP_URL = 'ws://127.0.0.1:18792'

function readError(response: Response): Promise<string> {
  return response
    .json()
    .then(function onJson(payload) {
      if (payload && typeof payload.error === 'string') return payload.error
      if (payload && typeof payload.message === 'string') return payload.message
      return response.statusText || 'Request failed'
    })
    .catch(function onError() {
      return response.statusText || 'Request failed'
    })
}

function readErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) return error.message || fallbackMessage
  if (typeof error === 'string' && error.trim()) return error
  return fallbackMessage
}

function isGatewaySupportError(message: string): boolean {
  const normalizedMessage = message.trim().toLowerCase()
  if (!normalizedMessage) return false

  return GATEWAY_SUPPORT_PATTERNS.some(function hasPattern(pattern) {
    return normalizedMessage.includes(pattern)
  })
}

async function fetchBrowserStatus(): Promise<BrowserStatusResponse> {
  const response = await fetch('/api/browser/status')
  if (!response.ok) {
    throw new Error(await readError(response))
  }

  return (await response.json()) as BrowserStatusResponse
}

async function fetchBrowserTabs(): Promise<BrowserTabsResponse> {
  try {
    const response = await fetch('/api/browser/tabs')
    if (!response.ok) {
      throw new Error(await readError(response))
    }

    return (await response.json()) as BrowserTabsResponse
  } catch (error) {
    return {
      ok: false,
      tabs: [],
      activeTabId: null,
      updatedAt: new Date().toISOString(),
      demoMode: false,
      error: readErrorMessage(error, 'Browser tabs unavailable'),
      gatewaySupportRequired: isGatewaySupportError(
        readErrorMessage(error, 'Browser tabs unavailable'),
      ),
    }
  }
}

async function fetchBrowserScreenshot(
  activeTabId?: string | null,
): Promise<BrowserScreenshotResponse> {
  try {
    const params = new URLSearchParams()
    if (activeTabId) params.set('tabId', activeTabId)

    const response = await fetch(
      `/api/browser/screenshot${params.size ? `?${params.toString()}` : ''}`,
    )
    if (!response.ok) {
      throw new Error(await readError(response))
    }

    return (await response.json()) as BrowserScreenshotResponse
  } catch (error) {
    return {
      ok: false,
      imageDataUrl: '',
      currentUrl: '',
      activeTabId: activeTabId || null,
      capturedAt: new Date().toISOString(),
      demoMode: false,
      error: readErrorMessage(error, 'Browser screenshot unavailable'),
      gatewaySupportRequired: isGatewaySupportError(
        readErrorMessage(error, 'Browser screenshot unavailable'),
      ),
    }
  }
}

async function navigateBrowser(url: string): Promise<NavigateResponse> {
  const response = await fetch('/api/browser/navigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  const payload = (await response.json().catch(() => ({}))) as NavigateResponse
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || response.statusText || 'Navigation failed')
  }

  return payload
}

function BrowserPanel() {
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null)
  const [draftUrl, setDraftUrl] = useState('')
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [actionError, setActionError] = useState('')

  const statusQuery = useQuery({
    queryKey: ['browser', 'status'],
    queryFn: fetchBrowserStatus,
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
    retry: false,
  })

  const tabsQuery = useQuery({
    queryKey: ['browser', 'tabs'],
    queryFn: fetchBrowserTabs,
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
    retry: false,
  })

  const tabs = tabsQuery.data?.tabs ?? []
  const tabSet = useMemo(
    function buildTabSet() {
      return new Set(tabs.map((tab) => tab.id))
    },
    [tabs],
  )

  const effectiveTabId =
    selectedTabId && tabSet.has(selectedTabId)
      ? selectedTabId
      : (tabsQuery.data?.activeTabId ??
        tabs.find((tab) => tab.isActive)?.id ??
        null)

  const statusMessage = statusQuery.data?.message || ''
  const tabsError = tabsQuery.data?.error || ''
  const preConnectionError = tabsError || statusMessage
  const demoMode = Boolean(tabsQuery.data?.demoMode)
  const gatewaySupportRequired =
    Boolean(statusQuery.data?.gatewaySupportRequired) ||
    Boolean(tabsQuery.data?.gatewaySupportRequired) ||
    isGatewaySupportError(preConnectionError)

  const isConnected =
    !demoMode &&
    !gatewaySupportRequired &&
    (Boolean(statusQuery.data?.active) || tabs.length > 0)

  const screenshotQuery = useQuery({
    queryKey: ['browser', 'screenshot', effectiveTabId ?? 'active'],
    queryFn: function queryScreenshot() {
      return fetchBrowserScreenshot(effectiveTabId)
    },
    enabled: isConnected,
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
    retry: false,
  })

  const navigateMutation = useMutation({
    mutationFn: navigateBrowser,
    onSuccess: async () => {
      setActionError('')
      await Promise.all([
        statusQuery.refetch(),
        tabsQuery.refetch(),
        screenshotQuery.refetch(),
      ])
    },
    onError: (error) => {
      setActionError(readErrorMessage(error, 'Navigation failed'))
    },
  })

  const activeTab = tabs.find((tab) => tab.id === effectiveTabId)
  const currentUrl =
    screenshotQuery.data?.currentUrl ||
    activeTab?.url ||
    statusQuery.data?.url ||
    'about:blank'
  const screenshotUrl =
    screenshotQuery.data?.imageDataUrl || statusQuery.data?.screenshotUrl || ''
  const errorText =
    actionError ||
    screenshotQuery.data?.error ||
    tabsError ||
    (isConnected ? '' : statusMessage)

  useEffect(() => {
    if (!isEditingUrl) {
      setDraftUrl(currentUrl || '')
    }
  }, [currentUrl, isEditingUrl])

  function handleSelectTab(tabId: string) {
    setSelectedTabId(tabId)
    setActionError('')
  }

  function handleRefresh() {
    void Promise.all([
      statusQuery.refetch(),
      tabsQuery.refetch(),
      screenshotQuery.refetch(),
    ])
  }

  async function handleNavigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draftUrl.trim()) return
    setActionError('')
    await navigateMutation.mutateAsync(draftUrl)
  }

  if (!isConnected) {
    return (
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22 }}
        className="h-screen bg-surface px-3 py-3 text-primary-900 sm:px-4 sm:py-4"
      >
        <div className="mx-auto flex h-full w-full max-w-[1700px] items-center justify-center">
          <div className="w-full max-w-2xl rounded-2xl border border-primary-200 bg-primary-50/85 p-8 text-center shadow-sm backdrop-blur-xl">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-primary-300 bg-primary-100 text-primary-700">
              <HugeiconsIcon icon={GlobeIcon} size={24} strokeWidth={1.5} />
            </div>
            <h1 className="mt-4 text-2xl font-medium text-primary-900">
              Browser not connected
            </h1>
            <p className="mt-2 text-sm text-primary-600">
              Click the OpenClaw Chrome extension icon on any Chrome tab to
              attach it.
            </p>
            <div className="mt-4 rounded-xl border border-primary-200 bg-surface px-4 py-3 text-left">
              <p className="text-xs uppercase tracking-wide text-primary-500">
                Gateway CDP URL
              </p>
              <code className="mt-1 block rounded bg-primary-100 px-2 py-1 font-mono text-sm text-primary-800">
                {BROWSER_CDP_URL}
              </code>
            </div>
            {errorText ? (
              <p className="mt-4 text-sm text-amber-700">{errorText}</p>
            ) : null}
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={statusQuery.isRefetching || tabsQuery.isRefetching}
                className="inline-flex items-center gap-2 rounded-lg border border-primary-300 bg-primary-100 px-4 py-2 text-sm font-medium text-primary-800 transition-colors hover:bg-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <HugeiconsIcon icon={RefreshIcon} size={18} strokeWidth={1.5} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </motion.main>
    )
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22 }}
      className="h-screen bg-surface px-3 py-3 text-primary-900 sm:px-4 sm:py-4"
    >
      <div className="mx-auto flex h-full w-full max-w-[1700px] min-w-0 flex-col gap-3">
        <header className="rounded-2xl border border-primary-200 bg-primary-50/85 p-4 shadow-sm backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-100/70 px-3 py-1 text-xs text-primary-600 tabular-nums">
              <HugeiconsIcon icon={GlobeIcon} size={20} strokeWidth={1.5} />
              <span>Browser View</span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
              <span className="size-2 rounded-full bg-emerald-500" />
              Connected
            </span>
          </div>
          <p className="mt-2 text-sm text-primary-600 text-pretty">
            Live tabs and screenshot refresh every 3 seconds.
          </p>
        </header>

        <form
          onSubmit={handleNavigate}
          className="rounded-2xl border border-primary-200 bg-primary-100/40 p-3 shadow-sm backdrop-blur-xl"
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={
                statusQuery.isPending ||
                tabsQuery.isPending ||
                screenshotQuery.isPending ||
                statusQuery.isRefetching ||
                tabsQuery.isRefetching ||
                screenshotQuery.isRefetching
              }
              className="inline-flex items-center gap-2 rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-800 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <HugeiconsIcon icon={RefreshIcon} size={18} strokeWidth={1.5} />
              {statusQuery.isRefetching || tabsQuery.isRefetching || screenshotQuery.isRefetching
                ? 'Refreshing'
                : 'Refresh'}
            </button>
            <input
              type="url"
              value={draftUrl}
              onChange={(event) => setDraftUrl(event.target.value)}
              onFocus={() => setIsEditingUrl(true)}
              onBlur={() => setIsEditingUrl(false)}
              placeholder="Enter URL"
              className="min-w-[260px] flex-1 rounded-xl border border-primary-200 bg-primary-50/75 px-3 py-2 text-sm text-primary-800 outline-none ring-0 placeholder:text-primary-400 focus:border-accent-500/50"
            />
            <button
              type="submit"
              disabled={navigateMutation.isPending || !draftUrl.trim()}
              className="inline-flex items-center rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {navigateMutation.isPending ? 'Navigating...' : 'Go'}
            </button>
          </div>
          {errorText ? (
            <p className="mt-2 text-xs text-amber-700">{errorText}</p>
          ) : null}
        </form>

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[320px_1fr]">
          <BrowserTabs
            tabs={tabs}
            activeTabId={effectiveTabId}
            loading={tabsQuery.isPending}
            onSelect={handleSelectTab}
          />

          {screenshotUrl ? (
            <BrowserScreenshot
              imageDataUrl={screenshotUrl}
              loading={screenshotQuery.isPending}
              capturedAt={screenshotQuery.data?.capturedAt || ''}
            />
          ) : screenshotQuery.isPending ? (
            <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-primary-200 bg-primary-100/35 text-primary-500">
              <HugeiconsIcon
                icon={Loading03Icon}
                size={20}
                strokeWidth={1.5}
                className="animate-spin"
              />
            </div>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-2xl border border-primary-200 bg-primary-100/35 px-6 text-center lg:min-h-[560px]">
              <h3 className="text-base font-medium text-primary-900 text-balance">
                Screenshot unavailable
              </h3>
              <p className="max-w-md text-sm text-primary-600 text-pretty">
                {errorText ||
                  'No screenshot was returned by the gateway. Use refresh to retry.'}
              </p>
            </div>
          )}
        </section>
      </div>
    </motion.main>
  )
}

export { BrowserPanel }
