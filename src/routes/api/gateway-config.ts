import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { gatewayReconnect } from '../../server/gateway'
import { isAuthenticated } from '../../server/auth-middleware'
import { invalidateCache } from '../../server/providers'

function sanitizeEnvValue(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`)
  }

  const sanitized = value
    .replace(/[\r\n]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()

  if (sanitized.length > 500) {
    throw new Error(`${field} is too long`)
  }

  return sanitized
}

function sanitizeGatewayUrl(value: unknown): string {
  const sanitized = sanitizeEnvValue(value, 'url')

  if (!sanitized) return sanitized

  let parsed: URL
  try {
    parsed = new URL(sanitized)
  } catch {
    throw new Error('Invalid gateway URL')
  }

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('Gateway URL must use ws:// or wss://')
  }

  return sanitized
}

function sanitizeProviderName(value: unknown): string {
  const sanitized = sanitizeEnvValue(value, 'provider')
    .toLowerCase()
    .replace(/\s+/g, '-')

  if (!sanitized) {
    throw new Error('Provider name is required')
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(sanitized)) {
    throw new Error('Provider name contains invalid characters')
  }
  return sanitized
}

function sanitizeApiKey(value: unknown): string {
  const sanitized = sanitizeEnvValue(value, 'apiKey')
  if (!sanitized) {
    throw new Error('API key is required')
  }
  return sanitized
}

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
          const message = err instanceof Error ? err.message : String(err)
          const isValidationError =
            message === 'Invalid gateway URL' ||
            message === 'Gateway URL must use ws:// or wss://' ||
            message === 'url must be a string' ||
            message === 'token must be a string' ||
            message === 'url is too long' ||
            message === 'token is too long'
          return json(
            { ok: false, error: message },
            { status: isValidationError ? 400 : 500 },
          )
        }
      },

      // POST: update gateway URL and/or token in .env file
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const rawBody = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const action =
            typeof rawBody.action === 'string' ? rawBody.action.trim().toLowerCase() : ''

          if (action === 'add-provider') {
            const provider = sanitizeProviderName(rawBody.provider)
            const apiKey = sanitizeApiKey(rawBody.apiKey)

            const configDir = join(homedir(), '.openclaw')
            const configPath = join(configDir, 'openclaw.json')
            let config: Record<string, unknown> = {}

            try {
              const rawConfig = await readFile(configPath, 'utf-8')
              const parsed = JSON.parse(rawConfig) as unknown
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                config = parsed as Record<string, unknown>
              }
            } catch (error) {
              const code = (error as NodeJS.ErrnoException)?.code
              if (code !== 'ENOENT') {
                throw error
              }
            }

            const auth =
              config.auth && typeof config.auth === 'object' && !Array.isArray(config.auth)
                ? (config.auth as Record<string, unknown>)
                : {}
            const profiles =
              auth.profiles &&
              typeof auth.profiles === 'object' &&
              !Array.isArray(auth.profiles)
                ? (auth.profiles as Record<string, unknown>)
                : {}
            profiles[`${provider}:default`] = { provider, apiKey }
            auth.profiles = profiles
            config.auth = auth

            const models =
              config.models && typeof config.models === 'object' && !Array.isArray(config.models)
                ? (config.models as Record<string, unknown>)
                : {}
            const providers =
              models.providers &&
              typeof models.providers === 'object' &&
              !Array.isArray(models.providers)
                ? (models.providers as Record<string, unknown>)
                : {}
            const existingProvider =
              providers[provider] &&
              typeof providers[provider] === 'object' &&
              !Array.isArray(providers[provider])
                ? (providers[provider] as Record<string, unknown>)
                : {}
            providers[provider] = existingProvider
            models.providers = providers
            config.models = models

            await mkdir(configDir, { recursive: true })
            await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
            invalidateCache()

            return json({ ok: true, provider })
          }

          const body: { url?: string; token?: string } = {}

          if (Object.prototype.hasOwnProperty.call(rawBody, 'url')) {
            body.url = sanitizeGatewayUrl(rawBody.url)
          }
          if (Object.prototype.hasOwnProperty.call(rawBody, 'token')) {
            body.token = sanitizeEnvValue(rawBody.token, 'token')
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

          // Try to persist to .env (may fail in Docker/read-only containers — that's OK)
          try {
            await writeFile(envPath, envContent, 'utf-8')
          } catch {
            // In-memory env vars are already set above, so connection will still work
          }

          // Force reconnect the gateway client with new credentials
          try {
            await gatewayReconnect()
            return json({ ok: true, connected: true })
          } catch (connErr) {
            return json({
              ok: true,
              connected: false,
              error: `Config saved but connection failed: ${connErr instanceof Error ? connErr.message : String(connErr)}`,
            })
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
