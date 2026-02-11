import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { AlertDiamondIcon, ArrowTurnBackwardIcon } from '@hugeicons/core-free-icons'

type AgentEntry = { id: string; name?: string }
type AgentsData = { defaultId?: string; mainKey?: string; scope?: string; agents?: AgentEntry[] }

export function AgentsScreen() {
  const query = useQuery({
    queryKey: ['gateway', 'agents'],
    queryFn: async () => {
      const res = await fetch('/api/gateway/agents')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Gateway error')
      return json.data as AgentsData
    },
    refetchInterval: 15_000,
    retry: 1,
  })

  const lastUpdated = query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleTimeString() : null
  const agents = query.data?.agents || []

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-primary-200">
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold text-ink">Agents</h1>
          {query.isFetching && !query.isLoading ? <span className="text-[10px] text-primary-500 animate-pulse">syncing…</span> : null}
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
        ) : (
          <>
            {/* Config summary */}
            <div className="flex gap-6 mb-6 text-[13px]">
              <div>
                <span className="text-[11px] font-medium text-primary-500 uppercase tracking-wider">Default Agent</span>
                <p className="font-medium text-ink mt-0.5">{query.data?.defaultId || '—'}</p>
              </div>
              <div>
                <span className="text-[11px] font-medium text-primary-500 uppercase tracking-wider">Main Key</span>
                <p className="font-medium text-ink mt-0.5">{query.data?.mainKey || '—'}</p>
              </div>
              <div>
                <span className="text-[11px] font-medium text-primary-500 uppercase tracking-wider">Scope</span>
                <p className="font-medium text-ink mt-0.5">{query.data?.scope || '—'}</p>
              </div>
            </div>

            {/* Agent cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {agents.map((agent) => {
                const isDefault = agent.id === query.data?.defaultId
                return (
                  <div
                    key={agent.id}
                    className={`rounded-lg border p-4 transition-colors ${
                      isDefault ? 'border-orange-300 bg-orange-50/50' : 'border-primary-200 hover:bg-primary-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[13px] text-ink">{agent.name || agent.id}</span>
                      {isDefault ? (
                        <span className="text-[10px] font-medium bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">default</span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-primary-500 mt-1 font-mono">{agent.id}</p>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
