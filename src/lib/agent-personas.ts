/**
 * Agent Personas — Named agents with specific roles for visual identity.
 * When agents are spawned, they get assigned a persona based on their task type.
 */

export type AgentPersona = {
  name: string
  role: string
  emoji: string
  color: string // Tailwind color class
  specialties: string[]
}

/** Default persona pool — assigned round-robin or by task matching */
export const AGENT_PERSONAS: AgentPersona[] = [
  {
    name: 'Roger',
    role: 'Frontend Developer',
    emoji: '🎨',
    color: 'text-blue-400',
    specialties: ['react', 'css', 'tailwind', 'ui', 'ux', 'component', 'layout', 'style', 'design', 'frontend', 'page', 'landing'],
  },
  {
    name: 'Sally',
    role: 'Backend Architect',
    emoji: '🏗️',
    color: 'text-purple-400',
    specialties: ['api', 'server', 'database', 'backend', 'node', 'express', 'route', 'endpoint', 'schema', 'migration', 'sql', 'rpc'],
  },
  {
    name: 'Bill',
    role: 'Marketing Expert',
    emoji: '📣',
    color: 'text-orange-400',
    specialties: ['marketing', 'seo', 'content', 'copy', 'brand', 'social', 'campaign', 'analytics', 'growth'],
  },
  {
    name: 'Ada',
    role: 'QA Engineer',
    emoji: '🔍',
    color: 'text-emerald-400',
    specialties: ['test', 'qa', 'bug', 'fix', 'error', 'debug', 'lint', 'type', 'typescript', 'validate', 'audit'],
  },
  {
    name: 'Max',
    role: 'DevOps Specialist',
    emoji: '⚙️',
    color: 'text-amber-400',
    specialties: ['deploy', 'docker', 'ci', 'cd', 'build', 'config', 'infra', 'server', 'monitor', 'log', 'performance'],
  },
  {
    name: 'Luna',
    role: 'Research Analyst',
    emoji: '🔬',
    color: 'text-cyan-400',
    specialties: ['research', 'analyze', 'compare', 'report', 'data', 'insight', 'strategy', 'plan', 'review', 'audit'],
  },
  {
    name: 'Kai',
    role: 'Full-Stack Engineer',
    emoji: '⚡',
    color: 'text-yellow-400',
    specialties: ['fullstack', 'feature', 'implement', 'build', 'create', 'scaffold', 'refactor', 'update', 'upgrade'],
  },
  {
    name: 'Nova',
    role: 'Security Specialist',
    emoji: '🛡️',
    color: 'text-red-400',
    specialties: ['security', 'auth', 'permission', 'encrypt', 'vulnerability', 'scan', 'protect', 'firewall', 'token'],
  },
]

/** Track which personas have been assigned to avoid duplicates in the same session */
const assignedPersonas = new Map<string, AgentPersona>()
let nextRoundRobin = 0

/**
 * Match a persona to a task based on keyword matching.
 * Falls back to round-robin if no match found.
 */
export function assignPersona(sessionKey: string, taskText?: string): AgentPersona {
  // Return existing assignment
  const existing = assignedPersonas.get(sessionKey)
  if (existing) return existing

  let bestMatch: AgentPersona | null = null
  let bestScore = 0

  if (taskText) {
    const lower = taskText.toLowerCase()
    for (const persona of AGENT_PERSONAS) {
      const score = persona.specialties.reduce((sum, keyword) => {
        return sum + (lower.includes(keyword) ? 1 : 0)
      }, 0)
      if (score > bestScore) {
        bestScore = score
        bestMatch = persona
      }
    }
  }

  // Use matched persona or round-robin
  const persona = bestMatch && bestScore > 0
    ? bestMatch
    : AGENT_PERSONAS[nextRoundRobin % AGENT_PERSONAS.length]

  if (!bestMatch || bestScore === 0) {
    nextRoundRobin++
  }

  assignedPersonas.set(sessionKey, persona)
  return persona
}

/** Get persona for a session (without assigning) */
export function getPersona(sessionKey: string): AgentPersona | undefined {
  return assignedPersonas.get(sessionKey)
}

/** Clear all assignments (e.g., on session reset) */
export function clearPersonas(): void {
  assignedPersonas.clear()
  nextRoundRobin = 0
}

/** Get display name for an agent session */
export function getAgentDisplayName(sessionKey: string, taskText?: string): string {
  const persona = assignPersona(sessionKey, taskText)
  return `${persona.emoji} ${persona.name}`
}

/** Get role label for an agent session */
export function getAgentRoleLabel(sessionKey: string, taskText?: string): string {
  const persona = assignPersona(sessionKey, taskText)
  return persona.role
}
