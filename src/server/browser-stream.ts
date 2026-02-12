/**
 * WebSocket-based browser streaming server.
 * Uses Playwright + CDP screencast to push frames over WebSocket in real-time.
 * Only sends frames when pixels change — no polling, no lag.
 */

import http from 'node:http'
import type { Browser, BrowserContext, Page } from 'playwright'

const WS_PORT = 9223
const VIEWPORT = { width: 1280, height: 800 }

let server: http.Server | null = null
let browser: Browser | null = null
let context: BrowserContext | null = null
let page: Page | null = null
let cdp: any = null
let clients: Set<any> = new Set()
let isLaunching = false
let lastFrame: string | null = null
let currentUrl = ''
let currentTitle = ''

function broadcast(msg: Record<string, unknown>) {
  const data = JSON.stringify(msg)
  for (const ws of clients) {
    try { ws.send(data) } catch {}
  }
}

function broadcastState() {
  broadcast({
    type: 'state',
    url: currentUrl,
    title: currentTitle,
    running: !!page,
  })
}

async function launchBrowserInstance() {
  if (browser || isLaunching) return
  isLaunching = true

  try {
    const pw = await import('playwright')
    browser = await pw.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })

    context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    })

    page = await context.newPage()

    // Track URL changes
    page.on('framenavigated', async (frame) => {
      if (frame === page?.mainFrame()) {
        currentUrl = page.url()
        currentTitle = await page.title().catch(() => '')
        broadcastState()
      }
    })

    // Start CDP screencast — pushes frames only when screen changes
    cdp = await context.newCDPSession(page)
    cdp.on('Page.screencastFrame', (params: { data: string; sessionId: number; metadata: any }) => {
      const frame = `data:image/jpeg;base64,${params.data}`
      lastFrame = frame
      // Push frame to all connected clients
      broadcast({ type: 'frame', data: frame })
      // Ack so Chrome keeps sending
      cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {})
    })

    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 85,
      maxWidth: VIEWPORT.width,
      maxHeight: VIEWPORT.height,
      everyNthFrame: 1,
    })

    await page.goto('about:blank')
    broadcastState()
  } finally {
    isLaunching = false
  }
}

async function closeBrowserInstance() {
  if (cdp) {
    try { await cdp.send('Page.stopScreencast') } catch {}
    cdp = null
  }
  if (context) { await context.close().catch(() => {}); context = null }
  if (browser) { await browser.close().catch(() => {}); browser = null }
  page = null
  lastFrame = null
  currentUrl = ''
  currentTitle = ''
  broadcast({ type: 'closed' })
}

