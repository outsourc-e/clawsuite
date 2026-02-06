import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'motion/react'

type ChannelStatus = 'online' | 'syncing' | 'degraded'
type ActivityStatus = 'completed' | 'running' | 'attention'

type Channel = {
  name: string
  status: ChannelStatus
  unread: number
}

type ActivityItem = {
  agent: string
  action: string
  time: string
  status: ActivityStatus
}

const kpis = [
  {
    label: 'Revenue',
    value: '$67,432/mo',
    meta: '+23.1%',
    positive: true,
  },
  {
    label: 'Active Clients',
    value: '47',
    meta: '8 onboarding',
    positive: true,
  },
  {
    label: 'Response Time',
    value: '< 2min',
    meta: 'SLA: 99.1%',
    positive: true,
  },
]

const channels: Array<Channel> = [
  { name: 'Discord', status: 'online', unread: 14 },
  { name: 'WhatsApp', status: 'online', unread: 9 },
  { name: 'iMessage', status: 'syncing', unread: 6 },
  { name: 'Telegram', status: 'online', unread: 4 },
  { name: 'Email', status: 'degraded', unread: 21 },
  { name: 'Slack', status: 'online', unread: 2 },
]

const activityFeed: Array<ActivityItem> = [
  {
    agent: 'triage-agent',
    action: 'Escalated high-value lead from Discord to priority queue',
    time: 'Just now',
    status: 'completed',
  },
  {
    agent: 'sales-ops',
    action: 'Published follow-up sequence for 12 warm prospects',
    time: '2m ago',
    status: 'running',
  },
  {
    agent: 'qa-monitor',
    action: 'Flagged delayed reply in VIP iMessage channel',
    time: '5m ago',
    status: 'attention',
  },
  {
    agent: 'retention-bot',
    action: 'Recovered 3 dormant accounts with offer automation',
    time: '7m ago',
    status: 'completed',
  },
  {
    agent: 'billing-sync',
    action: 'Reconciled monthly revenue snapshot and payout ledger',
    time: '10m ago',
    status: 'completed',
  },
]

const revenueSeries = [18, 22, 24, 28, 31, 34, 39, 43, 45, 51, 57, 63]

const systemStats = [
  { label: 'Memory', value: 67 },
  { label: 'CPU', value: 42 },
  { label: 'Network', value: 89 },
]

const statusClass: Record<ChannelStatus, string> = {
  online: 'bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.75)]',
  syncing: 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.75)]',
  degraded: 'bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.75)]',
}

const activityClass: Record<ActivityStatus, string> = {
  completed: 'text-emerald-300 border-emerald-300/35 bg-emerald-400/10',
  running: 'text-cyan-300 border-cyan-300/35 bg-cyan-400/10',
  attention: 'text-amber-300 border-amber-300/35 bg-amber-400/10',
}

