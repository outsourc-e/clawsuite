import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'

type SendResponse = {
  runId?: string
}

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

function looksLikeMethodMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes('method') && (message.includes('not found') || message.includes('unknown'))
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

          // Send to agent:main:main — always exists, trusted internal RPC
          const sessionKey = 'agent:main:main'
          const idempotencyKey = randomUUID()

          let result: SendResponse
          try {
            result = await gatewayRpc<SendResponse>('sessions.send', {
              key: sessionKey,
              message: prompt,
              timeoutMs: 120_000,
              idempotencyKey,
            })
          } catch (error) {
            if (!looksLikeMethodMissingError(error)) throw error
            result = await gatewayRpc<SendResponse>('chat.send', {
              key: sessionKey,
              message: prompt,
              timeoutMs: 120_000,
              idempotencyKey,
            })
          }

          return json({
            ok: true,
            sessionKey,
            runId: result.runId ?? null,
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
