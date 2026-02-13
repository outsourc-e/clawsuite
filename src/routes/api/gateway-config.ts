import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const Route = createFileRoute('/api/gateway-config')({
  server: {
    handlers: {
      // GET: return current gateway config (non-sensitive)
      GET: async () => {
        try {
          const url = process.env.CLAWDBOT_GATEWAY_URL?.trim() || 'ws://127.0.0.1:18789'
          const hasToken = Boolean(process.env.CLAWDBOT_GATEWAY_TOKEN?.trim())
          return json({ ok: true, url, hasToken })
        } catch (err) {
          return json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          )
        }
      },

      // POST: update gateway URL and/or token in .env file
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            url?: string
            token?: string
          }

          const envPath = join(process.cwd(), '.env')
          let envContent = ''

          try {
            envContent = await readFile(envPath, 'utf-8')
          } catch {
            // .env doesn't exist — create from .env.example or empty
            try {
              envContent = await readFile(join(process.cwd(), '.env.example'), 'utf-8')
            } catch {
              envContent = ''
            }
          }

          // Update or add CLAWDBOT_GATEWAY_URL
          if (body.url !== undefined) {
            if (envContent.match(/^CLAWDBOT_GATEWAY_URL=/m)) {
              envContent = envContent.replace(
                /^CLAWDBOT_GATEWAY_URL=.*/m,
                `CLAWDBOT_GATEWAY_URL=${body.url}`,
              )
            } else {
              envContent += `\nCLAWDBOT_GATEWAY_URL=${body.url}`
            }
            // Also update process.env so it takes effect without restart
            process.env.CLAWDBOT_GATEWAY_URL = body.url
          }

          // Update or add CLAWDBOT_GATEWAY_TOKEN
          if (body.token !== undefined) {
            if (envContent.match(/^CLAWDBOT_GATEWAY_TOKEN=/m)) {
              envContent = envContent.replace(
                /^CLAWDBOT_GATEWAY_TOKEN=.*/m,
                `CLAWDBOT_GATEWAY_TOKEN=${body.token}`,
              )
            } else {
              envContent += `\nCLAWDBOT_GATEWAY_TOKEN=${body.token}`
            }
            process.env.CLAWDBOT_GATEWAY_TOKEN = body.token
          }

          await writeFile(envPath, envContent, 'utf-8')

          return json({ ok: true, needsRestart: true })
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
