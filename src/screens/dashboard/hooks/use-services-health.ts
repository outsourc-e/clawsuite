import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

export type ServiceHealthStatus = 'up' | 'down' | 'checking'

export type ServiceHealthItem = {
  name: string
  status: ServiceHealthStatus
  latencyMs?: number
}

type GatewayStatusResponse = {
  ok?: boolean
}

type GatewayNodesResponse = {
  ok?: boolean
  data?: unknown
}

type ServicesHealthProbe = {
  missionControlApi: { status: 'up' | 'down'; latencyMs?: number }
  ollama: { status: 'up' | 'down'; latencyMs?: number }
}

function nowMs() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now())
}

async function timedJsonFetch<T>(url: string): Promise<{
  ok: boolean
  statusCode: number
  latencyMs: number
  data: T | null
}> {
  const startedAt = nowMs()
  try {
    const response = await fetch(url, { method: 'GET' })
    const latencyMs = Math.max(1, Math.round(nowMs() - startedAt))
    let data: T | null = null
    try {
      data = (await response.json()) as T
    } catch {
      data = null
    }
    return { ok: response.ok, statusCode: response.status, latencyMs, data }
  } catch {
    return {
      ok: false,
      statusCode: 0,
      latencyMs: Math.max(1, Math.round(nowMs() - startedAt)),
      data: null,
    }
  }
}

function extractNodeCount(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (!value || typeof value !== 'object') return 0
  const record = value as Record<string, unknown>
  if (Array.isArray(record.nodes)) return record.nodes.length
  if (Array.isArray(record.items)) return record.items.length
  if (Array.isArray(record.data)) return record.data.length
  return 0
}

async function fetchServicesHealthProbe(): Promise<ServicesHealthProbe> {
  const [gatewayStatus, gatewayNodes] = await Promise.all([
    timedJsonFetch<GatewayStatusResponse>('/api/gateway/status'),
    timedJsonFetch<GatewayNodesResponse>('/api/gateway/nodes'),
  ])

  const missionControlApi =
    gatewayStatus.ok && gatewayStatus.data?.ok === true
      ? { status: 'up' as const, latencyMs: gatewayStatus.latencyMs }
      : { status: 'down' as const, latencyMs: gatewayStatus.latencyMs }

  const hasOllamaNodes =
    gatewayNodes.ok &&
    gatewayNodes.data?.ok === true &&
    extractNodeCount(gatewayNodes.data.data) > 0

  const ollama = hasOllamaNodes
    ? { status: 'up' as const, latencyMs: gatewayNodes.latencyMs }
    : { status: 'down' as const, latencyMs: gatewayNodes.latencyMs }

  return { missionControlApi, ollama }
}

export function useServicesHealth(gatewayConnected: boolean) {
  const query = useQuery({
    queryKey: ['dashboard', 'services-health'],
    queryFn: fetchServicesHealthProbe,
    retry: false,
    refetchInterval: 30_000,
  })

  const services = useMemo<Array<ServiceHealthItem>>(() => {
    const probe = query.data
    const isChecking = query.isLoading && !probe

    return [
      {
        name: 'Mission Control API',
        status: isChecking ? 'checking' : (probe?.missionControlApi.status ?? 'down'),
        latencyMs: probe?.missionControlApi.latencyMs,
      },
      {
        name: 'ClawSuite UI',
        status: 'up',
      },
      {
        name: 'OpenClaw Gateway',
        status: gatewayConnected ? 'up' : 'down',
      },
      {
        name: 'Ollama',
        status: isChecking ? 'checking' : (probe?.ollama.status ?? 'down'),
        latencyMs: probe?.ollama.latencyMs,
      },
    ]
  }, [gatewayConnected, query.data, query.isLoading])

  return {
    ...query,
    services,
  }
}

