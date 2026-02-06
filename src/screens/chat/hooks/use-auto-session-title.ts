import { useEffect, useMemo, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { chatQueryKeys } from '../chat-queries'
import {
  updateSessionTitleState,
  useSessionTitleInfo,
} from '../session-title-store'
import { textFromMessage } from '../utils'
import type { GatewayMessage, SessionMeta } from '../types'
import { generateSessionTitle } from '@/utils/generate-session-title'

const MIN_MESSAGES_FOR_TITLE = 3
const MAX_MESSAGES_FOR_TITLE = 5
const MAX_PER_MESSAGE_CHARS = 400

function buildSnippet(messages: Array<GatewayMessage>) {
  let firstUser: string | null = null
  let firstAssistant: string | null = null

  for (const message of messages) {
    if (message.role === 'user' && firstUser === null) {
      const text = textFromMessage(message)
      if (text) firstUser = text.slice(0, MAX_PER_MESSAGE_CHARS)
      continue
    }
    if (message.role === 'assistant' && firstUser && firstAssistant === null) {
      const text = textFromMessage(message)
      if (text) firstAssistant = text.slice(0, MAX_PER_MESSAGE_CHARS)
    }
    if (firstUser && firstAssistant) break
  }

  const snippet: Array<{ role: string; text: string }> = []
  if (firstUser) snippet.push({ role: 'user', text: firstUser })
  if (firstAssistant) snippet.push({ role: 'assistant', text: firstAssistant })
  return snippet
}

function countRelevantMessages(messages: Array<GatewayMessage>) {
  let count = 0
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    if (!textFromMessage(message)) continue
    count += 1
  }
  return count
}

function computeSignature(
  friendlyId: string,
  snippet: Array<{ role: string; text: string }> | undefined,
): string {
  if (!snippet || snippet.length === 0) return ''
  return `${friendlyId}:${snippet
    .map((part) => `${part.role}:${part.text}`)
    .join('|')}`
}

type UseAutoSessionTitleInput = {
  friendlyId: string
  sessionKey: string | undefined
  activeSession?: SessionMeta
  messages: Array<GatewayMessage>
  messageCount?: number
  enabled: boolean
}

type GenerateTitlePayload = {
  friendlyId: string
  sessionKey: string
  snippet: Array<{ role: string; text: string }>
  signature: string
}

type GenerateTitleResponse = {
  ok?: boolean
  title?: string
  fallback?: boolean
  source?: string
  error?: string
}

export function useAutoSessionTitle({
  friendlyId,
  sessionKey,
  activeSession,
  messages,
  messageCount,
  enabled,
}: UseAutoSessionTitleInput) {
  const queryClient = useQueryClient()
  const titleInfo = useSessionTitleInfo(friendlyId)
  const lastAttemptSignaturesRef = useRef<Record<string, string>>({})

  const snippet = useMemo(() => {
    if (!enabled) return []
    return buildSnippet(messages)
  }, [enabled, messages])

  const snippetSignature = useMemo(
    () => computeSignature(friendlyId, snippet),
    [friendlyId, snippet],
  )

  const resolvedMessageCount = useMemo(() => {
    if (typeof messageCount === 'number') return messageCount
    return countRelevantMessages(messages)
  }, [messageCount, messages])

  const shouldGenerate = useMemo(() => {
    if (!enabled) return false
    if (!friendlyId || friendlyId === 'new') return false
    if (!sessionKey || sessionKey === 'new') return false
    if (!snippetSignature) return false
    if (snippet.length < 2) return false
    if (resolvedMessageCount < MIN_MESSAGES_FOR_TITLE) return false
    if (resolvedMessageCount > MAX_MESSAGES_FOR_TITLE) return false
    if (activeSession?.label || activeSession?.title) return false
    if (activeSession?.derivedTitle && activeSession.titleSource === 'auto')
      return false
    if (titleInfo.status === 'generating') return false
    if (titleInfo.status === 'ready' && titleInfo.title) return false
    return true
  }, [
    activeSession?.derivedTitle,
    activeSession?.label,
    activeSession?.title,
    activeSession?.titleSource,
    enabled,
    friendlyId,
    resolvedMessageCount,
    sessionKey,
    snippet.length,
    snippetSignature,
    titleInfo.status,
    titleInfo.title,
  ])

  const applyTitle = (
    friendlyIdToUpdate: string,
    title: string,
    source: 'auto' | 'manual' = 'auto',
  ) => {
    updateSessionTitleState(friendlyIdToUpdate, {
      title,
      source,
      status: 'ready',
      error: null,
    })
    queryClient.setQueryData(
      chatQueryKeys.sessions,
      function updateSessions(existing: unknown) {
        if (!Array.isArray(existing)) return existing
        return existing.map((session) => {
          if (
            session &&
            typeof session === 'object' &&
            (session as SessionMeta).friendlyId === friendlyIdToUpdate
          ) {
            return {
              ...(session as SessionMeta),
              derivedTitle: title,
              titleStatus: 'ready',
              titleSource: source,
              titleError: null,
            }
          }
          return session
        })
      },
    )
  }

  const mutation = useMutation({
    mutationFn: async (payload: GenerateTitlePayload) => {
      const res = await fetch('/api/session-title', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          friendlyId: payload.friendlyId,
          sessionKey: payload.sessionKey,
          messages: payload.snippet,
          maxWords: 5,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as GenerateTitleResponse
      if (!res.ok || !data.ok || !data.title) {
        const message =
          data.error ?? (await res.text().catch(() => 'Failed to generate'))
        throw new Error(message)
      }
      return { payload, data }
    },
    onSuccess: ({ payload, data }) => {
      applyTitle(payload.friendlyId, data.title, 'auto')
    },
    onError: (error: unknown, payload) => {
      const fallbackTitle = generateSessionTitle(payload.snippet, {
        maxLength: 40,
        maxWords: 6,
      })
      if (fallbackTitle) {
        applyTitle(payload.friendlyId, fallbackTitle, 'auto')
        return
      }
      updateSessionTitleState(payload.friendlyId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error ?? ''),
      })
    },
  })

  const { mutate, isPending } = mutation

  useEffect(() => {
    if (!shouldGenerate) return
    if (isPending) return
    const lastSignature = lastAttemptSignaturesRef.current[friendlyId]
    if (lastSignature === snippetSignature) return
    lastAttemptSignaturesRef.current[friendlyId] = snippetSignature
    updateSessionTitleState(friendlyId, { status: 'generating', error: null })
    mutate({
      friendlyId,
      sessionKey: sessionKey ?? friendlyId,
      snippet,
      signature: snippetSignature,
    })
  }, [
    friendlyId,
    isPending,
    mutate,
    sessionKey,
    shouldGenerate,
    snippet,
    snippetSignature,
  ])
}