function RevenueChart() {
  const width = 760
  const height = 220
  const max = Math.max(...revenueSeries)
  const min = Math.min(...revenueSeries)
  const range = max - min || 1
  const step = width / (revenueSeries.length - 1)

  const points = revenueSeries
    .map(function mapPoint(value, index) {
      const x = index * step
      const y = height - ((value - min) / range) * (height - 30) - 10
      return `${x},${y}`
    })
    .join(' ')

  const area = `0,${height} ${points} ${width},${height}`

  return (
    <div className="h-60 w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Revenue trend"
      >
        <defs>
          <linearGradient id="auroraRevenueStroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#4ade80" />
          </linearGradient>
          <linearGradient id="auroraRevenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(74,222,128,0.35)" />
            <stop offset="100%" stopColor="rgba(74,222,128,0)" />
          </linearGradient>
        </defs>
        <polyline points={area} fill="url(#auroraRevenueFill)" stroke="none" />
        <polyline
          points={points}
          fill="none"
          stroke="url(#auroraRevenueStroke)"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

export const Route = createFileRoute('/aurora-demo')({
  component: AuroraDemoRoute,
})

function AuroraDemoRoute() {
  const now = new Date().toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <main className="relative h-screen overflow-hidden bg-[#03070f] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-24 h-96 w-96 rounded-full bg-cyan-400/20 blur-[100px]" />
        <div className="absolute top-1/3 -right-16 h-80 w-80 rounded-full bg-emerald-400/20 blur-[120px]" />
        <div className="absolute -bottom-24 left-1/4 h-80 w-80 rounded-full bg-blue-500/20 blur-[120px]" />
      </div>

      <motion.section
        className="relative mx-auto grid h-full w-full max-w-[1700px] grid-cols-1 gap-4 p-4 md:grid-cols-12 md:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
      >
        <div className="md:col-span-8 lg:col-span-9">
          <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-12">
            <article className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl lg:col-span-12">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/85">
                  Aurora Command Center
                </p>
                <p className="text-xs text-white/70">{now}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {kpis.map(function renderKpi(kpi, index) {
                  return (
                    <motion.div
                      key={kpi.label}
                      className="rounded-xl border border-white/10 bg-[#0d1322]/70 px-4 py-3"
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.08 * index }}
                    >
                      <p className="text-xs uppercase tracking-[0.14em] text-white/60">{kpi.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{kpi.value}</p>
                      <p className={kpi.positive ? 'text-sm text-emerald-300' : 'text-sm text-rose-300'}>
                        {kpi.meta}
                      </p>
                    </motion.div>
                  )
                })}
              </div>
            </article>

            <article className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl lg:col-span-7 xl:col-span-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-medium">Agent Activity Feed</h2>
                <span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-200">
                  Live
                </span>
              </div>
              <div className="space-y-3">
                {activityFeed.map(function renderActivity(item) {
                  return (
                    <div
                      key={`${item.agent}-${item.action}`}
                      className="rounded-xl border border-white/10 bg-[#0d1322]/70 px-4 py-3"
                    >
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="font-mono text-xs uppercase tracking-[0.12em] text-white/70">
                          {item.agent}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${activityClass[item.status]}`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="text-sm text-white/90">{item.action}</p>
                      <p className="mt-2 text-xs text-white/55">{item.time}</p>
                    </div>
                  )
                })}
              </div>
            </article>

            <article className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl lg:col-span-5 xl:col-span-4">
              <h2 className="mb-4 text-lg font-medium">Channel Status</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {channels.map(function renderChannel(channel) {
                  return (
                    <div
                      key={channel.name}
                      className="rounded-xl border border-white/10 bg-[#0d1322]/70 px-4 py-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium text-white">{channel.name}</p>
                        <span className={`size-2.5 rounded-full ${statusClass[channel.status]}`} />
                      </div>
                      <p className="text-xs text-white/60">
                        {channel.status === 'online' ? 'Operational' : channel.status === 'syncing' ? 'Syncing' : 'Degraded'}
                      </p>
                      <p className="mt-1 text-xs text-cyan-200">{channel.unread} unread</p>
                    </div>
                  )
                })}
              </div>
            </article>

            <article className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl lg:col-span-12">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-medium">Revenue Performance</h2>
                <span className="rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-200">
                  Trending Up
                </span>
              </div>
              <RevenueChart />
            </article>
          </div>
        </div>

        <div className="md:col-span-4 lg:col-span-3">
          <article className="h-full rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl">
            <h2 className="mb-4 text-lg font-medium">System Stats</h2>
            <div className="space-y-5">
              {systemStats.map(function renderSystemStat(stat) {
                return (
                  <div key={stat.label}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-white/75">{stat.label}</span>
                      <span className="font-medium text-white">{stat.value}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300"
                        initial={{ width: 0 }}
                        animate={{ width: `${stat.value}%` }}
                        transition={{ duration: 0.8 }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-8 rounded-xl border border-white/10 bg-[#0d1322]/70 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-white/55">Ops Readiness</p>
              <p className="mt-2 text-3xl font-semibold text-emerald-300">97.4%</p>
              <p className="mt-1 text-sm text-white/65">All critical automations online</p>
            </div>
          </article>
        </div>
      </motion.section>
    </main>
  )
}
