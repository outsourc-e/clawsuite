import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, Cancel01Icon, Tick01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

type UpdateCheckResult = {
  updateAvailable: boolean
  localCommit: string
  remoteCommit: string
  localDate: string
  remoteDate: string
  behindBy: number
}

const DISMISS_KEY = 'openclaw-update-dismissed'
const CHECK_INTERVAL_MS = 15 * 60 * 1000 // 15 min

export function UpdateNotifier() {
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY))
  }, [])

  const { data } = useQuery<UpdateCheckResult>({
    queryKey: ['update-check'],
    queryFn: async () => {
      const res = await fetch('/api/update-check')
      if (!res.ok) throw new Error('update check failed')
      return res.json() as Promise<UpdateCheckResult>
    },
    refetchInterval: CHECK_INTERVAL_MS,
    staleTime: CHECK_INTERVAL_MS,
    retry: false,
  })

  useEffect(() => {
    if (!data?.updateAvailable) {
      setVisible(false)
      return
    }
    if (dismissed === data.remoteCommit) {
      setVisible(false)
      return
    }
    setVisible(true)
  }, [data, dismissed])

  function handleDismiss() {
    if (data?.remoteCommit) {
      localStorage.setItem(DISMISS_KEY, data.remoteCommit)
      setDismissed(data.remoteCommit)
    }
    setVisible(false)
    setShowInstructions(false)
  }

  function handleCopy() {
    navigator.clipboard?.writeText('git pull origin main && npm install && npm run dev')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AnimatePresence>
      {visible && data && (
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={cn(
            'fixed top-4 left-1/2 -translate-x-1/2 z-[9999]',
            'flex flex-col rounded-xl',
            'bg-accent-500/95 text-white shadow-lg shadow-accent-500/25',
            'backdrop-blur-sm border border-accent-400/30',
            'max-w-md w-[90vw]',
          )}
        >
          {/* Main banner */}
          <div className="flex items-center gap-3 px-5 py-3">
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={20}
              strokeWidth={2}
              className="shrink-0 animate-bounce"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Update Available</p>
              <p className="text-xs opacity-90 truncate">
                {data.behindBy} new commit{data.behindBy !== 1 ? 's' : ''} · {data.localCommit} → {data.remoteCommit}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowInstructions((v) => !v)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  showInstructions ? 'bg-white/30' : 'bg-white/20 hover:bg-white/30',
                )}
              >
                {showInstructions ? 'Hide' : 'How to Update'}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-full p-1 hover:bg-white/20 transition-colors"
                aria-label="Dismiss"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Expandable instructions */}
          <AnimatePresence>
            {showInstructions && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-5 pb-4 pt-1 border-t border-white/15">
                  <p className="text-xs opacity-80 mb-2">Run in your terminal:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg bg-black/30 px-3 py-2 text-xs font-mono select-all">
                      git pull origin main && npm install && npm run dev
                    </code>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className={cn(
                        'rounded-lg px-3 py-2 text-xs font-medium transition-all',
                        copied ? 'bg-green-500/30' : 'bg-white/20 hover:bg-white/30',
                      )}
                    >
                      {copied ? (
                        <span className="flex items-center gap-1">
                          <HugeiconsIcon icon={Tick01Icon} size={12} strokeWidth={2} />
                          Copied
                        </span>
                      ) : (
                        'Copy'
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] opacity-60 mt-2">
                    Then refresh this page to see the latest version.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
