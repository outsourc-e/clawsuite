/**
 * Server-side browser session powered by Playwright.
 * Manages a single Chromium instance with one active page.
 * Provides screenshot streaming, navigation, click, and type operations.
 */

import type { Browser, Page, BrowserContext } from 'playwright'

let browserInstance: Browser | null = null
let contextInstance: BrowserContext | null = null
let pageInstance: Page | null = null
let lastScreenshot: string | null = null
let lastUrl = ''
let lastTitle = ''
let isLaunching = false

const VIEWPORT = { width: 1280, height: 800 }
const SCREENSHOT_TIMEOUT = 10_000
const NAV_TIMEOUT = 30_000

export type BrowserState = {
  running: boolean
  url: string
  title: string
  screenshot: string | null // base64 data URL
}

async function getPlaywright() {
  // Dynamic import so it doesn't break if not installed
  const pw = await import('playwright')
  return pw
}

export async function launchBrowser(): Promise<BrowserState> {
  if (browserInstance && pageInstance) {
    return getState()
  }

  if (isLaunching) {
    // Wait for ongoing launch
    await new Promise((r) => setTimeout(r, 2000))
    return getState()
  }

  isLaunching = true
  try {
    const pw = await getPlaywright()
    browserInstance = await pw.chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    })

    contextInstance = await browserInstance.newContext({
      viewport: VIEWPORT,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    })

    pageInstance = await contextInstance.newPage()
    await pageInstance.goto('about:blank')
    await captureScreenshot()

    return getState()
  } finally {
    isLaunching = false
  }
}

export async function closeBrowser(): Promise<void> {
  if (contextInstance) {
    await contextInstance.close().catch(() => {})
    contextInstance = null
  }
  if (browserInstance) {
    await browserInstance.close().catch(() => {})
    browserInstance = null
  }
  pageInstance = null
  lastScreenshot = null
  lastUrl = ''
  lastTitle = ''
}

export async function navigate(url: string): Promise<BrowserState> {
  if (!pageInstance) await launchBrowser()
  if (!pageInstance) throw new Error('Browser not available')

  // Auto-add https:// if no protocol
  let normalizedUrl = url.trim()
  if (normalizedUrl && !normalizedUrl.match(/^https?:\/\//)) {
    normalizedUrl = `https://${normalizedUrl}`
  }

  await pageInstance.goto(normalizedUrl, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT,
  })

  // Wait a bit for rendering
  await pageInstance.waitForTimeout(500)
  await captureScreenshot()
  return getState()
}

export async function clickAt(x: number, y: number): Promise<BrowserState> {
  if (!pageInstance) throw new Error('Browser not running')
  await pageInstance.mouse.click(x, y)
  await pageInstance.waitForTimeout(300)
  await captureScreenshot()
  return getState()
}

export async function typeText(text: string, submit = false): Promise<BrowserState> {
  if (!pageInstance) throw new Error('Browser not running')
  await pageInstance.keyboard.type(text, { delay: 30 })
  if (submit) {
    await pageInstance.keyboard.press('Enter')
    await pageInstance.waitForTimeout(500)
  }
  await captureScreenshot()
  return getState()
}

export async function pressKey(key: string): Promise<BrowserState> {
  if (!pageInstance) throw new Error('Browser not running')
  await pageInstance.keyboard.press(key)
  await pageInstance.waitForTimeout(300)
  await captureScreenshot()
  return getState()
}

export async function goBack(): Promise<BrowserState> {
  if (!pageInstance) throw new Error('Browser not running')
  await pageInstance.goBack({ timeout: NAV_TIMEOUT }).catch(() => {})
  await pageInstance.waitForTimeout(500)
  await captureScreenshot()
  return getState()
}

export async function goForward(): Promise<BrowserState> {
  if (!pageInstance) throw new Error('Browser not running')
  await pageInstance.goForward({ timeout: NAV_TIMEOUT }).catch(() => {})
  await pageInstance.waitForTimeout(500)
  await captureScreenshot()
  return getState()
}

export async function refresh(): Promise<BrowserState> {
  if (!pageInstance) throw new Error('Browser not running')
  await pageInstance.reload({ timeout: NAV_TIMEOUT }).catch(() => {})
  await pageInstance.waitForTimeout(500)
  await captureScreenshot()
  return getState()
}

export async function scrollPage(direction: 'up' | 'down', amount = 400): Promise<BrowserState> {
  if (!pageInstance) throw new Error('Browser not running')
  const delta = direction === 'down' ? amount : -amount
  await pageInstance.mouse.wheel(0, delta)
  await pageInstance.waitForTimeout(300)
  await captureScreenshot()
  return getState()
}

export async function getScreenshot(): Promise<BrowserState> {
  if (!pageInstance) {
    return { running: false, url: '', title: '', screenshot: null }
  }
  await captureScreenshot()
  return getState()
}

async function captureScreenshot(): Promise<void> {
  if (!pageInstance) return
  try {
    const buffer = await pageInstance.screenshot({
      type: 'jpeg',
      quality: 75,
      timeout: SCREENSHOT_TIMEOUT,
    })
    lastScreenshot = `data:image/jpeg;base64,${buffer.toString('base64')}`
    lastUrl = pageInstance.url()
    lastTitle = await pageInstance.title().catch(() => '')
  } catch {
    // Page might be navigating
  }
}

export async function getPageContent(): Promise<{ url: string; title: string; text: string }> {
  if (!pageInstance) return { url: '', title: '', text: '' }
  const url = pageInstance.url()
  const title = await pageInstance.title().catch(() => '')
  const text = await pageInstance.evaluate(() => {
    // Extract readable text content
    const body = document.body
    if (!body) return ''
    // Remove scripts and styles
    const clone = body.cloneNode(true) as HTMLElement
    clone.querySelectorAll('script, style, noscript, svg').forEach((el) => el.remove())
    return (clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 8000)
  }).catch(() => '')
  return { url, title, text }
}

function getState(): BrowserState {
  return {
    running: !!pageInstance,
    url: lastUrl,
    title: lastTitle,
    screenshot: lastScreenshot,
  }
}
