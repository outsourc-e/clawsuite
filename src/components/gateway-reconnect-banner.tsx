'use client'

import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, Cancel01Icon, Settings02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { useGatewaySetupStore } from '@/hooks/use-gateway-setup'
import { cn } from '@/lib/utils'

const BANNER_STORAGE_KEY = 'clawsuite-gateway-banner-dismissed'
const CHECK_INTERVAL_MS = 30_000 // Check every 30 seconds

async function checkGatewayHealth(): Promise<boolean> {
  try {
    const response = await fetch('/api/ping', {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return false
    const data = (await response.json()) as { ok?: boolean }
    return Boolean(data.ok)
  } catch {
    return false
  }
}

/**
 * Shows a persistent banner when the gateway is unreachable (but was previously configured).
 * This is different from the setup wizard — it's for temporary connection issues.
 */
export function GatewayReconnectBanner() {
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const { open: openSetupWizard } = useGatewaySetupStore()

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return

    // Check if user previously dismissed the banner in this session
    const dismissed = sessionStorage.getItem(BANNER_STORAGE_KEY) === 'true'
    if (dismissed) {
      setIsDismissed(true)
      return
    }

    let mounted = true

    async function checkHealth() {
      if (!mounted) return
      const healthy = await checkGatewayHealth()
      if (!mounted) return

      if (!healthy && !isDismissed) {
        setIsVisible(true)
      } else {
        setIsVisible(false)
      }
    }

    // Initial check
    void checkHealth()

    // Periodic checks
    const interval = setInterval(() => {
      void checkHealth()
    }, CHECK_INTERVAL_MS)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [isDismissed])

  const handleDismiss = () => {
    sessionStorage.setItem(BANNER_STORAGE_KEY, 'true')
    setIsDismissed(true)
    setIsVisible(false)
  }

  const handleOpenSettings = () => {
    openSetupWizard()
    handleDismiss()
  }

  if (!isVisible || isDismissed) return null

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50 border-b border-red-200 bg-gradient-to-r from-red-50 to-red-100',
        'flex items-center justify-between gap-4 px-4 py-2.5 shadow-sm',
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          icon={Alert02Icon}
          className="size-5 shrink-0 text-red-600"
          strokeWidth={2}
        />
        <p className="text-sm font-medium text-red-900">
          Gateway connection lost.{' '}
          <span className="font-normal text-red-700">
            Check your connection or reconfigure in settings.
          </span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleOpenSettings}
          className="shrink-0 border-red-300 bg-white text-red-700 hover:bg-red-50"
        >
          <HugeiconsIcon icon={Settings02Icon} size={14} strokeWidth={1.5} />
          Reconfigure
        </Button>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded p-1 text-red-600 transition-colors hover:bg-red-200/50"
          aria-label="Dismiss banner"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
