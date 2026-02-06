export const BASE_URL =
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4444'

export type GatewaySessionUsage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  tokens?: number
  cost?: number
}

export type GatewayMessagePart = {
  type?: string
  text?: string
}

export type GatewaySessionMessage = {
  role?: string
  content?: Array<GatewayMessagePart>
  text?: string
}

export type GatewaySession = {
  key?: string
  friendlyId?: string
  kind?: string
  status?: string
  model?: string
  label?: string
  title?: string
  derivedTitle?: string
  task?: string
  initialMessage?: string
  progress?: number
  tokenCount?: number
  totalTokens?: number
  cost?: number
  createdAt?: number | string
  startedAt?: number | string
  updatedAt?: number | string
  lastMessage?: GatewaySessionMessage | null
  usage?: GatewaySessionUsage
  [key: string]: unknown
}

export type GatewaySessionsResponse = {
  sessions?: Array<GatewaySession>
}

export type GatewaySessionStatusResponse = {
  status?: string
  progress?: number
  model?: string
  tokenCount?: number
  totalTokens?: number
  usage?: GatewaySessionUsage
  error?: string
  [key: string]: unknown
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as Record<string, unknown>
    if (typeof payload.error === 'string') return payload.error
    if (typeof payload.message === 'string') return payload.message
    return JSON.stringify(payload)
  } catch {
    const text = await response.text().catch(() => '')
    return text || response.statusText || 'Gateway request failed'
  }
}

function makeEndpoint(pathname: string): string {
  return new URL(pathname, BASE_URL).toString()
}

export async function fetchSessions(): Promise<GatewaySessionsResponse> {
  const response = await fetch(makeEndpoint('/api/sessions'))
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return (await response.json()) as GatewaySessionsResponse
}

export async function fetchSessionStatus(
  key: string,
): Promise<GatewaySessionStatusResponse> {
  const response = await fetch(
    makeEndpoint(`/api/sessions/${encodeURIComponent(key)}/status`),
  )
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return (await response.json()) as GatewaySessionStatusResponse
}
