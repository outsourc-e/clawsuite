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
} from '@hugeicons/core-free-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type ProxyState = {
  started: boolean
  proxyUrl: string
  iframeSrc: string
  currentUrl: string
}

async function browserApi(action: string, params?: Record<string, unknown>) {
  const res = await fetch('/api/browser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  })
  return res.json()
}

export function LocalBrowser() {
  const navigateTo = useNavigate()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [proxyState, setProxyState] = useState<ProxyState>({
    started: false, proxyUrl: '', iframeSrc: '', currentUrl: '',
  })
  const [urlInput, setUrlInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [agentPrompt, setAgentPrompt] = useState('')
  const [handingOff, setHandingOff] = useState(false)

  // Start proxy on mount
  useEffect(() => {
    browserApi('proxy-start').then((data: any) => {
      if (data.ok) {
        setProxyState((s) => ({ ...s, started: true, proxyUrl: data.url }))
      }
    }).catch(() => {})
  }, [])

  const handleNavigate = useCallback(
    async (url?: string) => {
      const target = url || urlInput.trim()
      if (!target) return
      setLoading(true)

      try {
        const data = await browserApi('proxy-navigate', { url: target }) as any
        if (data.ok) {
          setProxyState((s) => ({
            ...s,
            iframeSrc: data.iframeSrc,
            currentUrl: data.url,
          }))
          setUrlInput(data.url)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    },
    [urlInput],
  )

  const handleIframeLoad = useCallback(() => {
    setLoading(false)
  }, [])

  async function handleHandoff() {
    if (!agentPrompt.trim() && !proxyState.currentUrl) return
    setHandingOff(true)
    try {
      const instruction = agentPrompt.trim() || 'Help me with this page.'
      const contextMsg = [
        `🌐 **Browser Handoff**`,
        `**URL:** ${proxyState.currentUrl}`,
        '', `**Task:** ${instruction}`, '',
        `The user has a browser session open. You can control it via the Playwright API at POST /api/browser (actions: navigate, click, type, press, scroll, back, forward, refresh, content, screenshot).`,
      ].join('\n')

      const sendRes = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey: '', friendlyId: 'new', message: contextMsg }),
      })
      const result = await sendRes.json() as { friendlyId?: string }
      setAgentPrompt('')
      if (result.friendlyId) {
        void navigateTo({ to: '/chat/$sessionKey', params: { sessionKey: result.friendlyId } })
      }
    } catch {} finally {
      setHandingOff(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chrome-like toolbar */}
      <div className="flex items-center gap-1 border-b border-primary-200 bg-primary-100/60 px-2 py-1.5 shrink-0">
        {/* Nav buttons */}
        <button
          type="button"
          onClick={() => iframeRef.current?.contentWindow?.history.back()}
          className="rounded-md p-1.5 text-primary-500 hover:bg-primary-200/80 transition-colors"
          title="Back"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => iframeRef.current?.contentWindow?.history.forward()}
          className="rounded-md p-1.5 text-primary-500 hover:bg-primary-200/80 transition-colors"
          title="Forward"
        >
          <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (iframeRef.current) iframeRef.current.src = iframeRef.current.src
          }}
          className="rounded-md p-1.5 text-primary-500 hover:bg-primary-200/80 transition-colors"
          title="Refresh"
        >
          <HugeiconsIcon icon={Refresh01Icon} size={14} strokeWidth={2} />
        </button>

        {/* URL bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleNavigate() }}
          className="flex-1 mx-1.5"
        >
          <div className="relative">
            <HugeiconsIcon
              icon={loading ? Loading03Icon : GlobeIcon}
              size={13}
              strokeWidth={1.5}
              className={cn(
                'absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-400',
                loading && 'animate-spin text-accent-500',
              )}
            />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Search or enter URL..."
              className={cn(
                'w-full rounded-full border border-primary-200/80 bg-surface pl-8 pr-3 py-[5px] text-[13px] text-ink',
                'placeholder:text-primary-400',
                'focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-500/20',
                'shadow-sm',
              )}
            />
          </div>
        </form>
      </div>

      {/* iframe viewport — real interactive browser */}
      <div className="flex-1 min-h-0 bg-white relative">
        {proxyState.iframeSrc ? (
          <iframe
            ref={iframeRef}
            src={proxyState.iframeSrc}
            onLoad={handleIframeLoad}
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
            title="Browser"
          />
        ) : (
          /* Landing — quick links */
          <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-accent-500/10">
              <HugeiconsIcon icon={GlobeIcon} size={36} strokeWidth={1.5} className="text-accent-500" />
            </div>
            <p className="text-lg font-medium text-ink">Where to?</p>
            <div className="grid grid-cols-4 gap-3 max-w-lg">
              {[
                { name: 'Google', url: 'https://google.com', icon: '🔍' },
                { name: 'X', url: 'https://x.com', icon: '𝕏' },
                { name: 'GitHub', url: 'https://github.com', icon: '🐙' },
                { name: 'ChatGPT', url: 'https://chat.openai.com', icon: '🤖' },
                { name: 'YouTube', url: 'https://youtube.com', icon: '▶️' },
                { name: 'Reddit', url: 'https://reddit.com', icon: '🟠' },
                { name: 'LinkedIn', url: 'https://linkedin.com', icon: '💼' },
                { name: 'Gmail', url: 'https://mail.google.com', icon: '📧' },
              ].map((site) => (
                <button
                  key={site.url}
                  type="button"
                  onClick={() => { setUrlInput(site.url); handleNavigate(site.url) }}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50/50 p-3 hover:bg-primary-100 hover:border-primary-300 transition-all"
                >
                  <span className="text-xl">{site.icon}</span>
                  <span className="text-[11px] font-medium text-primary-700">{site.name}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-primary-400 mt-2">
              Browse, log in, then hand control to your AI agent
            </p>
          </div>
        )}

        {/* Loading overlay */}
        {loading && proxyState.iframeSrc && (
          <div className="absolute inset-0 bg-surface/50 flex items-center justify-center pointer-events-none z-10">
            <HugeiconsIcon icon={Loading03Icon} size={28} className="animate-spin text-accent-500" />
          </div>
        )}
      </div>

      {/* Agent handoff bar */}
      <div className="border-t border-primary-200 bg-primary-50/80 px-2 py-1.5 shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); handleHandoff() }} className="flex items-center gap-1.5">
          <HugeiconsIcon icon={AiChat02Icon} size={14} className="text-accent-500 shrink-0" />
          <input
            type="text"
            value={agentPrompt}
            onChange={(e) => setAgentPrompt(e.target.value)}
            placeholder="Tell agent what to do on this page..."
            className="flex-1 rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-[13px] text-ink placeholder:text-primary-400 focus:border-accent-500 focus:outline-none"
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
