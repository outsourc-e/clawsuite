import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Loading03Icon,
  Refresh01Icon,
  Cancel01Icon,
  GlobeIcon,
  AiChat02Icon,
  SentIcon,
  ComputerTerminal01Icon,
} from '@hugeicons/core-free-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type BrowserState = {
  ok: boolean
  running: boolean
  url: string
  title: string
  screenshot: string | null
  error?: string
}

async function browserAction(action: string, params?: Record<string, unknown>): Promise<BrowserState> {
  const res = await fetch('/api/browser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  })
  return res.json() as Promise<BrowserState>
}

export function LocalBrowser() {
  const queryClient = useQueryClient()
  const navigateTo = useNavigate()
  const [agentPrompt, setAgentPrompt] = useState('')
  const [handingOff, setHandingOff] = useState(false)
  const [isLaunched, setIsLaunched] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const imgRef = useRef<HTMLImageElement>(null)

  // Check if browser is already running
  useEffect(() => {
    browserAction('screenshot').then((state) => {
      if (state.running) {
        setIsLaunched(true)
        setUrlInput(state.url || '')
        queryClient.setQueryData(['local-browser', 'state'], state)
      }
    }).catch(() => {})
  }, [queryClient])

  // Poll for screencast frames — CDP pushes to server, we fetch the latest
  // This is fast because the server already has the frame cached from CDP screencast
  const stateQuery = useQuery<BrowserState>({
    queryKey: ['local-browser', 'state'],
    queryFn: () => browserAction('screenshot'),
    enabled: isLaunched,
    refetchInterval: 150, // ~7fps — smooth enough, screencast frames are cached (not re-captured)
    staleTime: 100,
  })

  const currentState = stateQuery.data
  const currentUrl = currentState?.url || ''
  const currentTitle = currentState?.title || ''

  useEffect(() => {
    if (currentUrl && currentUrl !== 'about:blank' && !document.activeElement?.matches('.url-input')) {
      setUrlInput(currentUrl)
    }
  }, [currentUrl])

  const launchMutation = useMutation({
    mutationFn: () => browserAction('launch'),
    onSuccess: (data) => {
      setIsLaunched(true)
      queryClient.setQueryData(['local-browser', 'state'], data)
    },
  })

  const navMutation = useMutation({
    mutationFn: (url: string) => browserAction('navigate', { url }),
    onSuccess: (data) => {
      queryClient.setQueryData(['local-browser', 'state'], data)
      if (data.url) setUrlInput(data.url)
    },
  })

  const clickMutation = useMutation({
    mutationFn: (coords: { x: number; y: number }) => browserAction('click', coords),
    onSuccess: (data) => {
      queryClient.setQueryData(['local-browser', 'state'], data)
      if (data.url) setUrlInput(data.url)
    },
  })

  const actionMutation = useMutation({
    mutationFn: (params: { action: string } & Record<string, unknown>) => {
      const { action, ...rest } = params
      return browserAction(action, rest)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['local-browser', 'state'], data)
      if (data.url) setUrlInput(data.url)
    },
  })

  const closeMutation = useMutation({
    mutationFn: () => browserAction('close'),
    onSuccess: () => {
      setIsLaunched(false)
      queryClient.setQueryData(['local-browser', 'state'], null)
    },
  })

  // Map click on screenshot → browser coordinates
  const handleViewportClick = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (!imgRef.current) return
      const rect = imgRef.current.getBoundingClientRect()
      const scaleX = 1280 / rect.width
      const scaleY = 800 / rect.height
      const x = Math.round((e.clientX - rect.left) * scaleX)
      const y = Math.round((e.clientY - rect.top) * scaleY)
      clickMutation.mutate({ x, y })
    },
    [clickMutation],
  )

  // Handle scroll on the viewport
  const handleViewportScroll = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const direction = e.deltaY > 0 ? 'down' : 'up'
      actionMutation.mutate({ action: 'scroll', direction, amount: Math.min(Math.abs(e.deltaY) * 2, 600) })
    },
    [actionMutation],
  )

  const handleNavigate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!urlInput.trim()) return
      navMutation.mutate(urlInput.trim())
    },
    [urlInput, navMutation],
  )

  async function handleHandoff() {
    if (!agentPrompt.trim() && !currentUrl) return
    setHandingOff(true)
    try {
      const contentRes = await fetch('/api/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'content' }),
      })
      const content = await contentRes.json() as { url: string; title: string; text: string }
      const instruction = agentPrompt.trim() || 'Take over this browser session and help me with this page.'
      const contextMsg = [
        `🌐 **Browser Handoff**`,
        `**URL:** ${content.url || currentUrl}`,
        `**Page:** ${content.title || currentTitle}`,
        '', `**Task:** ${instruction}`, '',
        `<page_content>`, (content.text || '').slice(0, 4000), `</page_content>`, '',
        `Control the browser via POST /api/browser — actions: navigate, click (x,y), type (text), press (key), scroll (direction), back, forward, refresh, content, screenshot.`,
      ].join('\n')

      const sendRes = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey: '', friendlyId: 'new', message: contextMsg }),
      })
      const sendResult = await sendRes.json() as { ok?: boolean; friendlyId?: string }
      setAgentPrompt('')
      if (sendResult.friendlyId) {
        void navigateTo({ to: '/chat/$sessionKey', params: { sessionKey: sendResult.friendlyId } })
      }
    } catch {
      void navigateTo({ to: '/chat/$sessionKey', params: { sessionKey: 'new' } })
    } finally {
      setHandingOff(false)
    }
  }

  // ── Not launched ──────────────────────────────────────────────
  if (!isLaunched) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
        <div className="flex size-20 items-center justify-center rounded-2xl bg-accent-500/10">
          <HugeiconsIcon icon={GlobeIcon} size={40} strokeWidth={1.5} className="text-accent-500" />
        </div>
        <div className="text-center max-w-lg">
          <h2 className="text-2xl font-semibold text-ink">Browser</h2>
          <p className="mt-3 text-sm text-primary-500 leading-relaxed">
            Browse the web inside ClawSuite. Log in to sites, then hand control to your AI agent to automate workflows — all without leaving the app.
          </p>
        </div>
        <Button
          onClick={() => launchMutation.mutate()}
          disabled={launchMutation.isPending}
          size="lg"
          className="gap-2.5 px-6"
        >
          {launchMutation.isPending ? (
            <>
              <HugeiconsIcon icon={Loading03Icon} size={18} className="animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <HugeiconsIcon icon={ComputerTerminal01Icon} size={18} />
              Launch Browser
            </>
          )}
        </Button>
        {launchMutation.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 max-w-md text-center">
            <p className="font-medium">Failed to launch</p>
            <p className="text-xs mt-1 text-red-500">{launchMutation.error?.message || 'Run: npx playwright install chromium'}</p>
          </div>
        )}
        <div className="mt-2 grid grid-cols-3 gap-3 max-w-md text-center">
          <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-3">
            <p className="text-lg mb-1">🔐</p>
            <p className="text-[11px] font-medium text-ink">You Log In</p>
          </div>
          <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-3">
            <p className="text-lg mb-1">🤖</p>
            <p className="text-[11px] font-medium text-ink">Agent Takes Over</p>
          </div>
          <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-3">
            <p className="text-lg mb-1">🍪</p>
            <p className="text-[11px] font-medium text-ink">Session Persists</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Browser running — embedded view ──────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Chrome-like toolbar */}
      <div className="flex items-center gap-1 border-b border-primary-200 bg-primary-50/80 px-2 py-1.5 shrink-0">
        <button type="button" onClick={() => actionMutation.mutate({ action: 'back' })} className="rounded-md p-1 text-primary-500 hover:bg-primary-200 transition-colors" title="Back">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={15} strokeWidth={2} />
        </button>
        <button type="button" onClick={() => actionMutation.mutate({ action: 'forward' })} className="rounded-md p-1 text-primary-500 hover:bg-primary-200 transition-colors" title="Forward">
          <HugeiconsIcon icon={ArrowRight01Icon} size={15} strokeWidth={2} />
        </button>
        <button type="button" onClick={() => actionMutation.mutate({ action: 'refresh' })} className="rounded-md p-1 text-primary-500 hover:bg-primary-200 transition-colors" title="Refresh">
          <HugeiconsIcon icon={Refresh01Icon} size={15} strokeWidth={2} />
        </button>

        <form onSubmit={handleNavigate} className="flex-1 mx-1.5">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Search or enter URL..."
            className="url-input w-full rounded-lg border border-primary-200 bg-surface px-3 py-1 text-[13px] text-ink placeholder:text-primary-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
          />
        </form>

        <button type="button" onClick={() => closeMutation.mutate()} className="rounded-md p-1 text-primary-400 hover:bg-red-100 hover:text-red-500 transition-colors" title="Close">
          <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={2} />
        </button>
      </div>

      {/* Viewport — interactive screenshot from CDP screencast */}
      <div
        className="flex-1 min-h-0 overflow-hidden bg-white relative"
        onWheel={handleViewportScroll}
      >
        {currentState?.screenshot ? (
          <img
            ref={imgRef}
            src={currentState.screenshot}
            alt=""
            className="w-full h-full object-contain object-top cursor-default select-none"
            onClick={handleViewportClick}
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-primary-400">
            <div className="text-center">
              <HugeiconsIcon icon={GlobeIcon} size={32} strokeWidth={1} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Enter a URL to start browsing</p>
            </div>
          </div>
        )}
      </div>

      {/* Keyboard bar — compact */}
      <div className="border-t border-primary-200 bg-primary-50/80 px-2 py-1.5 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const input = e.currentTarget.querySelector('input') as HTMLInputElement
            if (input.value) {
              actionMutation.mutate({ action: 'type', text: input.value, submit: false })
              input.value = ''
            }
          }}
          className="flex items-center gap-1.5"
        >
          <input
            type="text"
            placeholder="Type into page..."
            className="flex-1 rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-[13px] text-ink placeholder:text-primary-400 focus:border-accent-500 focus:outline-none"
          />
          <Button type="submit" variant="outline" size="sm" className="h-7 px-2 text-[11px]">Type</Button>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => actionMutation.mutate({ action: 'press', key: 'Enter' })}>↵</Button>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => actionMutation.mutate({ action: 'press', key: 'Tab' })}>⇥</Button>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => actionMutation.mutate({ action: 'press', key: 'Escape' })}>Esc</Button>
        </form>
      </div>

      {/* Agent handoff — compact */}
      <div className="border-t border-accent-200/50 bg-accent-50/30 px-2 py-1.5 shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); handleHandoff() }} className="flex items-center gap-1.5">
          <HugeiconsIcon icon={AiChat02Icon} size={14} className="text-accent-500 shrink-0" />
          <input
            type="text"
            value={agentPrompt}
            onChange={(e) => setAgentPrompt(e.target.value)}
            placeholder="Tell agent what to do..."
            className="flex-1 rounded-lg border border-accent-200 bg-surface px-2.5 py-1 text-[13px] text-ink placeholder:text-primary-400 focus:border-accent-500 focus:outline-none"
          />
          <Button type="submit" disabled={handingOff} className="h-7 gap-1 bg-accent-500 hover:bg-accent-400 text-[11px] px-2.5" size="sm">
            {handingOff ? <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" /> : <HugeiconsIcon icon={SentIcon} size={12} />}
            Hand Off
          </Button>
        </form>
      </div>
    </div>
  )
}
