/**
 * Terminal sessions using native child_process.
 * Uses macOS `script` command for PTY allocation (no native addons needed).
 * Falls back to raw pipe mode on other platforms.
 */
import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import EventEmitter from 'node:events'
import { platform } from 'node:os'

export type TerminalSessionEvent = {
  event: string
  payload: unknown
}

export type TerminalSession = {
  id: string
  createdAt: number
  emitter: EventEmitter
  sendInput: (data: string) => void
  resize: (cols: number, rows: number) => void
  close: () => void
}

const sessions = new Map<string, TerminalSession>()

export function createTerminalSession(params: {
  command?: string[]
  cwd?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
}): TerminalSession {
  const emitter = new EventEmitter()
  const sessionId = randomUUID()

  const shell = params.command?.[0] ?? process.env.SHELL ?? '/bin/zsh'
  const shellArgs = params.command?.slice(1) ?? ['-i']

  // Resolve ~ to home directory
  let cwd = params.cwd ?? process.env.HOME ?? '/tmp'
  if (cwd.startsWith('~')) {
    cwd = cwd.replace('~', process.env.HOME ?? '/tmp')
  }

  const cols = params.cols ?? 80
  const rows = params.rows ?? 24

  const env = {
    ...process.env,
    ...params.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    COLUMNS: String(cols),
    LINES: String(rows),
  } as Record<string, string>

  let proc: ChildProcess

  // Spawn shell directly with pipes. Colors still work via TERM=xterm-256color.
  // No PTY resize, but fully functional for running commands.
  proc = spawn(shell, shellArgs, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const onData = (data: Buffer) => {
    emitter.emit('event', {
      event: 'data',
      payload: { data: data.toString() },
    } as TerminalSessionEvent)
  }

  proc.stdout?.on('data', onData)
  proc.stderr?.on('data', onData)

  proc.on('exit', (exitCode, signal) => {
    emitter.emit('event', {
      event: 'exit',
      payload: { exitCode, signal: signal ?? undefined },
    } as TerminalSessionEvent)
    emitter.emit('close')
    sessions.delete(sessionId)
  })

  proc.on('error', (err) => {
    emitter.emit('event', {
      event: 'error',
      payload: { message: err.message },
    } as TerminalSessionEvent)
  })

  const session: TerminalSession = {
    id: sessionId,
    createdAt: Date.now(),
    emitter,

    sendInput(data: string) {
      if (proc.stdin?.writable) {
        proc.stdin.write(data)
      }
    },

    resize(newCols: number, newRows: number) {
      // With `script`, we can't resize dynamically.
      // But we can send SIGWINCH if we had the PTY fd.
      // For now, just update env for future reference.
      void newCols
      void newRows
    },

    close() {
      try {
        proc.kill('SIGTERM')
        // Force kill after 2s if still alive
        setTimeout(() => {
          try { proc.kill('SIGKILL') } catch { /* */ }
        }, 2000)
      } catch {
        // Already dead
      }
      sessions.delete(sessionId)
    },
  }

  sessions.set(sessionId, session)
  return session
}

export function getTerminalSession(id: string): TerminalSession | null {
  return sessions.get(id) ?? null
}

export function closeTerminalSession(id: string): void {
  const session = sessions.get(id)
  if (!session) return
  session.close()
}
