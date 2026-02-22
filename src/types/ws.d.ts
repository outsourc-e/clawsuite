declare module 'ws' {
  import { EventEmitter } from 'node:events'
  import type { Server } from 'node:http'
  import type { Socket } from 'node:net'

  export type RawData = string | Buffer | ArrayBuffer | Buffer[]

  export default class WebSocket extends EventEmitter {
    static readonly CONNECTING: number
    static readonly OPEN: number
    static readonly CLOSING: number
    static readonly CLOSED: number
    readonly CONNECTING: number
    readonly OPEN: number
    readonly CLOSING: number
    readonly CLOSED: number
    readyState: number

    constructor(
      address: string | URL,
      options?: Record<string, unknown>,
    )

    send(
      data: string | Buffer,
      cb?: (err?: Error | null) => void,
    ): void
    ping(): void
    close(code?: number, data?: string | Buffer): void
    terminate(): void
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: {
      port?: number
      server?: Server
      noServer?: boolean
      [key: string]: unknown
    })
    clients: Set<WebSocket>
    close(cb?: (err?: Error) => void): void
    handleUpgrade(
      request: unknown,
      socket: Socket,
      head: Buffer,
      cb: (ws: WebSocket) => void,
    ): void
  }
}
