import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'

let cachedSkill: string | null = null

function loadDispatchSkill(): string {
  if (cachedSkill) return cachedSkill
  try {
    const candidates = [
      resolve(process.cwd(), 'skills/workspace-dispatch/SKILL.md'),
      resolve(process.env.HOME ?? '~', '.openclaw/workspace/skills/workspace-dispatch/SKILL.md'),
    ]
    for (const p of candidates) {
      try {
        cachedSkill = readFileSync(p, 'utf-8')
        return cachedSkill
      } catch {
        continue
      }
    }
  } catch {
    // ignore
  }
  return ''
}

function buildOrchestratorPrompt(goal: string, skill: string): string {
  return [
    'You are a mission orchestrator. Execute this mission autonomously.',
    '',
    '## Dispatch Skill Instructions',
    '',
    skill,
    '',
    '## Mission',
    '',
    `Goal: ${goal}`,
    '',
    '## Critical Rules',
    '- Use sessions_spawn to create worker agents for each task',
    '- Do NOT do the work yourself — spawn workers',
    '- Do NOT ask for confirmation — start immediately',
    '- Label workers as "worker-<task-slug>" so the UI can track them',
    '- Each worker gets a self-contained prompt with the task + exit criteria',
    '- Workers should write output to /tmp/dispatch-<slug>/ directories',
    '- Verify exit criteria after each worker completes',
    '- Report a summary when all tasks are done',
  ].join('\n')
}

async function cronRpcWithFallback<T>(params: unknown): Promise<T> {
  const methods = ['cron.add', 'cron.jobs.add', 'scheduler.jobs.add']
  let lastError: unknown = null
  for (const method of methods) {
    try {
      return await gatewayRpc<T>(method, params)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('cron add failed')
}

async function cronRunWithFallback(jobId: string): Promise<void> {
  const methods = ['cron.run', 'cron.jobs.run', 'scheduler.jobs.run']
  for (const method of methods) {
    try {
      await gatewayRpc(method, { jobId, runMode: 'force' })
      return
    } catch {
      continue
    }
  }
}

export const Route = createFileRoute('/api/conductor-spawn')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
          const goal = typeof body.goal === 'string' ? body.goal.trim() : ''

          if (!goal) {
            return json({ ok: false, error: 'goal required' }, { status: 400 })
          }

          const skill = loadDispatchSkill()
          const prompt = buildOrchestratorPrompt(goal, skill)

          // Use cron to spawn a trusted isolated agentTurn session
          const jobName = `conductor-${Date.now()}`

          const addResult = await cronRpcWithFallback<{ ok?: boolean; jobId?: string; id?: string; error?: string }>({
            job: {
              name: jobName,
              schedule: { kind: 'at', at: new Date().toISOString() },
              payload: {
                kind: 'agentTurn',
                message: prompt,
                timeoutSeconds: 600,
              },
              sessionTarget: 'isolated',
              enabled: true,
              deleteAfterRun: true,
            },
          })

          const jobId = addResult.jobId ?? addResult.id ?? jobName

          // Don't force-run — the "at: now" schedule fires immediately on its own.
          // Calling cron.run too would double-trigger the orchestrator.

          return json({
            ok: true,
            sessionKey: `cron:${jobName}`,
            jobId,
            runId: null,
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
