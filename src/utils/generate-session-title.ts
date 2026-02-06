const DEFAULT_MAX_LENGTH = 40
const DEFAULT_MAX_WORDS = 7

function cleanText(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateToLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const clipped = text.slice(0, maxLength)
  const lastSpace = clipped.lastIndexOf(' ')
  if (lastSpace > 0) {
    return clipped.slice(0, lastSpace).trim()
  }
  return clipped.trim()
}

function takeWords(text: string, maxWords: number): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(' ')
}

export type SessionTitleSnippet = Array<{ role: string; text: string }>

type GenerateSessionTitleOptions = {
  maxLength?: number
  maxWords?: number
}

export function generateSessionTitle(
  snippet: SessionTitleSnippet,
  options: GenerateSessionTitleOptions = {},
): string {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH
  const maxWords = options.maxWords ?? DEFAULT_MAX_WORDS

  const firstUser = snippet.find((message) => message.role === 'user')
  const firstAssistant = snippet.find(
    (message) => message.role === 'assistant',
  )

  const userText = firstUser?.text ? cleanText(firstUser.text) : ''
  const assistantText = firstAssistant?.text
    ? cleanText(firstAssistant.text)
    : ''

  if (!userText && !assistantText) return ''

  let base = takeWords(userText, maxWords)
  if (!base && assistantText) {
    base = takeWords(assistantText, Math.max(3, Math.round(maxWords / 2)))
  }

  if (base.split(' ').length < 3 && assistantText) {
    const extra = takeWords(assistantText, 3)
    if (extra && !base.includes(extra)) {
      base = `${base} ${extra}`.trim()
    }
  }

  const cleaned = cleanText(base)
  if (!cleaned) return ''

  return truncateToLength(cleaned, maxLength)
}
