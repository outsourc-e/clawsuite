import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  launchBrowser,
  closeBrowser,
  navigate,
  clickAt,
  typeText,
  pressKey,
  goBack,
  goForward,
  refresh,
  scrollPage,
  getScreenshot,
  getPageContent,
  cdpMouseClick,
} from '../../server/browser-session'

export const Route = createFileRoute('/api/browser')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
          const action = typeof body.action === 'string' ? body.action.trim() : ''

          switch (action) {
            case 'launch': {
              const state = await launchBrowser()
              return json({ ok: true, ...state })
            }

            case 'close': {
              await closeBrowser()
              return json({ ok: true, running: false })
            }

            case 'navigate': {
              const url = typeof body.url === 'string' ? body.url.trim() : ''
              if (!url) return json({ error: 'url is required' }, { status: 400 })
              const state = await navigate(url)
              return json({ ok: true, ...state })
            }

            case 'click': {
              const x = typeof body.x === 'number' ? body.x : 0
              const y = typeof body.y === 'number' ? body.y : 0
              const state = await cdpMouseClick(x, y)
              return json({ ok: true, ...state })
            }

            case 'type': {
              const text = typeof body.text === 'string' ? body.text : ''
              const submit = body.submit === true
              const state = await typeText(text, submit)
              return json({ ok: true, ...state })
            }

            case 'press': {
              const key = typeof body.key === 'string' ? body.key : ''
              if (!key) return json({ error: 'key is required' }, { status: 400 })
              const state = await pressKey(key)
              return json({ ok: true, ...state })
            }

            case 'back': {
              const state = await goBack()
              return json({ ok: true, ...state })
            }

            case 'forward': {
              const state = await goForward()
              return json({ ok: true, ...state })
            }

            case 'refresh': {
              const state = await refresh()
              return json({ ok: true, ...state })
            }

            case 'scroll': {
              const direction = body.direction === 'up' ? 'up' : 'down'
              const amount = typeof body.amount === 'number' ? body.amount : 400
              const state = await scrollPage(direction, amount)
              return json({ ok: true, ...state })
            }

            case 'screenshot': {
              const state = await getScreenshot()
              return json({ ok: true, ...state })
            }

            case 'content': {
              const content = await getPageContent()
              return json({ ok: true, ...content })
            }

            default:
              return json({ error: `Unknown action: ${action}` }, { status: 400 })
          }
        } catch (err) {
          return json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          )
        }
      },
    },
  },
})
