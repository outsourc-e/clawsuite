import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayCronRpc, normalizeCronBool } from '@/server/cron'

function readString(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function resolvePayloadJobId(payload: unknown): string | undefined {
  const row = asRecord(payload)
  const candidates = [row.jobId, row.id, row.key]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return undefined
}

function buildUpsertParams(body: Record<string, unknown>, jobId: string, enabled: boolean) {
  const name = readString(body.name)
  const schedule = readString(body.schedule)
  const description = readString(body.description)
  const payload = body.payload
  const deliveryConfig = body.deliveryConfig

  const sharedRecord = {
    name,
    title: name,
    schedule,
    cron: schedule,
    expression: schedule,
    description: description || undefined,
    enabled,
    active: enabled,
    payload,
    data: payload,
    deliveryConfig,
    delivery: deliveryConfig,
    config: deliveryConfig,
  }

  if (!jobId) {
    return {
      ...sharedRecord,
      job: sharedRecord,
    }
  }

  return {
    jobId,
    id: jobId,
    key: jobId,
    ...sharedRecord,
    job: {
      jobId,
      id: jobId,
      key: jobId,
      ...sharedRecord,
    },
  }
}

export const Route = createFileRoute('/api/cron/upsert')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >

          const jobId = readString(body.jobId || body.id || body.key)
          const name = readString(body.name)
          const schedule = readString(body.schedule || body.cron || body.expression)

          if (!name) {
            return json({ error: 'name is required' }, { status: 400 })
          }
          if (!schedule) {
            return json({ error: 'schedule is required' }, { status: 400 })
          }

          const enabled = normalizeCronBool(body.enabled, true)

          const methods = jobId
            ? [
                'cron.update',
                'cron.jobs.update',
                'scheduler.update',
                'cron.upsert',
                'cron.jobs.upsert',
                'scheduler.upsert',
              ]
            : [
                'cron.create',
                'cron.jobs.create',
                'scheduler.create',
                'cron.upsert',
                'cron.jobs.upsert',
                'scheduler.upsert',
              ]

          const payload = await gatewayCronRpc(
            methods,
            buildUpsertParams(body, jobId, enabled),
          )
          const resolvedJobId = resolvePayloadJobId(payload) ?? (jobId || undefined)

          return json({
            ok: true,
            payload,
            jobId: resolvedJobId,
          })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
