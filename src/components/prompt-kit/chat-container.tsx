'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type ChatContainerRootProps = {
  children: React.ReactNode
  overlay?: React.ReactNode
  className?: string
  onUserScroll?: (metrics: {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
  }) => void
} & React.HTMLAttributes<HTMLDivElement>

export type ChatContainerContentProps = {
  children: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>

export type ChatContainerScrollAnchorProps = {
  className?: string
  ref?: React.Ref<HTMLDivElement>
} & React.HTMLAttributes<HTMLDivElement>

function ChatContainerRoot({
  children,
  overlay,
  className,
  onUserScroll,
  ...props
}: ChatContainerRootProps) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  React.useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const handleScroll = () => {
      onUserScroll?.({
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      })
    }

    // Don't fire initial handleScroll() on mount — it reports scrollTop=0
    // which would set stickToBottomRef=false before the initial scroll-to-bottom.
    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => element.removeEventListener('scroll', handleScroll)
  }, [onUserScroll])

  // Debug: log container dimensions
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const log = () => {
      const parent = el.parentElement
      // Walk up the DOM tree to find where height breaks
      const chain: string[] = []
      let node: HTMLElement | null = el
      while (node && chain.length < 10) {
        chain.push(`${node.tagName}.${node.className.split(' ').slice(0,3).join('.')} h=${node.clientHeight}`)
        node = node.parentElement
      }
      console.log('[CONTAINER DEBUG] height chain:', chain)
      console.log('[CONTAINER DEBUG] viewport:', window.innerHeight)
    }
    log()
    const timer = setInterval(log, 2000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className={cn('relative flex-1 min-h-0', className)}>
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto overscroll-contain"
        style={{ overflowAnchor: 'none' }}
        data-chat-scroll-viewport
        {...props}
      >
        {children}
      </div>
      {overlay}
    </div>
  )
}

function ChatContainerContent({
  children,
  className,
  ...props
}: ChatContainerContentProps) {
  return (
    <div
      className={cn('flex w-full flex-col', className)}
      {...props}
    >
      <div className="mx-auto w-full px-3 sm:px-5 flex flex-col" style={{ maxWidth: 'min(768px, 100%)' }}>
        <div className="flex flex-col space-y-3">{children}</div>
      </div>
    </div>
  )
}

function ChatContainerScrollAnchor({
  ...props
}: ChatContainerScrollAnchorProps) {
  return (
    <div
      className="h-px w-full shrink-0 scroll-mt-4 pt-8 pb-4"
      style={{ overflowAnchor: 'auto' }}
      aria-hidden="true"
      {...props}
    />
  )
}

export {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
}
