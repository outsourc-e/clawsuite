import { HugeiconsIcon } from '@hugeicons/react'
import { GlobeIcon, Loading03Icon } from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { BrowserControls } from './BrowserControls'
import { BrowserScreenshot } from './BrowserScreenshot'
import { BrowserTabs } from './BrowserTabs'

type BrowserTab = {
  id: string
  title: string
  url: string
  isActive: boolean
}

type BrowserTabsResponse = {
  ok: boolean
  tabs: Array<BrowserTab>
  activeTabId: string | null
  updatedAt: string
  demoMode: boolean
  error?: string
}

type BrowserScreenshotResponse = {
  ok: boolean
  imageDataUrl: string
  currentUrl: string
  activeTabId: string | null
  capturedAt: string
  demoMode: boolean
  error?: string
}

function readError(response: Response): Promise<string> {
  return response
    .json()
    .then(function onJson(payload) {
      if (payload && typeof payload.error === 'string') return payload.error
      return response.statusText || 'Request failed'
    })
    .catch(function onError() {
      return response.statusText || 'Request failed'
    })
}

function createLocalFallbackTabs(error: unknown): BrowserTabsResponse {
  const reason =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Browser tabs unavailable'

  return {
    ok: true,
    tabs: [
      {
        id: 'local-demo-tab',
        title: 'OpenClaw Studio Demo',
        url: 'https://openclaw.local/studio',
        isActive: true,
      },
    ],
    activeTabId: 'local-demo-tab',
    updatedAt: new Date().toISOString(),
    demoMode: true,
    error: reason,
  }
}

function createLocalFallbackScreenshot(
  tabId?: string | null,
): BrowserScreenshotResponse {
  const timestamp = new Date().toISOString()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="720" fill="url(#g)"/>
  <rect x="80" y="80" width="1040" height="560" rx="22" fill="#0b1220" stroke="#334155"/>
  <text x="120" y="180" fill="#f8fafc" font-family="ui-sans-serif, system-ui, sans-serif" font-size="38">Demo Browser Mode</text>
  <text x="120" y="226" fill="#94a3b8" font-family="ui-sans-serif, system-ui, sans-serif" font-size="21">Using fallback screenshot stream.</text>
  <text x="120" y="268" fill="#94a3b8" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="17">tabId=${tabId || 'active'}</text>
</svg>`

  return {
    ok: true,
    imageDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    currentUrl: 'https://openclaw.local/demo/browser',
    activeTabId: tabId || 'local-demo-tab',
    capturedAt: timestamp,
    demoMode: true,
  }
}

async function fetchBrowserTabs(): Promise<BrowserTabsResponse> {
  try {
    const response = await fetch('/api/browser/tabs')
    if (!response.ok) {
      throw new Error(await readError(response))
    }

    return (await response.json()) as BrowserTabsResponse
  } catch (error) {
    return createLocalFallbackTabs(error)
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
  } catch {
    return createLocalFallbackScreenshot(activeTabId)
  }
}

function BrowserPanel() {
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null)

  const tabsQuery = useQuery({
    queryKey: ['browser', 'tabs'],
    queryFn: fetchBrowserTabs,
    refetchInterval: 2_000,
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
      : tabsQuery.data?.activeTabId ?? tabs.find((tab) => tab.isActive)?.id ?? null

  const screenshotQuery = useQuery({
    queryKey: ['browser', 'screenshot', effectiveTabId ?? 'active'],
    queryFn: function queryScreenshot() {
      return fetchBrowserScreenshot(effectiveTabId)
    },
    refetchInterval: 2_000,
    refetchIntervalInBackground: true,
    retry: false,
  })

  const activeTab = tabs.find((tab) => tab.id === effectiveTabId)
  const currentUrl =
    screenshotQuery.data?.currentUrl || activeTab?.url || 'about:blank'
  const demoMode =
    Boolean(tabsQuery.data?.demoMode) || Boolean(screenshotQuery.data?.demoMode)
  const screenshotUrl = screenshotQuery.data?.imageDataUrl || ''
  const errorText = tabsQuery.data?.error || screenshotQuery.data?.error || ''

  function handleSelectTab(tabId: string) {
    setSelectedTabId(tabId)
  }

  function handleRefresh() {
    void Promise.all([tabsQuery.refetch(), screenshotQuery.refetch()])
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
          <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-100/70 px-3 py-1 text-xs text-primary-600 tabular-nums">
            <HugeiconsIcon icon={GlobeIcon} size={20} strokeWidth={1.5} />
            <span>Live Browser Monitor</span>
          </div>
          <h1 className="mt-2 text-xl font-medium text-balance sm:text-2xl">Browser View</h1>
          <p className="mt-1 text-sm text-primary-600 text-pretty">
            Track agent browser tabs and live screenshots every 2 seconds.
          </p>
        </header>

        <BrowserControls
          url={currentUrl}
          loading={tabsQuery.isPending || screenshotQuery.isPending}
          refreshing={tabsQuery.isRefetching || screenshotQuery.isRefetching}
          demoMode={demoMode}
          onRefresh={handleRefresh}
        />

        {demoMode ? (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <HugeiconsIcon icon={GlobeIcon} size={16} strokeWidth={1.5} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                  Demo Mode
                </span>
              </div>
              <p className="mt-0.5 text-xs text-amber-700 text-pretty">
                Connect a browser to use live features. Configure the browser plugin in your Gateway settings.
                {errorText ? <span className="text-amber-600/80"> ({errorText})</span> : null}
              </p>
            </div>
          </div>
        ) : null}

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
          ) : (
            <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-primary-200 bg-primary-100/35 text-primary-500">
              <HugeiconsIcon
                icon={Loading03Icon}
                size={20}
                strokeWidth={1.5}
                className="animate-spin"
              />
            </div>
          )}
        </section>
      </div>
    </motion.main>
  )
}

export { BrowserPanel }
