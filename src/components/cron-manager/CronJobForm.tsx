import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CronJob, CronJobUpsertInput } from './cron-types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

type CronJobFormProps = {
  mode: 'create' | 'edit'
  initialJob: CronJob | null
  pending: boolean
  error: string | null
  onSubmit: (payload: CronJobUpsertInput) => void
  onClose?: () => void
}

// ── Schedule types ────────────────────────────────────────────────────────────

type ScheduleKind = 'cron' | 'every' | 'at'

const SCHEDULE_LABELS: Record<ScheduleKind, string> = {
  cron: 'Cron',
  every: 'Every',
  at: 'At',
}

/** Naive cron expression validator (5 or 6 fields, each field allows digits, *, /, -, ,). */
function validateCronExpr(expr: string): string | null {
  const trimmed = expr.trim()
  if (!trimmed) return 'Cron expression is required.'
  const fields = trimmed.split(/\s+/)
  if (fields.length < 5 || fields.length > 6) {
    return 'Cron expression must have 5 fields (min sec mon dom dow) or 6 (with year).'
  }
  const valid = /^[0-9*,/\-?LW#]+$/
  for (const f of fields) {
    if (!valid.test(f)) {
      return `Invalid cron field: "${f}". Use digits, *, /, -, , characters.`
    }
  }
  return null
}

// ── Payload types ─────────────────────────────────────────────────────────────

type PayloadKind = 'systemEvent' | 'agentTurn'

const PAYLOAD_LABELS: Record<PayloadKind, string> = {
  systemEvent: 'System Event',
  agentTurn: 'Agent Turn',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stringifyJson(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function parseOptionalJson(rawValue: string): {
  value?: unknown
  error?: string
} {
  const trimmed = rawValue.trim()
  if (!trimmed) return {}
  try {
    return { value: JSON.parse(trimmed) as unknown }
  } catch {
    return { error: 'Payload and delivery config must be valid JSON.' }
  }
}

/** Detect the schedule kind from an existing schedule string. */
function detectScheduleKind(schedule: string): ScheduleKind {
  if (!schedule) return 'cron'
  if (schedule.startsWith('every ') || /^\d+[smhd]$/.test(schedule.trim())) {
    return 'every'
  }
  if (schedule.startsWith('at ') || /^\d{4}-\d{2}-\d{2}/.test(schedule.trim())) {
    return 'at'
  }
  return 'cron'
}

/** Detect payload kind from existing payload. */
function detectPayloadKind(payload: unknown): PayloadKind {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>
    if (p.kind === 'agentTurn') return 'agentTurn'
  }
  return 'systemEvent'
}

// ── Segmented control ─────────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  options,
  labels,
  value,
  onChange,
}: {
  options: T[]
  labels: Record<T, string>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-primary-200 bg-primary-100/60 p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => { onChange(opt) }}
          className={[
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            value === opt
              ? 'bg-primary-900 text-white shadow-sm'
              : 'text-primary-600 hover:text-primary-900',
          ].join(' ')}
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function CronJobForm({
  mode,
  initialJob,
  pending,
  error,
  onSubmit,
  onClose,
}: CronJobFormProps) {
  const [name, setName] = useState(initialJob?.name ?? '')
  const [description, setDescription] = useState(initialJob?.description ?? '')
  const [enabled, setEnabled] = useState(initialJob?.enabled ?? true)
  const [deliveryConfigInput, setDeliveryConfigInput] = useState(
    stringifyJson(initialJob?.deliveryConfig),
  )
  const [localError, setLocalError] = useState<string | null>(null)

  // ── Schedule state ──────────────────────────────────────────────────────────
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>(
    detectScheduleKind(initialJob?.schedule ?? ''),
  )
  // cron kind
  const [cronExpr, setCronExpr] = useState(
    scheduleKind === 'cron' ? (initialJob?.schedule ?? '') : '',
  )
  const [cronError, setCronError] = useState<string | null>(null)
  // every kind
  const [everyInterval, setEveryInterval] = useState(
    scheduleKind === 'every' ? (initialJob?.schedule ?? '') : '',
  )
  // at kind
  const [atDatetime, setAtDatetime] = useState(
    scheduleKind === 'at' ? (initialJob?.schedule ?? '') : '',
  )

  // ── Payload state ───────────────────────────────────────────────────────────
  const [payloadKind, setPayloadKind] = useState<PayloadKind>(
    detectPayloadKind(initialJob?.payload),
  )
  // systemEvent
  const [systemEventText, setSystemEventText] = useState<string>(() => {
    if (initialJob?.payload && typeof initialJob.payload === 'object') {
      const p = initialJob.payload as Record<string, unknown>
      if (p.kind === 'systemEvent' && typeof p.text === 'string') return p.text
    }
    return initialJob?.name ?? ''
  })
  // agentTurn
  const [agentSessionKey, setAgentSessionKey] = useState<string>(() => {
    if (initialJob?.payload && typeof initialJob.payload === 'object') {
      const p = initialJob.payload as Record<string, unknown>
      if (p.kind === 'agentTurn' && typeof p.sessionKey === 'string') {
        return p.sessionKey
      }
    }
    return 'main'
  })
  const [agentMessage, setAgentMessage] = useState<string>(() => {
    if (initialJob?.payload && typeof initialJob.payload === 'object') {
      const p = initialJob.payload as Record<string, unknown>
      if (p.kind === 'agentTurn' && typeof p.message === 'string') {
        return p.message
      }
    }
    return ''
  })

  // ── Build schedule string from current kind + fields ────────────────────────
  function buildSchedule(): string {
    if (scheduleKind === 'cron') return cronExpr.trim()
    if (scheduleKind === 'every') return everyInterval.trim()
    return atDatetime.trim()
  }

  // ── Build payload object from current kind + fields ──────────────────────────
  function buildPayload(): unknown {
    if (payloadKind === 'systemEvent') {
      return { kind: 'systemEvent', text: systemEventText.trim() || name.trim() }
    }
    return {
      kind: 'agentTurn',
      sessionKey: agentSessionKey.trim() || 'main',
      message: agentMessage.trim(),
    }
  }

  function handleScheduleKindChange(kind: ScheduleKind) {
    setScheduleKind(kind)
    setCronError(null)
    setLocalError(null)
  }

  function handleCronExprChange(val: string) {
    setCronExpr(val)
    if (cronError) {
      const err = validateCronExpr(val)
      setCronError(err)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)
    setCronError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setLocalError('Name is required.')
      return
    }

    const trimmedSchedule = buildSchedule()
    if (!trimmedSchedule) {
      setLocalError('Schedule is required.')
      return
    }

    if (scheduleKind === 'cron') {
      const cronErr = validateCronExpr(trimmedSchedule)
      if (cronErr) {
        setCronError(cronErr)
        return
      }
    }

    if (payloadKind === 'agentTurn' && !agentMessage.trim()) {
      setLocalError('Agent message is required for Agent Turn payload.')
      return
    }

    const deliveryConfigResult = parseOptionalJson(deliveryConfigInput)
    if (deliveryConfigResult.error) {
      setLocalError(deliveryConfigResult.error)
      return
    }

    onSubmit({
      jobId: initialJob?.id,
      name: trimmedName,
      schedule: trimmedSchedule,
      description: description.trim() || undefined,
      enabled,
      payload: buildPayload(),
      deliveryConfig: deliveryConfigResult.value,
    })
  }

  return (
    <section className="rounded-2xl border border-primary-200 bg-primary-50/85 p-4 backdrop-blur-xl">
      <div className="mb-3">
        <h3 className="text-base font-medium text-ink text-balance">
          {mode === 'edit' ? 'Edit Cron Job' : 'Create Cron Job'}
        </h3>
        <p className="mt-1 text-sm text-primary-600 text-pretty">
          Save directly to gateway scheduler methods, then refresh the list.
        </p>
      </div>

      {error || localError ? (
        <p className="mb-3 rounded-lg border border-accent-500/40 bg-accent-500/10 px-3 py-2 text-sm text-accent-500 text-pretty">
          {localError ?? error}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Name + Description */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-primary-600 tabular-nums">Name</span>
            <input
              value={name}
              onChange={function onChangeName(event) {
                setName(event.target.value)
              }}
              placeholder="Daily Digest"
              className="h-9 w-full rounded-lg border border-primary-200 bg-primary-100/60 px-3 text-sm text-primary-900 outline-none transition-colors focus:border-primary-400"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-primary-600 tabular-nums">Description</span>
            <input
              value={description}
              onChange={function onChangeDescription(event) {
                setDescription(event.target.value)
              }}
              placeholder="Optional description"
              className="h-9 w-full rounded-lg border border-primary-200 bg-primary-100/60 px-3 text-sm text-primary-900 outline-none transition-colors focus:border-primary-400"
            />
          </label>
        </div>

        {/* ── Schedule ─────────────────────────────────────────────────────── */}
        <div className="space-y-2 rounded-lg border border-primary-200 bg-primary-100/40 p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-medium text-primary-600 tabular-nums">Schedule</span>
            <SegmentedControl<ScheduleKind>
              options={['cron', 'every', 'at']}
              labels={SCHEDULE_LABELS}
              value={scheduleKind}
              onChange={handleScheduleKindChange}
            />
          </div>

          {scheduleKind === 'cron' && (
            <div className="space-y-1">
              <input
                value={cronExpr}
                onChange={function onChangeCron(e) { handleCronExprChange(e.target.value) }}
                onBlur={function onBlurCron() { setCronError(validateCronExpr(cronExpr)) }}
                placeholder="0 9 * * 1-5"
                className={[
                  'h-9 w-full rounded-lg border px-3 text-sm text-primary-900 outline-none transition-colors focus:border-primary-400 tabular-nums bg-primary-100/60',
                  cronError ? 'border-accent-500' : 'border-primary-200',
                ].join(' ')}
              />
              {cronError ? (
                <p className="text-xs text-accent-500">{cronError}</p>
              ) : (
                <p className="text-xs text-primary-500">Standard 5-field cron — e.g. <code>0 9 * * 1-5</code> (weekdays at 9am)</p>
              )}
            </div>
          )}

          {scheduleKind === 'every' && (
            <div className="space-y-1">
              <input
                value={everyInterval}
                onChange={function onChangeEvery(e) { setEveryInterval(e.target.value) }}
                placeholder="30m  or  2h  or  every 5 minutes"
                className="h-9 w-full rounded-lg border border-primary-200 bg-primary-100/60 px-3 text-sm text-primary-900 outline-none transition-colors focus:border-primary-400 tabular-nums"
              />
              <p className="text-xs text-primary-500">Interval — e.g. <code>30m</code>, <code>1h</code>, <code>every 15 minutes</code></p>
            </div>
          )}

          {scheduleKind === 'at' && (
            <div className="space-y-1">
              <input
                type="datetime-local"
                value={atDatetime}
                onChange={function onChangeAt(e) { setAtDatetime(e.target.value) }}
                className="h-9 w-full rounded-lg border border-primary-200 bg-primary-100/60 px-3 text-sm text-primary-900 outline-none transition-colors focus:border-primary-400 tabular-nums"
              />
              <p className="text-xs text-primary-500">One-time run at the selected date/time</p>
            </div>
          )}
        </div>

        {/* ── Payload type ─────────────────────────────────────────────────── */}
        <div className="space-y-2 rounded-lg border border-primary-200 bg-primary-100/40 p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-medium text-primary-600 tabular-nums">Payload Type</span>
            <SegmentedControl<PayloadKind>
              options={['systemEvent', 'agentTurn']}
              labels={PAYLOAD_LABELS}
              value={payloadKind}
              onChange={function onChangePayloadKind(kind) {
                setPayloadKind(kind)
                setLocalError(null)
              }}
            />
          </div>

          {payloadKind === 'systemEvent' && (
            <div className="space-y-1">
              <label className="space-y-1 block">
                <span className="text-xs text-primary-600">Event Text</span>
                <input
                  value={systemEventText}
                  onChange={function onChangeSystemText(e) { setSystemEventText(e.target.value) }}
                  placeholder="Event text / message"
                  className="h-9 w-full rounded-lg border border-primary-200 bg-primary-100/60 px-3 text-sm text-primary-900 outline-none transition-colors focus:border-primary-400"
                />
              </label>
            </div>
          )}

          {payloadKind === 'agentTurn' && (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-primary-600">Session Key</span>
                <input
                  value={agentSessionKey}
                  onChange={function onChangeSessionKey(e) { setAgentSessionKey(e.target.value) }}
                  placeholder="main"
                  className="h-9 w-full rounded-lg border border-primary-200 bg-primary-100/60 px-3 text-sm text-primary-900 outline-none transition-colors focus:border-primary-400 tabular-nums"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-primary-600">Message</span>
                <input
                  value={agentMessage}
                  onChange={function onChangeAgentMessage(e) { setAgentMessage(e.target.value) }}
                  placeholder="Run daily digest"
                  className="h-9 w-full rounded-lg border border-primary-200 bg-primary-100/60 px-3 text-sm text-primary-900 outline-none transition-colors focus:border-primary-400"
                />
              </label>
            </div>
          )}
        </div>

        {/* ── Delivery Config ───────────────────────────────────────────────── */}
        <label className="space-y-1 block">
          <span className="text-xs text-primary-600 tabular-nums">
            Delivery Config JSON <span className="text-primary-400">(optional)</span>
          </span>
          <textarea
            value={deliveryConfigInput}
            onChange={function onChangeDeliveryConfig(event) {
              setDeliveryConfigInput(event.target.value)
            }}
            rows={3}
            placeholder='{"provider":"slack"}'
            className="w-full rounded-lg border border-primary-200 bg-primary-100/60 px-3 py-2 text-xs text-primary-900 outline-none transition-colors focus:border-primary-400 tabular-nums"
          />
        </label>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary-200 bg-primary-100/50 px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-primary-700">
            <Switch
              checked={enabled}
              onCheckedChange={function onCheckedChange(nextValue) {
                setEnabled(Boolean(nextValue))
              }}
            />
            <span className="tabular-nums">
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={pending}
              onClick={function onClickClose() {
                onClose?.()
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              type="submit"
              disabled={pending}
              className="tabular-nums"
            >
              {pending
                ? 'Saving...'
                : mode === 'edit'
                  ? 'Save Changes'
                  : 'Create Job'}
            </Button>
          </div>
        </div>
      </form>
    </section>
  )
}
