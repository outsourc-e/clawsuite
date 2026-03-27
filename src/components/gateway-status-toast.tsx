'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────

type GatewayState = 'connected' | 'disconnected' | 'restarting' | 'starting' | 'failed'

interface GatewayStatus {
  state: GatewayState
  message: string
}

// ── Window augmentation ───────────────────────────────────────────────────

declare global {
  interface Window {
    gatewayBridge?: {
      onStatusChange: (callback: (data: GatewayStatus) => void) => void
      requestRestart: () => void
      removeStatusListener: (callback: (data: GatewayStatus) => void) => void
    }
  }
}

// ── Config ────────────────────────────────────────────────────────────────

const TOAST_CONFIG: Record<
  GatewayState,
  {
    bg: string
    border: string
    text: string
    icon: React.ReactNode
    autoDismissMs?: number
  }
> = {
  connected: {
    bg: 'bg-emerald-950/95',
    border: 'border-emerald-700/60',
    text: 'text-emerald-300',
    icon: <span className="text-emerald-400">✓</span>,
    autoDismissMs: 3000,
  },
  disconnected: {
    bg: 'bg-amber-950/95',
    border: 'border-amber-700/60',
    text: 'text-amber-300',
    icon: <span className="text-amber-400">⚠</span>,
  },
  restarting: {
    bg: 'bg-blue-950/95',
    border: 'border-blue-700/60',
    text: 'text-blue-300',
    icon: <Spinner className="text-blue-400" />,
  },
  starting: {
    bg: 'bg-blue-950/95',
    border: 'border-blue-700/60',
    text: 'text-blue-300',
    icon: <Spinner className="text-blue-400" />,
  },
  failed: {
    bg: 'bg-red-950/95',
    border: 'border-red-700/60',
    text: 'text-red-300',
    icon: <span className="text-red-400">✕</span>,
  },
}

// ── Spinner ───────────────────────────────────────────────────────────────

function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────

function GatewayToast({
  status,
  onDismiss,
  onRetry,
}: {
  status: GatewayStatus
  onDismiss: () => void
  onRetry: () => void
}) {
  const config = TOAST_CONFIG[status.state]

  function handleRetry() {
    window.gatewayBridge?.requestRestart()
    onRetry()
  }

  return (
    <motion.div
      key={status.state}
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-xl',
        'backdrop-blur-sm text-sm font-medium',
        config.bg,
        config.border,
        config.text,
      )}
      style={{ minWidth: 260, maxWidth: 340 }}
    >
      {/* Icon */}
      <span className="shrink-0 flex items-center justify-center size-4 text-base leading-none">
        {config.icon}
      </span>

      {/* Message */}
      <span className="flex-1 leading-snug">
        {status.message || defaultMessage(status.state)}
      </span>

      {/* Retry button (failed state only) */}
      {status.state === 'failed' && (
        <button
          type="button"
          onClick={handleRetry}
          className={cn(
            'shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
            'bg-red-800/60 text-red-200 hover:bg-red-700/80 active:scale-95',
          )}
        >
          Retry
        </button>
      )}

      {/* Dismiss button */}
      {status.state !== 'disconnected' && status.state !== 'restarting' && status.state !== 'starting' && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-current/40 hover:text-current/80 transition-colors text-lg leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </motion.div>
  )
}

function defaultMessage(state: GatewayState): string {
  switch (state) {
    case 'connected': return 'Gateway connected ✓'
    case 'disconnected': return 'Gateway disconnected — reconnecting...'
    case 'restarting': return 'Restarting gateway...'
    case 'starting': return 'Starting gateway...'
    case 'failed': return 'Gateway offline — click to retry'
  }
}

// ── Main component ────────────────────────────────────────────────────────

/**
 * GatewayStatusToast — listens for gateway:status IPC events and renders
 * a small non-intrusive toast in the bottom-right corner.
 * Only active in Electron (gatewayBridge is exposed by preload).
 */
export function GatewayStatusToast() {
  const [status, setStatus] = useState<GatewayStatus | null>(null)
  const [visible, setVisible] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isElectron = typeof window !== 'undefined' && Boolean(window.gatewayBridge)

  // Clear any pending auto-dismiss timer
  function clearDismissTimer() {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
  }

  useEffect(() => {
    if (!isElectron) return
    if (!window.gatewayBridge) return

    function handleStatusChange(data: GatewayStatus) {
      clearDismissTimer()
      setStatus(data)
      setVisible(true)

      const config = TOAST_CONFIG[data.state]
      if (config.autoDismissMs) {
        dismissTimerRef.current = setTimeout(() => {
          setVisible(false)
        }, config.autoDismissMs)
      }
    }

    window.gatewayBridge.onStatusChange(handleStatusChange)
    return () => {
      window.gatewayBridge?.removeStatusListener(handleStatusChange)
      clearDismissTimer()
    }
  }, [isElectron])

  function handleDismiss() {
    clearDismissTimer()
    setVisible(false)
  }

  function handleRetry() {
    // After requesting restart, switch to restarting state locally
    setStatus({ state: 'restarting', message: 'Restarting gateway...' })
    clearDismissTimer()
  }

  if (!isElectron || !status) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2">
      <AnimatePresence mode="wait">
        {visible && (
          <GatewayToast
            key={status.state}
            status={status}
            onDismiss={handleDismiss}
            onRetry={handleRetry}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
