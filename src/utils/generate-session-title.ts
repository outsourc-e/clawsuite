const DEFAULT_MAX_LENGTH = 40
const DEFAULT_MAX_WORDS = 7

type SessionCategory =
  | 'coding'
  | 'research'
  | 'config'
  | 'creative'
  | 'analysis'
  | 'chat'

const CATEGORY_EMOJI: Record<SessionCategory, string> = {
  coding: '🔧',
  research: '🔍',
  config: '⚙️',
  creative: '🎨',
  analysis: '📊',
  chat: '💬',
}

const CATEGORY_KEYWORDS: Record<
  Exclude<SessionCategory, 'chat'>,
  Array<string>
> = {
  coding: [
    'code',
    'coding',
    'debug',
    'bug',
    'error',
    'stack trace',
    'typescript',
    'javascript',
    'react',
    'test',
    'build',
    'lint',
    'function',
    'api',
    'query',
  ],
  research: [
    'research',
    'source',
    'citation',
    'paper',
    'study',
    'docs',
    'documentation',
    'compare',
    'find',
    'search',
    'look up',
    'latest',
    'news',
  ],
  config: [
    'config',
    'configuration',
    'setting',
    'settings',
    'setup',
    'install',
    'environment',
    '.env',
    'deploy',
    'docker',
    'pipeline',
    'ci',
    'workflow',
    'permission',
  ],
  creative: [
    'creative',
    'brainstorm',
    'idea',
    'name',
    'naming',
    'story',
    'poem',
    'script',
    'copy',
    'rewrite',
    'draft',
  ],
  analysis: [
    'analyze',
    'analysis',
    'evaluate',
    'tradeoff',
    'trade-off',
    'pros',
    'cons',
    'performance',
    'metrics',
    'data',
    'summary',
    'summarize',
    'report',
  ],
}

const NOISE_PREFIXES =
  /^(?:hey|hi|hello|ok(?:ay)?|so|well|please|kindly|um|uh|can you|could you|would you|will you|i want(?: to)?|i need(?: to)?|help me(?: with)?|let'?s|lets|also|just)\b[\s,:-]*/i

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'if',
  'then',
  'else',
  'for',
  'to',
  'of',
  'in',
  'on',
  'at',
  'with',
  'from',
  'by',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'they',
  'them',
  'can',
  'could',
  'would',
  'should',
  'will',
  'do',
  'does',
  'did',
  'how',
  'what',
  'why',
  'when',
  'where',
  'who',
  'which',
  'about',
  'into',
  'over',
  'under',
  'again',
  'still',
  'just',
  'also',
  'please',
  'help',
  'need',
  'want',
])

const UPPERCASE_TOKENS = new Set([
  'api',
  'ci',
  'css',
  'html',
  'json',
  'sdk',
  'sql',
  'ui',
  'ux',
])

const TOKEN_OVERRIDES: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  nextjs: 'Next.js',
  react: 'React',
  tailwind: 'Tailwind',
}

export type SessionTitleSnippet = Array<{ role: string; text: string }>

function stripNoisePrefixes(text: string): string {
  let stripped = text.trim()
  let previous = ''
  while (stripped && stripped !== previous) {
    previous = stripped
    stripped = stripped.replace(NOISE_PREFIXES, '').trim()
  }
  return stripped
}

function cleanText(raw: string): string {
  let text = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*`_~[\]()]/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  text = stripNoisePrefixes(text)
  return text
}

function normalizeToken(rawToken: string): string {
  return rawToken
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/gu, '')
    .replace(/[^\p{L}\p{N}]+$/gu, '')
    .replace(/-/g, '')
    .trim()
}

function tokenizeMeaningful(text: string): Array<string> {
  return text
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length > 1 && !/^\d+$/.test(token))
    .filter((token) => !STOP_WORDS.has(token))
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

function formatToken(token: string): string {
  if (TOKEN_OVERRIDES[token]) return TOKEN_OVERRIDES[token]
  if (UPPERCASE_TOKENS.has(token)) return token.toUpperCase()
  return `${token.charAt(0).toUpperCase()}${token.slice(1)}`
}

function detectCategory(snippet: SessionTitleSnippet): SessionCategory {
  const combined = snippet
    .map((message) => cleanText(message.text).toLowerCase())
    .join(' ')
  if (!combined) return 'chat'

  let bestCategory: SessionCategory = 'chat'
  let bestScore = 0
  const orderedCategories = [
    'coding',
    'research',
    'config',
    'analysis',
    'creative',
  ] as const

  for (const category of orderedCategories) {
    const keywords = CATEGORY_KEYWORDS[category]
    let score = 0
    for (const keyword of keywords) {
      if (combined.includes(keyword)) score += 1
    }
    if (score > bestScore) {
      bestScore = score
      bestCategory = category
    }
  }

  return bestScore > 0 ? bestCategory : 'chat'
}

function primaryCandidate(snippet: SessionTitleSnippet): string {
  const firstUser = snippet.find((message) => message.role === 'user')
  if (firstUser?.text) return cleanText(firstUser.text)
  const firstAssistant = snippet.find((message) => message.role === 'assistant')
  if (firstAssistant?.text) return cleanText(firstAssistant.text)
  return ''
}

function scoreContextTokens(snippet: SessionTitleSnippet): Array<string> {
  const scores = new Map<string, number>()
  for (const message of snippet) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    const cleaned = cleanText(message.text)
    if (!cleaned) continue
    const tokens = tokenizeMeaningful(cleaned)
    const roleWeight = message.role === 'user' ? 3 : 2
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]
      const earlyBonus = index < 5 ? 1 : 0
      const score = (scores.get(token) ?? 0) + roleWeight + earlyBonus
      scores.set(token, score)
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([token]) => token)
}

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

  const category = detectCategory(snippet)
  const primary = primaryCandidate(snippet)
  const titleTokens = tokenizeMeaningful(primary)
  const contextTokens = scoreContextTokens(snippet)
  const selected: Array<string> = []

  for (const token of titleTokens) {
    if (!selected.includes(token)) selected.push(token)
    if (selected.length >= maxWords) break
  }

  for (const token of contextTokens) {
    if (!selected.includes(token)) selected.push(token)
    if (selected.length >= maxWords) break
  }

  if (selected.length === 0) {
    const fallbackWords = cleanText(primary)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, maxWords)
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    if (!fallbackWords.length) return ''
    return truncateToLength(
      `${CATEGORY_EMOJI[category]} ${fallbackWords.join(' ')}`,
      maxLength,
    )
  }

  const coreTitle = selected.map(formatToken).join(' ')
  const decorated = `${CATEGORY_EMOJI[category]} ${coreTitle}`
  return truncateToLength(decorated, maxLength)
}
