import os from 'node:os'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

function resolveSessionsDir() {
  // Keep in sync with Clawdbot default layout:
  // ~/.clawdbot/agents/<agentId>/sessions
  const agentId = (process.env.CLAWDBOT_AGENT_ID || 'main').trim() || 'main'
  const stateDir = (
    process.env.CLAWDBOT_STATE_DIR || path.join(os.homedir(), '.clawdbot')
  ).trim()
  return {
    agentId,
    stateDir,
    sessionsDir: path.join(stateDir, 'agents', agentId, 'sessions'),
    storePath: path.join(
      stateDir,
      'agents',
      agentId,
      'sessions',
      'sessions.json',
    ),
  }
}

export const Route = createFileRoute('/api/paths')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json(resolveSessionsDir())
      },
    },
  },
})
