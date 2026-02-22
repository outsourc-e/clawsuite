import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

export type SystemMetricsResponse = {
  cpu: number
  ramUsed: number
  ramTotal: number
  diskPercent: number
  uptime: number
  gatewayConnected: boolean
}

export type FormattedSystemMetrics = SystemMetricsResponse & {
  cpuLabel: string
  ramLabel: string
  diskLabel: string
  gatewayLabel: string
  uptimeLabel: string
  ramPercent: number
}

function formatGiB(bytes: number): string {
  const gib = bytes / (1024 ** 3)
  if (!Number.isFinite(gib) || gib <= 0) return '0.0GiB'
  return `${gib.toFixed(gib >= 10 ? 0 : 1)}GiB`
}

function formatUptime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const days = Math.floor(safe / 86_400)
  const hours = Math.floor((safe % 86_400) / 3_600)
  const minutes = Math.floor((safe % 3_600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

async function fetchSystemMetrics(): Promise<SystemMetricsResponse> {
  const response = await fetch('/api/system-metrics')
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json() as Promise<SystemMetricsResponse>
}

export function useSystemMetrics() {
  const query = useQuery({
    queryKey: ['system-metrics'],
    queryFn: fetchSystemMetrics,
    refetchInterval: 10_000,
    retry: false,
  })

  const metrics = useMemo<FormattedSystemMetrics | null>(() => {
    if (!query.data) return null
    const ramPercent =
      query.data.ramTotal > 0
        ? Math.max(0, Math.min(100, (query.data.ramUsed / query.data.ramTotal) * 100))
        : 0

    return {
      ...query.data,
      cpuLabel: `${Math.round(query.data.cpu)}%`,
      ramLabel: `${formatGiB(query.data.ramUsed)}/${formatGiB(query.data.ramTotal)}`,
      diskLabel: `${Math.round(query.data.diskPercent)}%`,
      gatewayLabel: query.data.gatewayConnected ? 'Connected' : 'Disconnected',
      uptimeLabel: formatUptime(query.data.uptime),
      ramPercent: Number(ramPercent.toFixed(1)),
    }
  }, [query.data])

  return {
    ...query,
    metrics,
  }
}