async function handleAction(action: string, params: Record<string, unknown>) {
  if (!page && action !== 'launch') {
    return { error: 'Browser not running' }
  }

  switch (action) {
    case 'launch':
      await launchBrowserInstance()
      return { ok: true }

    case 'close':
      await closeBrowserInstance()
      return { ok: true }

    case 'navigate': {
      let url = String(params.url || '').trim()
      if (!url) return { error: 'url required' }
      if (!url.match(/^https?:\/\//)) url = `https://${url}`
      await page!.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
      currentUrl = page!.url()
      currentTitle = await page!.title().catch(() => '')
      broadcastState()
      return { ok: true, url: currentUrl }
    }

    case 'click': {
      const x = Number(params.x) || 0
      const y = Number(params.y) || 0
      // Use CDP for more reliable clicks
      if (cdp) {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
      } else {
        await page!.mouse.click(x, y)
      }
      await page!.waitForTimeout(150)
      currentUrl = page!.url()
      currentTitle = await page!.title().catch(() => '')
      broadcastState()
      return { ok: true }
    }

    case 'type': {
      const text = String(params.text || '')
      if (cdp) {
        // CDP insertText is instant and works in any focused element
        await cdp.send('Input.insertText', { text })
      } else {
        await page!.keyboard.type(text, { delay: 10 })
      }
      return { ok: true }
    }

    case 'press': {
      const key = String(params.key || '')
      await page!.keyboard.press(key)
      await page!.waitForTimeout(100)
      currentUrl = page!.url()
      currentTitle = await page!.title().catch(() => '')
      broadcastState()
      return { ok: true }
    }

    case 'keydown': {
      const key = String(params.key || '')
      if (cdp) {
        // Map special keys to CDP key identifiers
        const text = key.length === 1 ? key : undefined
        await cdp.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key,
          code: String(params.code || ''),
          text,
          windowsVirtualKeyCode: Number(params.keyCode) || 0,
          nativeVirtualKeyCode: Number(params.keyCode) || 0,
          modifiers: Number(params.modifiers) || 0,
        })
        if (text) {
          await cdp.send('Input.dispatchKeyEvent', {
            type: 'char',
            key,
            code: String(params.code || ''),
            text,
            windowsVirtualKeyCode: Number(params.keyCode) || 0,
            nativeVirtualKeyCode: Number(params.keyCode) || 0,
            modifiers: Number(params.modifiers) || 0,
          })
        }
      } else {
        await page!.keyboard.down(key)
      }
      return { ok: true }
    }

    case 'keyup': {
      const key = String(params.key || '')
      if (cdp) {
        await cdp.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key,
          code: String(params.code || ''),
          windowsVirtualKeyCode: Number(params.keyCode) || 0,
          nativeVirtualKeyCode: Number(params.keyCode) || 0,
          modifiers: Number(params.modifiers) || 0,
        })
      } else {
        await page!.keyboard.up(key)
      }
      return { ok: true }
    }

    case 'scroll': {
      const dy = params.direction === 'up' ? -400 : 400
      if (cdp) {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 400, deltaX: 0, deltaY: dy })
      } else {
        await page!.mouse.wheel(0, dy)
      }
      return { ok: true }
    }

    case 'back':
      await page!.goBack({ timeout: 15000 }).catch(() => {})
      currentUrl = page!.url()
      currentTitle = await page!.title().catch(() => '')
      broadcastState()
      return { ok: true }

    case 'forward':
      await page!.goForward({ timeout: 15000 }).catch(() => {})
      currentUrl = page!.url()
      currentTitle = await page!.title().catch(() => '')
      broadcastState()
      return { ok: true }

    case 'refresh':
      await page!.reload({ timeout: 15000 }).catch(() => {})
      currentUrl = page!.url()
      currentTitle = await page!.title().catch(() => '')
      broadcastState()
      return { ok: true }

    case 'content': {
      const url = page!.url()
      const title = await page!.title().catch(() => '')
      const text = await page!.evaluate(() => {
        const clone = document.body?.cloneNode(true) as HTMLElement
        if (!clone) return ''
        clone.querySelectorAll('script,style,noscript,svg').forEach(el => el.remove())
        return (clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 8000)
      }).catch(() => '')
      return { ok: true, url, title, text }
    }

    default:
      return { error: `Unknown action: ${action}` }
  }
}

export async function startBrowserStream(): Promise<{ port: number }> {
  if (server) return { port: WS_PORT }

  const { WebSocketServer } = await import('ws')

  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      // Simple HTTP endpoint for status/actions (agent handoff uses this)
      if (req.method === 'POST') {
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', async () => {
          try {
            const params = JSON.parse(body)
            const result = await handleAction(params.action, params)
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
            res.end(JSON.stringify(result))
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: String(err) }))
          }
        })
        return
      }

      // Status
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify({ running: !!page, url: currentUrl, title: currentTitle, port: WS_PORT }))
    })

    const wss = new WebSocketServer({ server })

    wss.on('connection', (ws: any) => {
      clients.add(ws)

      // Send current state + last frame immediately
      ws.send(JSON.stringify({ type: 'state', url: currentUrl, title: currentTitle, running: !!page }))
      if (lastFrame) {
        ws.send(JSON.stringify({ type: 'frame', data: lastFrame }))
      }

      ws.on('message', async (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString())
          const result = await handleAction(msg.action, msg)
          ws.send(JSON.stringify({ type: 'result', id: msg.id, ...result }))
        } catch {}
      })

      ws.on('close', () => clients.delete(ws))
    })

    server.listen(WS_PORT, '127.0.0.1', () => {
      resolve({ port: WS_PORT })
    })

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') resolve({ port: WS_PORT })
    })
  })
}
