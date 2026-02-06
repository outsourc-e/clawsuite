import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

const CACHE_TTL_MS = 30_000

let cached:
  | {
      timestamp: number
      payload: ProviderUsageResponse
    }
  | undefined

export type ProviderUsageEntry = {
  provider: string
  status: 'ok' | 'missing_key' | 'error'
  message?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
  limitUsd?: number
  limitTokens?: number
  percentUsed?: number
  rateLimits?: Array<{ label: string; value: string }>
  updatedAt?: number
}

export type ProviderUsageResponse = {
  ok: boolean
  updatedAt: number
  providers: Array<ProviderUsageEntry>
  error?: string
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function formatRateLimit(value: number | undefined, interval?: string) {
  if (!value) return undefined
  if (!interval) return `${value}/min`
  return `${value}/${interval}`
}

function buildPercent(
  costUsd?: number,
  limitUsd?: number,
  totalTokens?: number,
  limitTokens?: number,
): number | undefined {
  if (limitUsd && costUsd !== undefined && limitUsd > 0) {
    return (costUsd / limitUsd) * 100
  }
  if (limitTokens && totalTokens !== undefined && limitTokens > 0) {
    return (totalTokens / limitTokens) * 100
  }
  return undefined
}

async function fetchOpenRouterUsage(): Promise<ProviderUsageEntry> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    return {
      provider: 'OpenRouter',
      status: 'missing_key',
      message: 'Missing OPENROUTER_API_KEY',
      updatedAt: Date.now(),
    }
  }

  const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    return {
      provider: 'OpenRouter',
      status: 'error',
      message: errorText || res.statusText || 'Request failed',
      updatedAt: Date.now(),
    }
  }

  const payload = (await res.json().catch(() => ({})))
  const data = payload?.data ?? payload
  const usage = data?.usage ?? data?.usage_info ?? data?.usageInfo ?? {}

  const inputTokens =
    readNumber(
      usage?.prompt_tokens ??
        usage?.promptTokens ??
        usage?.input_tokens ??
        usage?.inputTokens,
    ) ?? 0
  const outputTokens =
    readNumber(
      usage?.completion_tokens ??
        usage?.completionTokens ??
        usage?.output_tokens ??
        usage?.outputTokens,
    ) ?? 0
  const totalTokens =
    readNumber(usage?.total_tokens ?? usage?.totalTokens) ??
    inputTokens + outputTokens
  const costUsd =
    readNumber(
      usage?.cost ??
        usage?.total_cost ??
        usage?.costUsd ??
        data?.cost ??
        data?.usage_cost,
    ) ?? 0
  const limitUsd = readNumber(
    data?.limit ?? data?.usage_limit ?? data?.spend_limit ?? data?.spend_limit_usd,
  )
  const limitTokens = readNumber(
    data?.rate_limit?.tokens ??
      data?.rate_limit?.token_limit ??
      data?.limits?.tokens,
  )

  const rateLimits: Array<{ label: string; value: string }> = []
  const rateLimitInterval =
    data?.rate_limit?.interval ?? data?.rate_limit?.window ?? 'min'
  const reqLimit = readNumber(
    data?.rate_limit?.requests ?? data?.rate_limit?.request_limit,
  )
  const tokLimit = readNumber(
    data?.rate_limit?.tokens ?? data?.rate_limit?.token_limit,
  )
  const reqFormatted = formatRateLimit(reqLimit, rateLimitInterval)
  const tokFormatted = formatRateLimit(tokLimit, rateLimitInterval)
  if (reqFormatted) rateLimits.push({ label: 'Requests', value: reqFormatted })
  if (tokFormatted) rateLimits.push({ label: 'Tokens', value: tokFormatted })

  return {
    provider: 'OpenRouter',
    status: 'ok',
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd,
    limitUsd,
    limitTokens,
    percentUsed: buildPercent(costUsd, limitUsd, totalTokens, limitTokens),
    rateLimits,
    updatedAt: Date.now(),
  }
}

async function fetchAnthropicUsage(): Promise<ProviderUsageEntry> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    return {
      provider: 'Anthropic',
      status: 'missing_key',
      message: 'Missing ANTHROPIC_API_KEY',
      updatedAt: Date.now(),
    }
  }

  const res = await fetch('https://api.anthropic.com/v1/usage', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    return {
      provider: 'Anthropic',
      status: 'error',
      message: errorText || res.statusText || 'Request failed',
      updatedAt: Date.now(),
    }
  }

  const payload = (await res.json().catch(() => ({})))
  const data = payload?.data ?? payload
  const usage = data?.usage ?? data?.summary ?? data?.totals ?? data

  const inputTokens =
    readNumber(
      usage?.input_tokens ??
        usage?.inputTokens ??
        usage?.prompt_tokens ??
        usage?.promptTokens,
    ) ?? 0
  const outputTokens =
    readNumber(
      usage?.output_tokens ??
        usage?.outputTokens ??
        usage?.completion_tokens ??
        usage?.completionTokens,
    ) ?? 0
  const totalTokens =
    readNumber(usage?.total_tokens ?? usage?.totalTokens) ??
    inputTokens + outputTokens
  const costUsd =
    readNumber(usage?.cost ?? usage?.total_cost ?? usage?.costUsd) ?? 0
  const limitUsd = readNumber(
    data?.limit ?? data?.spend_limit ?? data?.spend_cap ?? data?.usage_limit,
  )

  return {
    provider: 'Anthropic',
    status: 'ok',
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd,
    limitUsd,
    percentUsed: buildPercent(costUsd, limitUsd, totalTokens, undefined),
    rateLimits: [],
    updatedAt: Date.now(),
  }
}

async function getProviderUsage(): Promise<ProviderUsageResponse> {
  const now = Date.now()
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.payload
  }

  const providers = await Promise.all([
    fetchOpenRouterUsage().catch((err) => ({
      provider: 'OpenRouter',
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      updatedAt: Date.now(),
    })),
    fetchAnthropicUsage().catch((err) => ({
      provider: 'Anthropic',
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      updatedAt: Date.now(),
    })),
  ])

  const payload: ProviderUsageResponse = {
    ok: true,
    updatedAt: now,
    providers,
  }

  cached = {
    timestamp: now,
    payload,
  }

  return payload
}

export const Route = createFileRoute('/api/provider-usage')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const payload = await getProviderUsage()
          return json(payload)
        } catch (err) {
          return json(
            {
              ok: false,
              updatedAt: Date.now(),
              providers: [],
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
