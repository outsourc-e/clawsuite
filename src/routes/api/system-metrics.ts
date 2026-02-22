import { execSync } from 'node:child_process'
import os from 'node:os'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'
import { gatewayRpc } from '@/server/gateway'

type CpuTimesSnapshot = {
  idle: number
  total: number
}

let lastCpuSnapshot: CpuTimesSnapshot | null = null

function readCpuSnapshot(): CpuTimesSnapshot {
  let idle = 0
  let total = 0

  for (const cpu of os.cpus()) {
    idle += cpu.times.idle
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.idle +
      cpu.times.irq
  }

  return { idle, total }
}

function readCpuPercent(): number {
  const current = readCpuSnapshot()
  const previous = lastCpuSnapshot
  lastCpuSnapshot = current

  if (!previous) return 0

  const totalDelta = current.total - previous.total
  const idleDelta = current.idle - previous.idle
  if (totalDelta <= 0) return 0

  const usage = (1 - idleDelta / totalDelta) * 100
  return Math.max(0, Math.min(100, Number(usage.toFixed(1))))
}

function readDiskPercent(): number {
  try {
    const output = execSync('df -k /', {
      encoding: 'utf8',
      timeout: 1_500,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const lines = output.trim().split('\n')
    const dataLine = lines[lines.length - 1] ?? ''
    const match = dataLine.match(/\s(\d+)%\s+/)
    const value = match ? Number(match[1]) : NaN
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(100, value))
  } catch {
    return 0
  }
}

async function readGatewayConnected(): Promise<boolean> {
  try {
    await Promise.race([
      gatewayRpc('status'),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Gateway status timed out')), 1_500)
      }),
    ])
    return true
  } catch {
    return false
  }
}

export const Route = createFileRoute('/api/system-metrics')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const cpu = readCpuPercent()
        const ramTotal = os.totalmem()
        const ramFree = os.freemem()
        const ramUsed = Math.max(0, ramTotal - ramFree)
        const diskPercent = readDiskPercent()
        const uptime = Math.max(0, Math.floor(process.uptime()))
        const gatewayConnected = await readGatewayConnected()

        return json({
          cpu,
          ramUsed,
          ramTotal,
          diskPercent,
          uptime,
          gatewayConnected,
        })
      },
    },
  },
})

