'use client'

import { useSyncExternalStore } from 'react'
import {
  
  readAgentAvatarPreference,
  subscribeToAgentAvatarPreference,
  toggleAgentAvatarPreference
} from './agent-avatar'
import { LogoLoader } from './logo-loader'
import type {AgentAvatarPreference} from './agent-avatar';
import { cn } from '@/lib/utils'

export type LoaderPreference = AgentAvatarPreference

export type LoadingIndicatorProps = {
  className?: string
  iconClassName?: string
  ariaLabel?: string
}

function LoadingIndicator({
  className,
  iconClassName,
  ariaLabel = 'Toggle loading indicator',
}: LoadingIndicatorProps) {
  const preference = useSyncExternalStore(
    subscribeToAgentAvatarPreference,
    readAgentAvatarPreference,
    function getServerSnapshot() {
      return 'lobster'
    },
  )

  return (
    <span
      role="button"
      tabIndex={0}
      className={cn(
        'chat-streaming-loader inline-flex items-center justify-center bg-transparent p-0 text-current',
        className,
      )}
      onClick={(event) => {
        event.stopPropagation()
        toggleAgentAvatarPreference(preference as AgentAvatarPreference)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          toggleAgentAvatarPreference(preference as AgentAvatarPreference)
        }
      }}
      title="Click to switch loader"
      aria-label={ariaLabel}
    >
      {preference === 'lobster' ? (
        <span className={cn('chat-streaming-lobster', iconClassName)} aria-hidden="true">
          🦞
        </span>
      ) : (
        <LogoLoader className={iconClassName} />
      )}
    </span>
  )
}

export { LoadingIndicator }
