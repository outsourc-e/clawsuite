'use client'

import { useState } from 'react'
import { DialogClose, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type ModelUsage = {
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}

type SessionUsage = {
  id: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  startedAt?: number
  updatedAt?: number
}

type UsageSummary = {
  inputTokens: number
  outputTokens: number
  contextPercent: number
  dailyCost: number
  models: Array<ModelUsage>
  sessions: Array<SessionUsage>
}

type ProviderUsage = {
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

type UsageDetailsModalProps = {
  usage: UsageSummary
  error: string | null
  providerUsage: Array<ProviderUsage>
  providerError: string | null
  providerUpdatedAt: number | null
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 10 ? 2 : 3,
  }).format(value)
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return Math.round(value).toString()
}

function formatTimestamp(value?: number): string {
  if (!value) return '—'
  const date = new Date(value < 1_000_000_000_000 ? value * 1000 : value)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatPercent(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return '—'
  return `${Math.round(value)}%`
}

function buildCsv(usage: UsageSummary): string {
  const rows: Array<string> = []
  rows.push('Usage Summary')
  rows.push('Metric,Value')
  rows.push(`Input Tokens,${usage.inputTokens}`)
  rows.push(`Output Tokens,${usage.outputTokens}`)
  rows.push(`Context %,${usage.contextPercent}`)
  rows.push(`Daily Cost,${usage.dailyCost}`)
  rows.push('')

  rows.push('Cost Per Model')
  rows.push('Model,Input Tokens,Output Tokens,Cost (USD)')
  usage.models.forEach((model) => {
    rows.push(
      `${model.model},${model.inputTokens},${model.outputTokens},${model.costUsd.toFixed(4)}`,
    )
  })
  rows.push('')

  rows.push('Session History')
  rows.push('Session,Model,Input Tokens,Output Tokens,Cost (USD),Start,Last Updated')
  usage.sessions.forEach((session) => {
    rows.push(
      `${session.id},${session.model},${session.inputTokens},${session.outputTokens},${session.costUsd.toFixed(4)},${formatTimestamp(session.startedAt)},${formatTimestamp(session.updatedAt)}`,
    )
  })

  return rows.join('\n')
}

export function UsageDetailsModal({
  usage,
  error,
  providerUsage,
  providerError,
  providerUpdatedAt,
}: UsageDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'session' | 'providers'>('session')

  const handleExport = () => {
    const csv = buildCsv(usage)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `usage-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex max-h-[80vh] flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <DialogTitle>Usage Overview</DialogTitle>
          <DialogDescription>
            Live usage summary from the OpenClaw gateway and providers.
          </DialogDescription>
        </div>
        <DialogClose className="text-primary-700">Close</DialogClose>
      </div>

      <div className="flex w-fit items-center gap-1 rounded-full border border-primary-100 bg-primary-50 p-1 text-xs">
        {(['session', 'providers'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-3 py-1 font-medium transition ${
              activeTab === tab
                ? 'bg-white text-primary-900 shadow-sm'
                : 'text-primary-600 hover:text-primary-800'
            }`}
          >
            {tab === 'session' ? 'Session' : 'Providers'}
          </button>
        ))}
      </div>

      {activeTab === 'session' ? (
        <>
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-primary-200 bg-white/60 p-3">
              <div className="text-xs uppercase tracking-wide text-primary-500">
                Input Tokens
              </div>
              <div className="text-xl font-semibold text-primary-900">
                {formatTokens(usage.inputTokens)}
              </div>
            </div>
            <div className="rounded-2xl border border-primary-200 bg-white/60 p-3">
              <div className="text-xs uppercase tracking-wide text-primary-500">
                Output Tokens
              </div>
              <div className="text-xl font-semibold text-primary-900">
                {formatTokens(usage.outputTokens)}
              </div>
            </div>
            <div className="rounded-2xl border border-primary-200 bg-white/60 p-3">
              <div className="text-xs uppercase tracking-wide text-primary-500">
                Daily Cost
              </div>
              <div className="text-xl font-semibold text-primary-900">
                {formatCurrency(usage.dailyCost)}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-primary-200 bg-white/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-primary-900">
                Cost per model
              </div>
            </div>
            <div className="grid gap-2">
              {usage.models.length === 0 ? (
                <div className="text-sm text-primary-500">
                  No model usage reported yet.
                </div>
              ) : (
                usage.models.map((model) => (
                  <div
                    key={model.model}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-100 bg-white px-3 py-2 text-sm"
                  >
                    <div className="font-medium text-primary-800">
                      {model.model}
                    </div>
                    <div className="text-primary-600">
                      {formatTokens(model.inputTokens)} in ·{' '}
                      {formatTokens(model.outputTokens)} out
                    </div>
                    <div className="font-semibold text-primary-900">
                      {formatCurrency(model.costUsd)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-primary-200 bg-white/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-primary-900">
                Session history
              </div>
            </div>
            <div className="grid gap-2">
              {usage.sessions.length === 0 ? (
                <div className="text-sm text-primary-500">
                  No sessions reported yet.
                </div>
              ) : (
                usage.sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-100 bg-white px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium text-primary-800">
                        {session.id}
                      </div>
                      <div className="text-xs text-primary-500">
                        {session.model}
                      </div>
                    </div>
                    <div className="text-primary-600">
                      {formatTokens(session.inputTokens)} in ·{' '}
                      {formatTokens(session.outputTokens)} out
                    </div>
                    <div className="text-xs text-primary-500">
                      {formatTimestamp(session.startedAt)} →{' '}
                      {formatTimestamp(session.updatedAt)}
                    </div>
                    <div className="font-semibold text-primary-900">
                      {formatCurrency(session.costUsd)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-primary-500">
              Context usage: {Math.round(usage.contextPercent)}%
            </div>
            <Button size="sm" variant="outline" onClick={handleExport}>
              Export CSV
            </Button>
          </div>
        </>
      ) : (
        <>
          {providerError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {providerError}
            </div>
          ) : null}

          <div className="grid gap-3">
            {providerUsage.length === 0 ? (
              <div className="rounded-2xl border border-primary-200 bg-white/70 p-4 text-sm text-primary-500">
                No provider usage available yet.
              </div>
            ) : (
              providerUsage.map((provider) => {
                const percent = provider.percentUsed
                const percentDisplay = formatPercent(percent)
                const totalTokens =
                  provider.totalTokens ??
                  (provider.inputTokens ?? 0) + (provider.outputTokens ?? 0)

                return (
                  <div
                    key={provider.provider}
                    className="rounded-2xl border border-primary-200 bg-white/70 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-primary-900">
                          {provider.provider}
                        </div>
                        <div className="text-xs text-primary-500">
                          Last updated {formatTimestamp(provider.updatedAt)}
                        </div>
                      </div>
                      <div className="text-xs text-primary-500">
                        {provider.status === 'ok'
                          ? 'Connected'
                          : provider.status === 'missing_key'
                            ? 'Missing API key'
                            : 'Error'}
                      </div>
                    </div>

                    {provider.status !== 'ok' ? (
                      <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
                        {provider.message || 'Provider data unavailable.'}
                      </div>
                    ) : (
                      <>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <div className="rounded-xl border border-primary-100 bg-white px-3 py-2">
                            <div className="text-xs uppercase tracking-wide text-primary-500">
                              Tokens Used
                            </div>
                            <div className="text-sm font-semibold text-primary-900">
                              {formatTokens(totalTokens)}
                            </div>
                            <div className="text-xs text-primary-500">
                              {formatTokens(provider.inputTokens ?? 0)} in ·{' '}
                              {formatTokens(provider.outputTokens ?? 0)} out
                            </div>
                          </div>
                          <div className="rounded-xl border border-primary-100 bg-white px-3 py-2">
                            <div className="text-xs uppercase tracking-wide text-primary-500">
                              Total Cost
                            </div>
                            <div className="text-sm font-semibold text-primary-900">
                              {formatCurrency(provider.costUsd ?? 0)}
                            </div>
                            <div className="text-xs text-primary-500">
                              Limit:{' '}
                              {provider.limitUsd
                                ? formatCurrency(provider.limitUsd)
                                : provider.limitTokens
                                  ? `${formatTokens(provider.limitTokens)} tokens`
                                  : '—'}
                            </div>
                          </div>
                          <div className="rounded-xl border border-primary-100 bg-white px-3 py-2">
                            <div className="text-xs uppercase tracking-wide text-primary-500">
                              Usage
                            </div>
                            <div className="text-sm font-semibold text-primary-900">
                              {percentDisplay}
                            </div>
                            <div className="mt-2 h-2 w-full rounded-full bg-primary-100">
                              <div
                                className="h-2 rounded-full bg-primary-500"
                                style={{
                                  width:
                                    percent !== undefined
                                      ? `${Math.min(percent, 100)}%`
                                      : '0%',
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {provider.rateLimits && provider.rateLimits.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-primary-500">
                            {provider.rateLimits.map((limit) => (
                              <div key={limit.label}>
                                {limit.label}: {limit.value}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                )
              })
            )}
          </div>

          <div className="text-xs text-primary-500">
            Provider data refreshed {formatTimestamp(providerUpdatedAt ?? undefined)}
          </div>
        </>
      )}
    </div>
  )
}
