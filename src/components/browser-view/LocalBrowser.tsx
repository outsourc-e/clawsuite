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
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type BrowserStatus = {
  running: boolean
  url: string
  title: string
}

export function LocalBrowser() {
  const navigateTo = useNavigate()
  const imgRef = useRef<HTMLImageElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState<BrowserStatus>({ running: false, url: '', title: '' })
  const [frame, setFrame] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [launching, setLaunching] = useState(false)
  const [agentPrompt, setAgentPrompt] = useState('')
  const [handingOff, setHandingOff] = useState(false)

  // Connect WebSocket
  const connectWs = useCallback((port: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(`ws://localhost:${port}`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => { setConnected(false); wsRef.current = null }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'frame') {
          setFrame(msg.data)
        } else if (msg.type === 'state') {
          setStatus({ running: msg.running, url: msg.url || '', title: msg.title || '' })
          if (msg.url && !document.activeElement?.classList.contains('url-input')) {
            setUrlInput(msg.url)
          }
        }
      } catch {}
    }
  }, [])

  // Start stream server + connect on mount
  useEffect(() => {
    fetch('/api/browser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stream-start' }),
    })
      .then((r) => r.json())
      .then((data: any) => {
        if (data.ok) connectWs(data.port)
      })
      .catch(() => {})

    return () => {
      wsRef.current?.close()
    }
  }, [connectWs])

  // Send action over WebSocket
  const send = useCallback((action: string, params?: Record<string, unknown>) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action, ...params }))
    }
  }, [])

  // Launch browser
  const handleLaunch = useCallback(() => {
    setLaunching(true)
    send('launch')
    // The 'state' message will update status.running
    setTimeout(() => setLaunching(false), 3000)
  }, [send])

  // Navigate
  const handleNavigate = useCallback((e?: React.FormEvent, url?: string) => {
    e?.preventDefault()
    const target = url || urlInput.trim()
    if (!target) return
    send('navigate', { url: target })
  }, [urlInput, send])

  // Click on viewport
  const handleClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) * (1280 / rect.width))
    const y = Math.round((e.clientY - rect.top) * (800 / rect.height))
    send('click', { x, y })
  }, [send])

  // Scroll on viewport
  const handleScroll = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    send('scroll', { direction: e.deltaY > 0 ? 'down' : 'up' })
  }, [send])

  // Keyboard → CDP forwarding
  const getModifiers = (e: React.KeyboardEvent) => {
    let m = 0
    if (e.altKey) m |= 1
    if (e.ctrlKey) m |= 2
    if (e.metaKey) m |= 4
    if (e.shiftKey) m |= 8
    return m
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Don't capture if URL bar or agent input is focused
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    e.preventDefault()
    send('keydown', { key: e.key, code: e.code, keyCode: e.keyCode, modifiers: getModifiers(e) })
  }, [send])

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    e.preventDefault()
    send('keyup', { key: e.key, code: e.code, keyCode: e.keyCode, modifiers: getModifiers(e) })
  }, [send])

  // Agent handoff
  async function handleHandoff() {
    if (!agentPrompt.trim() && !status.url) return
    setHandingOff(true)
    try {
      // Get page content via HTTP (stream server also has HTTP endpoint)
      const res = await fetch('http://localhost:9223', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'content' }),
      })
      const content = await res.json() as { url?: string; title?: string; text?: string }
      const instruction = agentPrompt.trim() || 'Help me with this page.'
      const contextMsg = [
        `🌐 **Browser Handoff**`,
        `**URL:** ${content.url || status.url}`,
        `**Page:** ${content.title || status.title}`,
        '', `**Task:** ${instruction}`, '',
        `<page_content>`, (content.text || '').slice(0, 4000), `</page_content>`, '',
        `Control the browser: POST http://localhost:9223 with JSON body { action, ...params }. Actions: navigate(url), click(x,y), type(text), press(key), scroll(direction), back, forward, refresh, content.`,
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
  if (!status.running) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
        <div className="flex size-20 items-center justify-center rounded-2xl bg-accent-500/10">
          <HugeiconsIcon icon={GlobeIcon} size={40} strokeWidth={1.5} className="text-accent-500" />
        </div>
        <div className="text-center max-w-lg">
          <h2 className="text-2xl font-semibold text-ink">Browser</h2>
          <p className="mt-3 text-sm text-primary-500 leading-relaxed">
            A real Chromium browser running locally. Browse any site, log in, then hand control to your AI agent. Streams in real-time via WebSocket.
          </p>
        </div>
        <Button onClick={handleLaunch} disabled={launching} size="lg" className="gap-2.5 px-6">
          {launching ? (
            <><HugeiconsIcon icon={Loading03Icon} size={18} className="animate-spin" /> Starting...</>
          ) : (
            <><HugeiconsIcon icon={ComputerTerminal01Icon} size={18} /> Launch Browser</>
          )}
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
        {!connected && (
          <p className="text-xs text-amber-500 flex items-center gap-1">
            <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" /> Connecting to stream server...
          </p>
        )}
      </div>
    )
  }

  // ── Running — streaming browser ─────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-primary-200 bg-primary-100/60 px-2 py-1.5 shrink-0">
        <button type="button" onClick={() => send('back')} className="rounded-md p-1.5 text-primary-500 hover:bg-primary-200/80 transition-colors" title="Back">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
        </button>
        <button type="button" onClick={() => send('forward')} className="rounded-md p-1.5 text-primary-500 hover:bg-primary-200/80 transition-colors" title="Forward">
          <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
        </button>
        <button type="button" onClick={() => send('refresh')} className="rounded-md p-1.5 text-primary-500 hover:bg-primary-200/80 transition-colors" title="Refresh">
          <HugeiconsIcon icon={Refresh01Icon} size={14} strokeWidth={2} />
        </button>

        <form onSubmit={(e) => handleNavigate(e)} className="flex-1 mx-1.5">
          <div className="relative">
            <HugeiconsIcon icon={GlobeIcon} size={13} strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-400" />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Search or enter URL..."
              className="url-input w-full rounded-full border border-primary-200/80 bg-surface pl-8 pr-3 py-[5px] text-[13px] text-ink placeholder:text-primary-400 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-500/20 shadow-sm"
            />
          </div>
        </form>

        <div className={cn('size-2 rounded-full shrink-0', connected ? 'bg-green-500' : 'bg-amber-500 animate-pulse')} title={connected ? 'Connected' : 'Reconnecting'} />

        <button type="button" onClick={() => send('close')} className="rounded-md p-1.5 text-primary-400 hover:bg-red-100 hover:text-red-500 transition-colors ml-0.5" title="Close">
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Viewport — click to focus, then type directly */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        className="flex-1 min-h-0 bg-white relative overflow-hidden outline-none"
        tabIndex={0}
        onWheel={handleScroll}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
      >
        {frame ? (
          <img
            ref={imgRef}
            src={frame}
            alt=""
            className="w-full h-full object-contain object-top cursor-default select-none"
            onClick={(e) => {
              // Focus viewport for keyboard capture + send click coords
              ;(e.currentTarget.parentElement as HTMLElement)?.focus()
              handleClick(e)
            }}
            draggable={false}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
            <HugeiconsIcon icon={Loading03Icon} size={24} className="animate-spin text-accent-500" />
            <p className="text-sm text-primary-400">Loading browser...</p>
          </div>
        )}
      </div>

      {/* Agent handoff */}
      <div className="border-t border-primary-200 bg-primary-50/80 px-2 py-1.5 shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); handleHandoff() }} className="flex items-center gap-1.5">
          <HugeiconsIcon icon={AiChat02Icon} size={14} className="text-accent-500 shrink-0" />
          <input
            type="text"
            value={agentPrompt}
            onChange={(e) => setAgentPrompt(e.target.value)}
            placeholder="Tell agent what to do..."
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
