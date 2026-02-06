import { randomUUID } from 'node:crypto'
import EventEmitter from 'node:events'
import WebSocket from 'ws'

import {
  
  buildConnectParams,
  getGatewayConfig
} from './gateway'
import type {GatewayFrame} from './gateway';

const DEFAULT_EXEC_METHOD = 'exec'
const INPUT_METHOD = 'exec.write'
const RESIZE_METHOD = 'exec.resize'
const CLOSE_METHOD = 'exec.close'

export type TerminalSessionEvent = {
  event: string
  payload: unknown
}

export type TerminalSession = {
  id: string
  execId: string | null
  createdAt: number
  emitter: EventEmitter
  sendInput: (data: string) => Promise<void>
  resize: (cols: number, rows: number) => Promise<void>
  close: () => Promise<void>
}

type SessionRecord = TerminalSession & {
  ws: WebSocket
  pending: Map<string, (frame: GatewayFrame) => void>
}

const sessions = new Map<string, SessionRecord>()

function parsePayload(frame: { payload?: unknown; payloadJSON?: unknown }) {
  if (frame.payload !== undefined) return frame.payload
  if (typeof frame.payloadJSON === 'string') {
    try {
      return JSON.parse(frame.payloadJSON)
    } catch {
      return null
    }
  }
  return null
}

async function waitForOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return
  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const cleanup = () => {
      ws.off('open', onOpen)
      ws.off('error', onError)
    }
    ws.on('open', onOpen)
    ws.on('error', onError)
  })
}

async function sendFrame(ws: WebSocket, frame: GatewayFrame): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ws.send(JSON.stringify(frame), (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function waitForResponse(record: SessionRecord, id: string): Promise<GatewayFrame> {
  return new Promise((resolve) => {
    record.pending.set(id, resolve)
  })
}

function pickExecId(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null
  const value =
    payload.execId ??
    payload.execID ??
    payload.id ??
    payload.streamId ??
    payload.streamID ??
    payload.processId ??
    payload.pid
  return typeof value === 'string' ? value : null
}

export async function createTerminalSession(params: {
  command: Array<string>
  cwd?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
  pty?: boolean
}): Promise<TerminalSession> {
  const { url, token, password } = getGatewayConfig()
  const ws = new WebSocket(url)
  await waitForOpen(ws)

  const record: SessionRecord = {
    id: randomUUID(),
    execId: null,
    createdAt: Date.now(),
    emitter: new EventEmitter(),
    ws,
    pending: new Map(),
    sendInput: async () => {},
    resize: async () => {},
    close: async () => {},
  }

  const connectId = randomUUID()
  const connectFrame: GatewayFrame = {
    type: 'req',
    id: connectId,
    method: 'connect',
    params: buildConnectParams(token, password),
  }

  ws.on('message', (data) => {
    try {
      const text = typeof data === 'string' ? data : data.toString('utf8')
      const frame = JSON.parse(text) as GatewayFrame & { payloadJSON?: unknown }
      if (frame.type === 'res') {
        const waiter = record.pending.get(frame.id)
        if (waiter) {
          record.pending.delete(frame.id)
          waiter(frame)
        }
        return
      }
      if (frame.type === 'event') {
        const payload = parsePayload(frame)
        record.emitter.emit('event', {
          event: frame.event,
          payload,
        } as TerminalSessionEvent)
      }
    } catch {
      // ignore
    }
  })

  ws.on('close', () => {
    record.emitter.emit('close')
  })
  ws.on('error', (error) => {
    record.emitter.emit('error', error)
  })

  await sendFrame(ws, connectFrame)
  await waitForResponse(record, connectId)

  const execId = randomUUID()
  const execFrame: GatewayFrame = {
    type: 'req',
    id: execId,
    method: DEFAULT_EXEC_METHOD,
    params: {
      command: params.command,
      cwd: params.cwd,
      env: params.env,
      pty: params.pty ?? true,
      cols: params.cols,
      rows: params.rows,
      timeoutMs: 0,
    },
  }

  await sendFrame(ws, execFrame)
  const execRes = (await waitForResponse(record, execId)) as GatewayFrame & {
    payload?: unknown
  }
  if (execRes.type === 'res' && execRes.ok) {
    record.execId = pickExecId(execRes.payload) ?? null
  }

  record.sendInput = async (data: string) => {
    const id = randomUUID()
    await sendFrame(ws, {
      type: 'req',
      id,
      method: INPUT_METHOD,
      params: {
        id: record.execId,
        data,
      },
    })
  }

  record.resize = async (cols: number, rows: number) => {
    const id = randomUUID()
    await sendFrame(ws, {
      type: 'req',
      id,
      method: RESIZE_METHOD,
      params: {
        id: record.execId,
        cols,
        rows,
      },
    })
  }

  record.close = async () => {
    const id = randomUUID()
    try {
      await sendFrame(ws, {
        type: 'req',
        id,
        method: CLOSE_METHOD,
        params: {
          id: record.execId,
        },
      })
    } catch {
      // ignore
    }
    try {
      ws.close()
    } catch {
      // ignore
    }
    sessions.delete(record.id)
  }

  sessions.set(record.id, record)
  return record
}

export function getTerminalSession(id: string): TerminalSession | null {
  return sessions.get(id) ?? null
}

export async function closeTerminalSession(id: string): Promise<void> {
  const record = sessions.get(id)
  if (!record) return
  await record.close()
}
