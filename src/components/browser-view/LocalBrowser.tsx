import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Loading03Icon,
  Refresh01Icon,
  Cancel01Icon,
  GlobeIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  SentIcon,
  AiChat02Icon,
} from '@hugeicons/core-free-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
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
  const navigate = useNavigate()
  const [urlInput, setUrlInput] = useState('')
  const [isLaunched, setIsLaunched] = useState(false)
  const [agentPrompt, setAgentPrompt] = useState('')
  const [handingOff, setHandingOff] = useState(false)
  const screenshotRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  // Poll for screenshot updates
  const stateQuery = useQuery<BrowserState>({
    queryKey: ['local-browser', 'state'],
    queryFn: () => browserAction('screenshot'),
    enabled: isLaunched,
    refetchInterval: 2000,
    staleTime: 1000,
  })

  const currentState = stateQuery.data
  const currentUrl = currentState?.url || ''
  const currentTitle = currentState?.title || ''

  // Mutations
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
      setUrlInput(data.url || '')
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

  const isLoading = launchMutation.isPending || navMutation.isPending

  // Handle click on screenshot — map pixel coords to viewport
  const handleScreenshotClick = useCallback(
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

  const handleNavigate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!urlInput.trim()) return
      navMutation.mutate(urlInput.trim())
    },
    [urlInput, navMutation],
  )

  // Not launched yet — show launch screen
  if (!isLaunched) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-accent-500/10">
          <HugeiconsIcon icon={GlobeIcon} size={32} strokeWidth={1.5} className="text-accent-500" />
        </div>
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-ink">Built-in Browser</h2>
          <p className="mt-2 text-sm text-primary-500">
            Browse the web directly in ClawSuite. Click, type, navigate — your AI agent can control it too.
          </p>
        </div>
        <Button
          onClick={() => launchMutation.mutate()}
          disabled={launchMutation.isPending}
          className="gap-2"
        >
          {launchMutation.isPending ? (
            <>
              <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin" />
              Launching...
            </>
          ) : (
            <>
              <HugeiconsIcon icon={GlobeIcon} size={16} />
              Launch Browser
            </>
          )}
        </Button>
        {launchMutation.isError && (
          <p className="text-sm text-red-500">
            {launchMutation.error?.message || 'Failed to launch browser'}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chrome-like toolbar */}
      <div className="flex items-center gap-1.5 border-b border-primary-200 bg-primary-50/80 px-3 py-2">
        {/* Nav buttons */}
        <button
          type="button"
          onClick={() => actionMutation.mutate({ action: 'back' })}
          className="rounded-lg p-1.5 text-primary-500 hover:bg-primary-200 hover:text-primary-700 transition-colors"
          title="Back"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => actionMutation.mutate({ action: 'forward' })}
          className="rounded-lg p-1.5 text-primary-500 hover:bg-primary-200 hover:text-primary-700 transition-colors"
          title="Forward"
        >
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => actionMutation.mutate({ action: 'refresh' })}
          className="rounded-lg p-1.5 text-primary-500 hover:bg-primary-200 hover:text-primary-700 transition-colors"
          title="Refresh"
        >
          <HugeiconsIcon icon={Refresh01Icon} size={16} strokeWidth={2} />
        </button>

        {/* URL bar */}
        <form onSubmit={handleNavigate} className="flex-1 mx-2">
          <div className="relative">
            <input
              type="text"
              value={urlInput || currentUrl}
              onChange={(e) => setUrlInput(e.target.value)}
              onFocus={() => setUrlInput(currentUrl)}
              placeholder="Search or enter URL..."
              className={cn(
                'w-full rounded-xl border border-primary-200 bg-surface px-4 py-1.5 text-sm text-ink',
                'placeholder:text-primary-400',
                'focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30',
                isLoading && 'animate-pulse',
              )}
            />
            {isLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin text-accent-500" />
              </div>
            )}
          </div>
        </form>

        {/* Scroll + Close */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => actionMutation.mutate({ action: 'scroll', direction: 'up' })}
            className="rounded-lg p-1.5 text-primary-500 hover:bg-primary-200 hover:text-primary-700 transition-colors"
            title="Scroll up"
          >
            <HugeiconsIcon icon={ArrowUp01Icon} size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => actionMutation.mutate({ action: 'scroll', direction: 'down' })}
            className="rounded-lg p-1.5 text-primary-500 hover:bg-primary-200 hover:text-primary-700 transition-colors"
            title="Scroll down"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => closeMutation.mutate()}
            className="rounded-lg p-1.5 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors ml-1"
            title="Close browser"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Title bar */}
      {currentTitle && (
        <div className="border-b border-primary-100 bg-primary-25 px-4 py-1">
          <p className="text-xs text-primary-500 truncate">{currentTitle}</p>
        </div>
      )}

      {/* Screenshot viewport */}
      <div
        ref={screenshotRef}
        className="flex-1 min-h-0 overflow-hidden bg-white relative cursor-crosshair"
      >
        {currentState?.screenshot ? (
          <img
            ref={imgRef}
            src={currentState.screenshot}
            alt="Browser viewport"
            className="w-full h-full object-contain object-top"
            onClick={handleScreenshotClick}
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-primary-400">
            <div className="text-center">
              <HugeiconsIcon icon={GlobeIcon} size={40} strokeWidth={1} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Enter a URL to start browsing</p>
            </div>
          </div>
        )}

        {/* Click indicator */}
        {clickMutation.isPending && (
          <div className="absolute inset-0 bg-black/5 flex items-center justify-center pointer-events-none">
            <HugeiconsIcon icon={Loading03Icon} size={24} className="animate-spin text-accent-500" />
          </div>
        )}
      </div>

      {/* Keyboard input bar */}
      <div className="border-t border-primary-200 bg-primary-50/80 px-3 py-2">
        <div className="flex items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const input = e.currentTarget.querySelector('input') as HTMLInputElement
              if (input.value) {
                actionMutation.mutate({ action: 'type', text: input.value, submit: false })
                input.value = ''
              }
            }}
            className="flex flex-1 items-center gap-2"
          >
            <input
              type="text"
              placeholder="Type text into focused element..."
              className="flex-1 rounded-lg border border-primary-200 bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-primary-400 focus:border-accent-500 focus:outline-none"
            />
            <Button type="submit" variant="outline" size="sm">
              Type
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => actionMutation.mutate({ action: 'press', key: 'Enter' })}
            >
              Enter ↵
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => actionMutation.mutate({ action: 'press', key: 'Tab' })}
            >
              Tab ⇥
            </Button>
          </form>
        </div>
      </div>

      {/* Agent handoff bar */}
      <div className="border-t border-accent-200/50 bg-accent-50/30 px-3 py-2">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!agentPrompt.trim() && !currentUrl) return
            setHandingOff(true)

            try {
              // Get page content for context
              const contentRes = await fetch('/api/browser', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'content' }),
              })
              const content = await contentRes.json() as { url: string; title: string; text: string }

              // Build the message with browser context
              const instruction = agentPrompt.trim() || 'Take over this browser session and help me with this page.'
              const contextMsg = [
                `🌐 **Browser Handoff**`,
                `**URL:** ${content.url || currentUrl}`,
                `**Page:** ${content.title || currentTitle}`,
                '',
                `**Task:** ${instruction}`,
                '',
                `<page_content>`,
                (content.text || '').slice(0, 4000),
                `</page_content>`,
                '',
                `The browser is running at \`/api/browser\`. You can control it with POST actions: navigate, click (x,y), type (text), press (key), scroll (direction), back, forward, refresh, content, screenshot.`,
              ].join('\n')

              // Send to chat via the send API
              const sendRes = await fetch('/api/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionKey: '',
                  friendlyId: 'new',
                  message: contextMsg,
                }),
              })
              const sendResult = await sendRes.json() as { ok?: boolean; friendlyId?: string }

              setAgentPrompt('')

              // Navigate to the chat session
              if (sendResult.friendlyId) {
                void navigate({ to: '/chat/$sessionKey', params: { sessionKey: sendResult.friendlyId } })
              } else {
                void navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'new' } })
              }
            } catch {
              // Fallback: just navigate to chat
              void navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'new' } })
            } finally {
              setHandingOff(false)
            }
          }}
          className="flex items-center gap-2"
        >
          <div className="flex items-center gap-1.5 shrink-0">
            <HugeiconsIcon icon={AiChat02Icon} size={16} className="text-accent-500" />
            <span className="text-xs font-medium text-accent-600">Agent</span>
          </div>
          <input
            type="text"
            value={agentPrompt}
            onChange={(e) => setAgentPrompt(e.target.value)}
            placeholder="Tell the agent what to do on this page..."
            className="flex-1 rounded-lg border border-accent-200 bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-primary-400 focus:border-accent-500 focus:outline-none"
          />
          <Button
            type="submit"
            disabled={handingOff}
            className="gap-1.5 bg-accent-500 hover:bg-accent-400"
            size="sm"
          >
            {handingOff ? (
              <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
            ) : (
              <HugeiconsIcon icon={SentIcon} size={14} />
            )}
            Hand to Agent
          </Button>
        </form>
      </div>
    </div>
  )
}
