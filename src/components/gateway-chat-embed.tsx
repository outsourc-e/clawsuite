import { memo, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const GATEWAY_UI_URL = '/gateway-ui/'
const STORAGE_KEY = 'clawsuite-chat-mode'

export type ChatMode = 'native' | 'gateway'

export function getStoredChatMode(): ChatMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'native' || v === 'gateway') return v
  } catch {
    /* noop */
  }
  return 'gateway'
}

export function setStoredChatMode(mode: ChatMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* noop */
  }
}

function GatewayChatEmbedComponent({ className }: { className?: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loaded) setError(true)
    }, 8000)
    return () => clearTimeout(timer)
  }, [loaded])

  // Clear problematic model selection from gateway UI localStorage on load
  useEffect(() => {
    if (!loaded || !iframeRef.current) return

    const iframe = iframeRef.current
    const timer = setTimeout(() => {
      try {
        // Try to access iframe's localStorage directly and clear bad model cache
        const iframeWindow = iframe.contentWindow
        if (iframeWindow?.localStorage) {
          // Clear any model-related localStorage keys that might have invalid Google auth
          const keysToCheck = [
            'selectedModel',
            'model',
            'defaultModel',
            'lastUsedModel',
          ]
          keysToCheck.forEach((key) => {
            const val = iframeWindow.localStorage.getItem(key)
            // If it's a Google model, clear it to force default
            if (val && val.includes('google')) {
              iframeWindow.localStorage.removeItem(key)
              console.log(`Cleared problematic model key: ${key}`)
            }
          })
        }
      } catch (err) {
        // CORS might block this, but worth trying
        console.warn('Could not access gateway UI localStorage:', err)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [loaded])

  return (
    <div className={cn('relative h-full w-full', className)}>
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface">
          <div className="flex flex-col items-center gap-2">
            <div className="size-6 animate-spin rounded-full border-2 border-primary-300 border-t-accent-500" />
            <p className="text-xs text-primary-600">Connecting to gateway...</p>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface">
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-primary-700">
              Unable to connect to gateway
            </p>
            <p className="text-xs text-primary-500">
              Make sure OpenClaw is running on port 18789
            </p>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={GATEWAY_UI_URL}
        className={cn(
          'h-full w-full border-0 transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
        title="OpenClaw Chat"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        allow="clipboard-read; clipboard-write"
      />
    </div>
  )
}

export const GatewayChatEmbed = memo(GatewayChatEmbedComponent)
