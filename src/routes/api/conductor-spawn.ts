import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
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
    '- Verify exit criteria after each worker completes',
    '- Report a summary when all tasks are done',
  ].join('\n')
}

function readGatewayConfig(): { url: string; token: string } {
  // Read gateway URL and hooks token from openclaw.json
  const configPaths = [
    resolve(process.env.HOME ?? '~', '.openclaw/openclaw.json'),
  ]
  for (const p of configPaths) {
    try {
      const raw = readFileSync(p, 'utf-8')
      // openclaw.json uses relaxed JSON (JS object syntax) — extract what we need with regex
      const portMatch = raw.match(/port:\s*(\d+)/)
      const port = portMatch ? portMatch[1] : '18789'
      const tokenMatch = raw.match(/hooks:\s*\{[^}]*token:\s*['"]([^'"]+)['"]/)
      const token = tokenMatch ? tokenMatch[1] : ''
      return { url: `http://127.0.0.1:${port}`, token }
    } catch {
      continue
    }
  }
  return { url: 'http://127.0.0.1:18789', token: '' }
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
          const { url: gatewayUrl, token: hooksToken } = readGatewayConfig()

          // Use the gateway hooks endpoint to spawn an isolated agent session
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (hooksToken) {
            headers['Authorization'] = `Bearer ${hooksToken}`
          }

          const hookResponse = await fetch(`${gatewayUrl}/hooks`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ text: prompt }),
          })

          if (!hookResponse.ok) {
            const errText = await hookResponse.text().catch(() => '')
            return json(
              { ok: false, error: `Gateway hooks returned ${hookResponse.status}: ${errText}` },
              { status: 502 },
            )
          }

          const hookResult = (await hookResponse.json().catch(() => ({}))) as Record<string, unknown>

          return json({
            ok: true,
            sessionKey: hookResult.sessionKey ?? hookResult.key ?? null,
            runId: hookResult.runId ?? null,
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
