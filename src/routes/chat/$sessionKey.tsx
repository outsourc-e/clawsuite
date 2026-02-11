import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChatScreen } from '../../screens/chat/chat-screen'
import { moveHistoryMessages } from '../../screens/chat/chat-queries'

export const Route = createFileRoute('/chat/$sessionKey')({
  component: ChatRoute,
  // Disable SSR to prevent hydration mismatches from async data
  ssr: false,
})

function ChatRoute() {
  // Client-only rendering to prevent hydration mismatches
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [forcedSession, setForcedSession] = useState<{
    friendlyId: string
    sessionKey: string
  } | null>(null)
  const params = Route.useParams()
  const activeFriendlyId =
    typeof params.sessionKey === 'string' ? params.sessionKey : 'main'
  const isNewChat = activeFriendlyId === 'new'
  const forcedSessionKey =
    forcedSession?.friendlyId === activeFriendlyId
      ? forcedSession.sessionKey
      : undefined
  const handleSessionResolved = useCallback(
    function handleSessionResolved(payload: {
      friendlyId: string
      sessionKey: string
    }) {
      moveHistoryMessages(
        queryClient,
        'new',
        'new',
        payload.friendlyId,
        payload.sessionKey,
      )
      setForcedSession({
        friendlyId: payload.friendlyId,
        sessionKey: payload.sessionKey,
      })
      navigate({
        to: '/chat/$sessionKey',
        params: { sessionKey: payload.friendlyId },
        replace: true,
      })
    },
    [navigate, queryClient],
  )

  if (!mounted) {
    return <div className="flex h-full items-center justify-center text-primary-400">Loading chat…</div>
  }

  return (
    <ChatScreen
      activeFriendlyId={activeFriendlyId}
      isNewChat={isNewChat}
      forcedSessionKey={forcedSessionKey}
      onSessionResolved={isNewChat ? handleSessionResolved : undefined}
    />
  )
}
