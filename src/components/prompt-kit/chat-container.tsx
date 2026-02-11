'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import {
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from '@/components/ui/scroll-area'
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

type ChatContainerShellProps = {
  className?: string
  overlay?: React.ReactNode
  viewportRef: React.Ref<HTMLDivElement>
  viewportProps: React.HTMLAttributes<HTMLDivElement>
}

function ChatContainerShell({
  className,
  overlay,
  viewportRef,
  viewportProps,
}: ChatContainerShellProps) {
  return (
    <div className={cn('relative flex flex-1 min-h-0 flex-col', className)}>
      <div
        className="relative flex-1 min-h-0 overflow-y-auto"
        data-chat-scroll-viewport
        ref={viewportRef}
        {...viewportProps}
      />
      {overlay}
    </div>
  )
}

function areViewportPropsEqual(
  prevProps: React.HTMLAttributes<HTMLDivElement>,
  nextProps: React.HTMLAttributes<HTMLDivElement>,
): boolean {
  if (prevProps === nextProps) return true
  const prevKeys = Object.keys(prevProps)
  const nextKeys = Object.keys(nextProps)
  if (prevKeys.length !== nextKeys.length) return false
  for (const key of prevKeys) {
    if (
      prevProps[key as keyof React.HTMLAttributes<HTMLDivElement>] !==
      nextProps[key as keyof React.HTMLAttributes<HTMLDivElement>]
    ) {
      return false
    }
  }
  return true
}

function areShellPropsEqual(
  prevProps: ChatContainerShellProps,
  nextProps: ChatContainerShellProps,
): boolean {
  if (prevProps.className !== nextProps.className) return false
  if (prevProps.overlay !== nextProps.overlay) return false
  if (prevProps.viewportRef !== nextProps.viewportRef) return false
  if (
    !areViewportPropsEqual(prevProps.viewportProps, nextProps.viewportProps)
  ) {
    return false
  }
  return true
}

const MemoizedChatContainerShell = React.memo(
  ChatContainerShell,
  areShellPropsEqual,
)

type ChatContainerPortalProps = {
  viewportNode: HTMLDivElement | null
  children: React.ReactNode
}

function ChatContainerPortal({
  viewportNode,
  children,
}: ChatContainerPortalProps) {
  if (!viewportNode) return null
  return createPortal(
    <div className="relative flex w-full flex-col">{children}</div>,
    viewportNode,
  )
}

function ChatContainerRoot({
  children,
  overlay,
  className,
  onUserScroll,
  ...props
}: ChatContainerRootProps) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const [viewportNode, setViewportNode] = React.useState<HTMLDivElement | null>(
    null,
  )
  const handleViewportRef = React.useCallback(function handleViewportRef(
    node: HTMLDivElement | null,
  ) {
    scrollRef.current = node
    setViewportNode(node)
  }, [])

  // Handle scroll events
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
    element.addEventListener('scroll', handleScroll)
    return () => element.removeEventListener('scroll', handleScroll)
  }, [onUserScroll])

  return (
    <>
      <MemoizedChatContainerShell
        className={className}
        overlay={overlay}
        viewportRef={handleViewportRef}
        viewportProps={props}
      />
      <ChatContainerPortal viewportNode={viewportNode}>
        {children}
      </ChatContainerPortal>
    </>
  )
}

const MemoizedChatContainerRoot = React.memo(ChatContainerRoot)

function ChatContainerContent({
  children,
  className,
  ...props
}: ChatContainerContentProps) {
  return (
    <div
      className={cn('flex w-full flex-col min-h-full', className)}
      {...props}
    >
      <div className="mx-auto w-full px-3 sm:px-5 flex flex-col flex-1 min-h-full" style={{ maxWidth: 'min(768px, 100%)' }}>
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
  MemoizedChatContainerRoot as ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
}
