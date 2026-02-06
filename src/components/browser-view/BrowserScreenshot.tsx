import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon, ViewIcon } from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'motion/react'

type BrowserScreenshotProps = {
  imageDataUrl: string
  loading: boolean
  capturedAt: string
}

function BrowserScreenshot({
  imageDataUrl,
  loading,
  capturedAt,
}: BrowserScreenshotProps) {
  return (
    <section className="relative min-h-[320px] overflow-hidden rounded-2xl border border-primary-200 bg-primary-100/45 shadow-sm backdrop-blur-xl lg:min-h-[560px]">
      <div className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50/80 px-2.5 py-1 text-xs text-primary-500 tabular-nums">
        <HugeiconsIcon icon={ViewIcon} size={20} strokeWidth={1.5} />
        <span>
          {capturedAt
            ? new Date(capturedAt).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              })
            : '--:--:--'}
        </span>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-full min-h-[320px] items-center justify-center bg-primary-100/35 text-primary-500"
          >
            <HugeiconsIcon
              icon={Loading03Icon}
              size={20}
              strokeWidth={1.5}
              className="animate-spin"
            />
          </motion.div>
        ) : (
          <motion.div
            key={imageDataUrl}
            initial={{ opacity: 0.25 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0.25 }}
            transition={{ duration: 0.25 }}
            className="h-full min-h-[320px]"
          >
            <img
              src={imageDataUrl}
              alt="Live browser screenshot"
              className="h-full w-full object-contain"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

export { BrowserScreenshot }
