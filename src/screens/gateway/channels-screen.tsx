import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { AlertDiamondIcon, ArrowTurnBackwardIcon } from '@hugeicons/core-free-icons'

type ChannelInfo = {
  configured?: boolean
  running?: boolean
  mode?: string
  lastStartAt?: number | null
  lastStopAt?: number | null
  lastError?: string | null
}

type ChannelsData = {
  channels?: Record<string, ChannelInfo>
  channelLabels?: Record<string, string>
  channelDetailLabels?: Record<string, string>
}

function StatusDot({ running }: { running?: boolean }) {
  return (
    <span
      className={`inline-block size-2 rounded-full ${running ? 'bg-emerald-500' : 'bg-red-500'}`}
    />
  )
}

function formatTime(ts?: number | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function ChannelsScreen() {
  const query = useQuery({
    queryKey: ['gateway', 'channels'],
    queryFn: async () => {
      const res = await fetch('/api/gateway/channels')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Gateway error')
      return json.data as ChannelsData
    },
    refetchInterval: 5_000,
    retry: 1,
  })

  const lastUpdated = query.dataUpdatedAt
    ? new Date(query.dataUpdatedAt).toLocaleTimeString()
    : null

  const channels = query.data?.channels || {}
  const labels = query.data?.channelLabels || {}
  const detailLabels = query.data?.channelDetailLabels || {}

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-primary-200">
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold text-ink">Channels</h1>
          {query.isFetching && !query.isLoading ? (
            <span className="text-[10px] text-primary-500 animate-pulse">syncing…</span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated ? <span className="text-[10px] text-primary-500">Updated {lastUpdated}</span> : null}
          <span className={`inline-block size-2 rounded-full ${query.isError ? 'bg-red-500' : query.isSuccess ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {query.isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex items-center gap-2 text-primary-500">
              <div className="size-4 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
              <span className="text-sm">Connecting to gateway…</span>
            </div>
          </div>
        ) : query.isError ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3">
            <HugeiconsIcon icon={AlertDiamondIcon} size={24} strokeWidth={1.5} className="text-red-500" />
            <p className="text-sm text-primary-600">{query.error instanceof Error ? query.error.message : 'Failed to fetch'}</p>
            <button type="button" onClick={() => query.refetch()} className="inline-flex items-center gap-1.5 rounded-md border border-primary-200 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100">
              <HugeiconsIcon icon={ArrowTurnBackwardIcon} size={14} strokeWidth={1.5} />Retry
            </button>
          </div>
        ) : Object.keys(channels).length === 0 ? (
          <p className="text-sm text-primary-500 text-center py-8">No channels configured.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-primary-200 text-left">
                <th className="pb-2 text-[11px] font-medium text-primary-500 uppercase tracking-wider">Channel</th>
                <th className="pb-2 text-[11px] font-medium text-primary-500 uppercase tracking-wider">Status</th>
                <th className="pb-2 text-[11px] font-medium text-primary-500 uppercase tracking-wider">Mode</th>
                <th className="pb-2 text-[11px] font-medium text-primary-500 uppercase tracking-wider">Type</th>
                <th className="pb-2 text-[11px] font-medium text-primary-500 uppercase tracking-wider">Last Started</th>
                <th className="pb-2 text-[11px] font-medium text-primary-500 uppercase tracking-wider">Error</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(channels).map(([key, ch]) => (
                <tr key={key} className="border-b border-primary-100 hover:bg-primary-50 transition-colors">
                  <td className="py-3 font-medium text-ink">{labels[key] || key}</td>
                  <td className="py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot running={ch.running} />
                      <span className={ch.running ? 'text-emerald-700' : 'text-red-600'}>
                        {ch.running ? 'Running' : 'Stopped'}
                      </span>
                    </span>
                  </td>
                  <td className="py-3 text-primary-600">{ch.mode || '—'}</td>
                  <td className="py-3 text-primary-600">{detailLabels[key] || '—'}</td>
                  <td className="py-3 text-primary-600">{formatTime(ch.lastStartAt)}</td>
                  <td className="py-3 text-red-600 text-xs">{ch.lastError || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
