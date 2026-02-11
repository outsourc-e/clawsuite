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

    handleScroll()
    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => element.removeEventListener('scroll', handleScroll)
  }, [onUserScroll])

  return (
    <div className={cn('relative flex-1 min-h-0', className)}>
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto"
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
