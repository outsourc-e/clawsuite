import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import type { RawData } from 'ws'

export type GatewayFrame =
  | { type: 'req'; id: string; method: string; params?: unknown }
  | {
      type: 'res'
      id: string
      ok: boolean
      payload?: unknown
      error?: { code: string; message: string; details?: unknown }
    }
  | { type: 'event'; event: string; payload?: unknown; seq?: number }

type ConnectParams = {
  minProtocol: number
  maxProtocol: number
  client: {
    id: string
    displayName?: string
    version: string
    platform: string
    mode: string
    instanceId?: string
  }
  auth?: { token?: string; password?: string }
  role?: 'operator' | 'node'
  scopes?: Array<string>
}

type PendingRequest = {
  id: string
  method: string
  params?: unknown
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

type InflightRequest = {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

const RECONNECT_DELAYS_MS = [1000, 2000, 4000]
const MAX_RECONNECT_DELAY_MS = 30000
const HEARTBEAT_INTERVAL_MS = 30000
const HEARTBEAT_TIMEOUT_MS = 10000

export function getGatewayConfig() {
  const url = process.env.CLAWDBOT_GATEWAY_URL?.trim() || 'ws://127.0.0.1:18789'
  const token = process.env.CLAWDBOT_GATEWAY_TOKEN?.trim() || ''
  const password = process.env.CLAWDBOT_GATEWAY_PASSWORD?.trim() || ''

  // For a minimal dashboard we require shared auth, otherwise we'd need a device identity signature.
  if (!token && !password) {
    throw new Error(
      'Missing gateway auth. Set CLAWDBOT_GATEWAY_TOKEN (recommended) or CLAWDBOT_GATEWAY_PASSWORD in the server environment.',
    )
  }

  return { url, token, password }
}

export function buildConnectParams(token: string, password: string): ConnectParams {
  return {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: 'gateway-client',
      displayName: 'openclaw-studio',
      version: 'dev',
      platform: process.platform,
      mode: 'ui',
      instanceId: randomUUID(),
    },
    auth: {
      token: token || undefined,
      password: password || undefined,
    },
    role: 'operator',
    scopes: ['operator.admin'],
  }
}

class GatewayClient {
  private ws: WebSocket | null = null
  private connectPromise: Promise<void> | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatInterval: NodeJS.Timeout | null = null
  private heartbeatTimeout: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private authenticated = false
  private destroyed = false

  private requestQueue: Array<PendingRequest> = []
  private inflight = new Map<string, InflightRequest>()

  async request<TPayload = unknown>(method: string, params?: unknown): Promise<TPayload> {
    if (this.destroyed) {
      throw new Error('Gateway client is shut down')
    }

    return new Promise<TPayload>((resolve, reject) => {
      const request: PendingRequest = {
        id: randomUUID(),
        method,
        params,
        resolve,
        reject,
      }

      this.requestQueue.push(request)
      this.ensureConnected().catch(() => {
        // keep requests queued; reconnect loop will flush after reconnect
      })
      this.flushQueue()
    })
  }

  async ensureConnected(): Promise<void> {
    if (this.destroyed) {
      throw new Error('Gateway client is shut down')
    }
    if (this.authenticated && this.ws?.readyState === WebSocket.OPEN) {
      return
    }
    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = this.openAndHandshake()
      .then(() => {
        this.reconnectAttempts = 0
      })
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error))
        this.scheduleReconnect()
        throw err
      })
      .finally(() => {
        this.connectPromise = null
      })

    return this.connectPromise
  }

  async shutdown(): Promise<void> {
    this.destroyed = true
    this.clearReconnectTimer()
    this.stopHeartbeat()

    const ws = this.ws
    this.ws = null
    this.authenticated = false

    const closePromise = ws ? this.closeSocket(ws) : Promise.resolve()

    this.rejectQueuedRequests(new Error('Gateway client is shut down'))
    this.rejectInflightRequests(new Error('Gateway client is shut down'))

    await closePromise.catch(() => {
      // ignore
    })
  }

  private async openAndHandshake(): Promise<void> {
    const { url, token, password } = getGatewayConfig()
    const ws = new WebSocket(url)

    this.clearReconnectTimer()
    this.attachSocket(ws)

    await this.waitForOpen(ws)

    if (this.destroyed) {
      throw new Error('Gateway client is shut down')
    }

    this.ws = ws
    this.authenticated = false

    const connectId = randomUUID()
    const connectReq: GatewayFrame = {
      type: 'req',
      id: connectId,
      method: 'connect',
      params: buildConnectParams(token, password),
    }

    await new Promise<void>((resolve, reject) => {
      this.inflight.set(connectId, {
        resolve: () => resolve(),
        reject,
      })

      this.sendFrame(connectReq).catch((error: unknown) => {
        this.inflight.delete(connectId)
        reject(error)
      })
    })

    this.authenticated = true
    this.startHeartbeat()
    this.flushQueue()
  }

  private attachSocket(ws: WebSocket) {
    ws.on('message', (data) => {
      this.handleMessage(data)
    })

    ws.on('pong', () => {
      if (this.heartbeatTimeout) {
        clearTimeout(this.heartbeatTimeout)
        this.heartbeatTimeout = null
      }
    })

    ws.on('close', () => {
      this.handleDisconnect(new Error('Gateway connection closed'))
    })

    ws.on('error', (error) => {
      const err = error instanceof Error ? error : new Error(String(error))
      this.handleDisconnect(err)
    })
  }

  private handleMessage(data: RawData) {
    let frame: GatewayFrame

    try {
      frame = JSON.parse(rawDataToString(data)) as GatewayFrame
    } catch {
      return
    }

    if (frame.type !== 'res') return

    const pending = this.inflight.get(frame.id)
    if (!pending) return

    this.inflight.delete(frame.id)

    if (frame.ok) {
      pending.resolve(frame.payload)
      return
    }

    pending.reject(new Error(frame.error?.message ?? 'gateway error'))
  }

  private handleDisconnect(error: Error) {
    const ws = this.ws
    this.ws = null
    this.authenticated = false
    this.stopHeartbeat()

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        ws.terminate()
      } catch {
        // ignore
      }
    }

    this.rejectInflightRequests(error)

    if (this.destroyed) {
      this.rejectQueuedRequests(error)
      return
    }

    this.scheduleReconnect()
  }

  private flushQueue() {
    if (!this.authenticated || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    while (this.requestQueue.length > 0) {
      const pending = this.requestQueue.shift()
      if (!pending) continue

      const frame: GatewayFrame = {
        type: 'req',
        id: pending.id,
        method: pending.method,
        params: pending.params,
      }

      this.inflight.set(pending.id, {
        resolve: pending.resolve,
        reject: pending.reject,
      })

      this.sendFrame(frame).catch((error: unknown) => {
        this.inflight.delete(pending.id)
        pending.reject(error)
      })
    }
  }

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer || this.connectPromise) {
      return
    }

    const delay = nextReconnectDelayMs(this.reconnectAttempts)
    this.reconnectAttempts += 1

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.ensureConnected()
        .then(() => {
          this.flushQueue()
        })
        .catch(() => {
          // next reconnect is scheduled by ensureConnected/openAndHandshake
        })
    }, delay)
  }

  private startHeartbeat() {
    this.stopHeartbeat()

    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return
      }

      try {
        this.ws.ping()
      } catch {
        this.handleDisconnect(new Error('Gateway ping failed'))
        return
      }

      if (this.heartbeatTimeout) {
        clearTimeout(this.heartbeatTimeout)
      }

      this.heartbeatTimeout = setTimeout(() => {
        this.heartbeatTimeout = null
        this.handleDisconnect(new Error('Gateway ping timeout'))
      }, HEARTBEAT_TIMEOUT_MS)
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  private async sendFrame(frame: GatewayFrame): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gateway connection not open')
    }

    await new Promise<void>((resolve, reject) => {
      this.ws?.send(JSON.stringify(frame), (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })
  }

  private waitForOpen(ws: WebSocket): Promise<void> {
    if (ws.readyState === WebSocket.OPEN) return Promise.resolve()

    return new Promise<void>((resolve, reject) => {
      function onOpen() {
        cleanup()
        resolve()
      }

      function onError(error: Error) {
        cleanup()
        reject(new Error(`WebSocket error: ${String(error.message)}`))
      }

      function cleanup() {
        ws.off('open', onOpen)
        ws.off('error', onError)
      }

      ws.on('open', onOpen)
      ws.on('error', onError)
    })
  }

  private closeSocket(ws: WebSocket): Promise<void> {
    if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      ws.once('close', () => resolve())
      ws.close()
    })
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private rejectQueuedRequests(error: Error) {
    for (const pending of this.requestQueue) {
      pending.reject(error)
    }
    this.requestQueue = []
  }

  private rejectInflightRequests(error: Error) {
    for (const pending of this.inflight.values()) {
      pending.reject(error)
    }
    this.inflight.clear()
  }
}

function nextReconnectDelayMs(attempt: number) {
  if (attempt < RECONNECT_DELAYS_MS.length) {
    return RECONNECT_DELAYS_MS[attempt]
  }

  const doubled = RECONNECT_DELAYS_MS[RECONNECT_DELAYS_MS.length - 1] * 2 ** (attempt - 2)
  return Math.min(doubled, MAX_RECONNECT_DELAY_MS)
}

function rawDataToString(data: RawData): string {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return data.toString()
}

const gatewayClient = new GatewayClient()

export async function gatewayRpc<TPayload = unknown>(
  method: string,
  params?: unknown,
): Promise<TPayload> {
  return gatewayClient.request<TPayload>(method, params)
}

export async function gatewayConnectCheck(): Promise<void> {
  await gatewayClient.ensureConnected()
}

export async function cleanupGatewayConnection(): Promise<void> {
  await gatewayClient.shutdown()
}
