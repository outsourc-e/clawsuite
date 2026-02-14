import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'

type VersionCheckResult = {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
}

let versionCache: { checkedAt: number; result: VersionCheckResult } | null = null
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes

async function checkOpenClawVersion(): Promise<VersionCheckResult> {
  const now = Date.now()
  if (versionCache && now - versionCache.checkedAt < CACHE_TTL_MS) {
    return versionCache.result
  }

  let currentVersion = 'unknown'

  // Try to get version from gateway status RPC
  try {
    const statusResult = await gatewayRpc<Record<string, unknown>>('status')
    if (typeof statusResult?.version === 'string') {
      currentVersion = statusResult.version
    }
  } catch {
    // fallback: try reading from the openclaw CLI
  }

  if (currentVersion === 'unknown') {
    try {
      const { execSync } = await import('node:child_process')
      currentVersion = execSync('openclaw --version', {
        timeout: 5_000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()
    } catch {
      // Can't determine version
    }
  }

  // Check npm registry for latest version
  let latestVersion = currentVersion
  try {
    const res = await fetch('https://registry.npmjs.org/openclaw/latest', {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    })
    if (res.ok) {
      const data = (await res.json()) as { version?: string }
      if (data.version) latestVersion = data.version
    }
  } catch {
    // Can't check registry — assume up to date
  }

  const updateAvailable =
    currentVersion !== 'unknown' &&
    latestVersion !== currentVersion &&
    latestVersion !== 'unknown'

  const result: VersionCheckResult = {
    currentVersion,
    latestVersion,
    updateAvailable,
  }

  versionCache = { checkedAt: now, result }
  return result
}

export const Route = createFileRoute('/api/openclaw-update')({
  server: {
    handlers: {
      // GET: check for updates
      GET: async () => {
        try {
          const result = await checkOpenClawVersion()
          return json({ ok: true, ...result })
        } catch (err) {
          return json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          )
        }
      },

      // POST: trigger the update
      POST: async () => {
        try {
          // Use gateway's update.run action
          const result = await gatewayRpc<{ ok: boolean; error?: string }>(
            'update.run',
            {},
          )

          // Clear version cache so next check picks up new version
          versionCache = null

          if (result?.ok === false) {
            return json({ ok: false, error: result.error || 'Update failed' })
          }

          return json({ ok: true, message: 'OpenClaw update initiated. Gateway will restart.' })
        } catch (err) {
          // If the gateway disconnected (because it restarted), that's actually success
          const errMsg = err instanceof Error ? err.message : String(err)
          if (errMsg.includes('close') || errMsg.includes('disconnect') || errMsg.includes('ECONNRESET')) {
            versionCache = null
            return json({ ok: true, message: 'OpenClaw is restarting with the update.' })
          }
          return json(
            { ok: false, error: errMsg },
            { status: 500 },
          )
        }
      },
    },
  },
})
