import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Cancel01Icon,
  GlobeIcon,
  AiChat02Icon,
  SentIcon,
  ComputerTerminal01Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type BrowserState = {
  running: boolean
  url: string
  title: string
}

export function LocalBrowser() {
  const navigateTo = useNavigate()
  const [status, setStatus] = useState<BrowserState>({ running: false, url: '', title: '' })
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)
  const [closing, setClosing] = useState(false)
  const [agentPrompt, setAgentPrompt] = useState('')
  const [handingOff, setHandingOff] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll stream server for status + thumbnail
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:9223', { signal: AbortSignal.timeout(2000) })
      if (!res.ok) { setStatus({ running: false, url: '', title: '' }); return }
      const data = await res.json() as Record<string, unknown>
      const running = Boolean(data.running)
      const url = String(data.url || '')
      const title = String(data.title || '')
      setStatus({ running, url, title })
      if (url && !document.activeElement?.classList.contains('url-input')) {
        setUrlInput(url)
      }

      // Get thumbnail screenshot
      if (running) {
        const ssRes = await fetch('http://localhost:9223', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'screenshot' }),
          signal: AbortSignal.timeout(3000),
        })
        if (ssRes.ok) {
          const ssData = await ssRes.json() as Record<string, unknown>
          if (ssData.screenshot) setThumbnail(String(ssData.screenshot))
        }
      }
    } catch {
      setStatus({ running: false, url: '', title: '' })
    }
  }, [])

  useEffect(() => {
    pollStatus()
    pollRef.current = setInterval(pollStatus, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [pollStatus])

  // Send action to stream server
  const sendAction = useCallback(async (action: string, params?: Record<string, unknown>) => {
    try {
      const res = await fetch('http://localhost:9223', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
        signal: AbortSignal.timeout(10000),
      })
      return res.ok ? await res.json() : null
    } catch { return null }
  }, [])

  const handleLaunch = useCallback(async () => {
    setLaunching(true)
    // First ensure stream server is up
    await fetch('/api/browser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stream-start' }),
    }).catch(() => {})
    // Small delay for server startup
    await new Promise(r => setTimeout(r, 1000))
    await sendAction('launch')
    setTimeout(() => { setLaunching(false); pollStatus() }, 2000)
  }, [sendAction, pollStatus])

  const handleClose = useCallback(async () => {
    setClosing(true)
    await sendAction('close')
    setStatus({ running: false, url: '', title: '' })
    setThumbnail(null)
    setClosing(false)
  }, [sendAction])

  const handleNavigate = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    let url = urlInput.trim()
    if (!url) return
    if (!url.match(/^https?:\/\//)) url = `https://${url}`
    await sendAction('navigate', { url })
    setTimeout(pollStatus, 500)
  }, [urlInput, sendAction, pollStatus])

  // Agent handoff
  async function handleHandoff() {
    if (!agentPrompt.trim() && !status.url) return
    setHandingOff(true)
    try {
      const content = await sendAction('content') as { url?: string; title?: string; text?: string } | null
      const instruction = agentPrompt.trim() || 'Help me with this page.'
      const contextMsg = [
        `🌐 **Browser Handoff**`,
        `**URL:** ${content?.url || status.url}`,
        `**Page:** ${content?.title || status.title}`,
        '', `**Task:** ${instruction}`, '',
        `<page_content>`, (content?.text || '').slice(0, 4000), `</page_content>`, '',
        `Control the browser: POST http://localhost:9223 with JSON body { action, ...params }. Actions: navigate(url), click(x,y), type(text), press(key), scroll(direction), back, forward, refresh, content, screenshot.`,
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

  // ── Not running — launch screen ─────────────────────────────
  if (!status.running && !launching) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
        <div className="flex size-20 items-center justify-center rounded-2xl bg-accent-500/10">
          <HugeiconsIcon icon={GlobeIcon} size={40} strokeWidth={1.5} className="text-accent-500" />
        </div>
        <div className="text-center max-w-lg">
          <h2 className="text-2xl font-semibold text-ink">Browser</h2>
          <p className="mt-3 text-sm text-primary-500 leading-relaxed">
            Launch a real Chromium window. Browse any site, log in to your accounts, then hand control to your AI agent.
          </p>
        </div>
        <Button onClick={handleLaunch} size="lg" className="gap-2.5 px-6">
          <HugeiconsIcon icon={ComputerTerminal01Icon} size={18} /> Launch Browser
        </Button>
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

  // ── Launching ────────────────────────────────────────────────
  if (launching) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <HugeiconsIcon icon={Loading03Icon} size={32} className="animate-spin text-accent-500" />
        <p className="text-sm text-primary-500">Launching Chromium...</p>
        <p className="text-xs text-primary-400">A browser window will open on your desktop</p>
      </div>
    )
  }

  // ── Running — control panel ──────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-primary-200 bg-primary-50/80 px-4 py-3 shrink-0">
        <div className="flex size-8 items-center justify-center rounded-lg bg-green-500/15">
          <div className="size-2.5 rounded-full bg-green-500 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink truncate">{status.title || 'Browser Active'}</p>
          <p className="text-[11px] text-primary-500 truncate">{status.url || 'about:blank'}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClose}
          disabled={closing}
          className="h-7 px-2.5 text-[11px] text-primary-500 hover:text-red-500 hover:border-red-300"
        >
          {closing ? <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" /> : <HugeiconsIcon icon={Cancel01Icon} size={12} />}
          Close
        </Button>
      </div>

      {/* URL bar */}
      <form onSubmit={handleNavigate} className="flex items-center gap-2 border-b border-primary-200 bg-primary-100/40 px-4 py-2 shrink-0">
        <HugeiconsIcon icon={GlobeIcon} size={14} className="text-primary-400 shrink-0" />
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Enter URL and press Enter..."
          className="url-input flex-1 bg-transparent text-[13px] text-ink placeholder:text-primary-400 focus:outline-none"
        />
        <Button type="submit" variant="outline" size="sm" className="h-6 px-2 text-[10px]">
          <HugeiconsIcon icon={ArrowRight01Icon} size={11} /> Go
        </Button>
      </form>

      {/* Live thumbnail + info */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {/* Thumbnail */}
        <div className="rounded-xl border border-primary-200 overflow-hidden shadow-sm bg-white">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt="Browser screenshot"
              className="w-full object-contain"
            />
          ) : (
            <div className="flex h-48 items-center justify-center bg-primary-50">
              <p className="text-xs text-primary-400">Waiting for screenshot...</p>
            </div>
          )}
        </div>

        {/* Status info */}
        <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="size-2 rounded-full bg-green-500" />
            <span className="text-xs font-medium text-ink uppercase tracking-wider">Browser Window Active</span>
          </div>
          <p className="text-[13px] text-primary-600 leading-relaxed">
            The browser is running in a separate window on your desktop. Log in to any site, navigate where you need, then use the handoff below to give your agent control.
          </p>
          <div className="mt-3 flex gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-medium text-green-700">
              ✓ Real browser — full compatibility
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-medium text-blue-700">
              ✓ Session persists after handoff
            </span>
          </div>
        </div>
      </div>

      {/* Agent handoff */}
      <div className="border-t border-primary-200 bg-primary-50/80 px-4 py-3 shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); handleHandoff() }} className="flex items-center gap-2">
          <HugeiconsIcon icon={AiChat02Icon} size={16} className="text-accent-500 shrink-0" />
          <input
            type="text"
            value={agentPrompt}
            onChange={(e) => setAgentPrompt(e.target.value)}
            placeholder="Tell the agent what to do with this page..."
            className="flex-1 rounded-lg border border-primary-200 bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-primary-400 focus:border-accent-500 focus:outline-none"
          />
          <Button type="submit" disabled={handingOff} className="gap-1.5 bg-accent-500 hover:bg-accent-400 px-4" size="sm">
            {handingOff ? <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" /> : <HugeiconsIcon icon={SentIcon} size={14} />}
            Hand to Agent
          </Button>
        </form>
      </div>
    </div>
  )
}
