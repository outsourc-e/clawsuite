declare module 'ws' {
  export type RawData = any

  type WsListener = (...args: Array<any>) => void

  class WebSocket {
    static OPEN: number
    static CONNECTING: number
    static CLOSING: number
    static CLOSED: number
    OPEN: number
    CONNECTING: number
    CLOSING: number
    CLOSED: number
    readyState: number

    constructor(url: string, options?: Record<string, unknown>)

    send(
      data: string | Buffer | ArrayBuffer | ArrayBufferView,
      cb?: (err?: unknown) => void,
    ): void
    close(code?: number, reason?: string): void
    terminate(): void
    ping(data?: unknown, mask?: boolean, cb?: (err?: unknown) => void): void

    on(event: string, listener: WsListener): this
    once(event: string, listener: WsListener): this
    off(event: string, listener: WsListener): this
    removeListener(event: string, listener: WsListener): this
    removeAllListeners(event?: string): this
  }

  namespace WebSocket {
    export type RawData = any
  }

  export class WebSocketServer {
    constructor(options?: Record<string, unknown>)
    on(event: string, listener: WsListener): this
    once(event: string, listener: WsListener): this
    off(event: string, listener: WsListener): this
    close(cb?: () => void): void
    handleUpgrade(...args: Array<any>): void
    emit(event: string, ...args: Array<any>): boolean
  }

  export default WebSocket
}
