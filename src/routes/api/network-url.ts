import { networkInterfaces } from 'node:os'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

function getNetworkUrl(port: number): { url: string; source: 'tailscale' | 'lan' | 'localhost' } {
  const nets = networkInterfaces()
  let tailscaleIp: string | null = null
  let lanIp: string | null = null

  for (const iface of Object.values(nets)) {
    if (!iface) continue
    for (const net of iface) {
      if (net.family !== 'IPv4' || net.internal) continue
      // Tailscale IPs are always in the 100.64.0.0/10 range
      if (net.address.startsWith('100.')) {
        tailscaleIp = net.address
      } else if (!lanIp) {
        lanIp = net.address
      }
    }
  }

  if (tailscaleIp) {
    return { url: `http://${tailscaleIp}:${port}`, source: 'tailscale' }
  }
  if (lanIp) {
    return { url: `http://${lanIp}:${port}`, source: 'lan' }
  }
  return { url: `http://localhost:${port}`, source: 'localhost' }
}

export const Route = createFileRoute('/api/network-url')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const port = parseInt(new URL(request.url).searchParams.get('port') ?? '3000', 10)
        const result = getNetworkUrl(Number.isFinite(port) ? port : 3000)
        return json({ ok: true, ...result })
      },
    },
  },
})
