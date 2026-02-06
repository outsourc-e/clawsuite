import type {
  GatewayMessage,
  SessionMeta,
  SessionSummary,
  SessionTitleSource,
  SessionTitleStatus,
  ToolCallContent,
} from './types'

export function deriveFriendlyIdFromKey(key: string | undefined): string {
  if (!key) return 'main'
  const trimmed = key.trim()
  if (trimmed.length === 0) return 'main'
  const parts = trimmed.split(':')
  const tail = parts[parts.length - 1] ?? ''
  const tailTrimmed = tail.trim()
  return tailTrimmed.length > 0 ? tailTrimmed : trimmed
}

export function textFromMessage(msg: GatewayMessage): string {
  const parts = Array.isArray(msg.content) ? msg.content : []
  return parts
    .map((part) => (part.type === 'text' ? String(part.text ?? '') : ''))
    .join('')
    .trim()
}

export function getToolCallsFromMessage(
  msg: GatewayMessage,
): Array<ToolCallContent> {
  const parts = Array.isArray(msg.content) ? msg.content : []
  return parts.filter(
    (part): part is ToolCallContent => part.type === 'toolCall',
  )
}

export function findToolResultForCall(
  toolCallId: string,
  messages: Array<GatewayMessage>,
): GatewayMessage | undefined {
  return messages.find(
    (msg) => msg.role === 'toolResult' && msg.toolCallId === toolCallId,
  )
}

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 1_000_000_000_000) return value * 1000
    return value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return null
}

export function getMessageTimestamp(message: GatewayMessage): number {
  const candidates = [
    (message as any).createdAt,
    (message as any).created_at,
    (message as any).timestamp,
    (message as any).time,
    (message as any).ts,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeTimestamp(candidate)
    if (normalized) return normalized
  }

  return Date.now()
}

function deriveTitleStatus(
  label?: string,
  explicitTitle?: string,
  derivedTitle?: string,
  providedStatus?: SessionTitleStatus,
): SessionTitleStatus {
  if (providedStatus) return providedStatus
  if (label || explicitTitle || derivedTitle) return 'ready'
  return 'idle'
}

function deriveTitleSource(
  label?: string,
  explicitTitle?: string,
  derivedTitle?: string,
  providedSource?: SessionTitleSource,
): SessionTitleSource | undefined {
  if (providedSource) return providedSource
  if (label || explicitTitle) return 'manual'
  if (derivedTitle) return 'auto'
  return undefined
}

export function normalizeSessions(
  rows: Array<SessionSummary> | undefined,
): Array<SessionMeta> {
  if (!Array.isArray(rows)) return []
  return rows.map((session) => {
    const key =
      typeof session.key === 'string' && session.key.trim().length > 0
        ? session.key.trim()
        : deriveFriendlyIdFromKey(session.friendlyId ?? session.key)
    const friendlyIdCandidate =
      typeof session.friendlyId === 'string' &&
      session.friendlyId.trim().length > 0
        ? session.friendlyId.trim()
        : deriveFriendlyIdFromKey(key)

    const label =
      typeof session.label === 'string' && session.label.trim().length > 0
        ? session.label.trim()
        : undefined
    const explicitTitle =
      typeof session.title === 'string' && session.title.trim().length > 0
        ? session.title.trim()
        : undefined
    const derivedTitle =
      typeof session.derivedTitle === 'string' &&
      session.derivedTitle.trim().length > 0
        ? session.derivedTitle.trim()
        : undefined
    const titleStatus = deriveTitleStatus(
      label,
      explicitTitle,
      derivedTitle,
      session.titleStatus,
    )
    const titleSource = deriveTitleSource(
      label,
      explicitTitle,
      derivedTitle,
      session.titleSource,
    )

    return {
      key,
      friendlyId: friendlyIdCandidate,
      title: explicitTitle,
      derivedTitle,
      label,
      updatedAt:
        typeof session.updatedAt === 'number' ? session.updatedAt : undefined,
      lastMessage: session.lastMessage ?? null,
      titleStatus,
      titleSource,
      titleError: session.titleError ?? null,
    }
  })
}

export async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (data?.error) return String(data.error)
    if (data?.message) return String(data.message)
    return JSON.stringify(data)
  } catch {
    try {
      return await res.text()
    } catch {
      return res.statusText || 'Request failed'
    }
  }
}

export const missingGatewayAuthMessage =
  'Missing gateway auth. Set CLAWDBOT_GATEWAY_TOKEN (recommended) or CLAWDBOT_GATEWAY_PASSWORD in the server environment.'

export function isMissingGatewayAuth(message: string): boolean {
  return message.includes(missingGatewayAuthMessage)
}
