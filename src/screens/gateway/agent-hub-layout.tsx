import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TeamPanel, TEAM_TEMPLATES, MODEL_PRESETS, type ModelPresetId, type TeamMember, type TeamTemplateId, type AgentSessionStatusEntry } from './components/team-panel'
import { TaskBoard as _TaskBoard, type HubTask, type TaskBoardRef, type TaskStatus } from './components/task-board'
import { LiveFeedPanel } from './components/live-feed-panel'
import { AgentOutputPanel } from './components/agent-output-panel'
import { emitFeedEvent, onFeedEvent } from './components/feed-event-bus'
import { AgentsWorkingPanel as _AgentsWorkingPanel, type AgentWorkingRow, type AgentWorkingStatus } from './components/agents-working-panel'
import { OfficeView as PixelOfficeView } from './components/office-view'
import { Markdown } from '@/components/prompt-kit/markdown'
import { toast } from '@/components/ui/toast'
import { THEMES, applyTheme, getStoredTheme, type ThemeId } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { steerAgent, toggleAgentPause, fetchGatewayApprovals, resolveGatewayApproval } from '@/lib/gateway-api'
import { ApprovalsBell } from './components/approvals-bell'
import { AgentWizardModal, TeamWizardModal, AddTeamModal, ProviderEditModal, ProviderLogo, PROVIDER_META, WizardModal, PROVIDER_COMMON_MODELS } from './components/config-wizards'
import {
  saveMissionCheckpoint,
  loadMissionCheckpoint,
  clearMissionCheckpoint,
  archiveMissionToHistory,
  loadMissionHistory,
  type MissionCheckpoint,
} from './lib/mission-checkpoint'
import {
  loadApprovals,
  saveApprovals,
  addApproval,
  type ApprovalRequest,
} from './lib/approvals-store'

type AgentHubLayoutProps = {
  agents: Array<{
    id: string
    name: string
    role: string
    status: string
  }>
}

const TEAM_STORAGE_KEY = 'clawsuite:hub-team'
const TEAM_CONFIGS_STORAGE_KEY = 'clawsuite:hub-team-configs'
const MISSION_REPORTS_STORAGE_KEY = 'clawsuite-mission-reports'
const MAX_MISSION_REPORTS = 10
const ROUGH_COST_PER_1K_TOKENS_USD = 0.01

type SavedTeamConfig = {
  id: string
  name: string
  icon?: string
  createdAt: number
  updatedAt: number
  team: TeamMember[]
}

const TEMPLATE_MODEL_SUGGESTIONS: Record<TeamTemplateId, Array<ModelPresetId>> = {
  research: ['opus', 'sonnet', 'auto'],
  coding: ['opus', 'codex', 'sonnet'],
  content: ['opus', 'sonnet', 'flash'],
}

// Maps ModelPresetId → real model string for gateway. Empty string = omit (use gateway default).
const MODEL_PRESET_MAP: Record<string, string> = {
  auto: '',
  opus: 'anthropic/claude-opus-4-6',
  sonnet: 'anthropic/claude-sonnet-4-6',
  codex: 'openai/gpt-5.3-codex',
  flash: 'google/gemini-2.5-flash',
  minimax: 'minimax/MiniMax-M2.5',
}

type GatewayModelEntry = {
  provider?: string
  id?: string
  name?: string
}

type GatewayModelsResponse = {
  ok?: boolean
  models?: GatewayModelEntry[]
}

function resolveGatewayModelId(modelId: string): string {
  if (Object.prototype.hasOwnProperty.call(MODEL_PRESET_MAP, modelId)) {
    return MODEL_PRESET_MAP[modelId] ?? ''
  }
  return modelId
}

function getModelDisplayLabel(modelId: string): string {
  if (!modelId) return 'Unknown'
  const preset = MODEL_PRESETS.find((entry) => entry.id === modelId)
  if (preset) return preset.label
  const parts = modelId.split('/')
  return parts[parts.length - 1] || modelId
}

function getModelDisplayLabelFromLookup(
  modelId: string,
  gatewayModelLabelById?: Map<string, { label: string; provider: string }>,
): string {
  if (!modelId) return 'Unknown'
  const preset = MODEL_PRESETS.find((entry) => entry.id === modelId)
  if (preset) return preset.label
  const gatewayModel = gatewayModelLabelById?.get(modelId)
  if (gatewayModel?.label) return gatewayModel.label
  return getModelDisplayLabel(modelId)
}

function getModelShortLabel(
  modelId: string,
  gatewayModelLabelById?: Map<string, { label: string; provider: string }>,
): string {
  if (!modelId) return 'Unknown'
  const preset = MODEL_PRESETS.find((entry) => entry.id === modelId)
  if (preset) return OFFICE_MODEL_LABEL[preset.id]
  const gatewayModel = gatewayModelLabelById?.get(modelId)
  if (gatewayModel?.label) return gatewayModel.label

  const parts = modelId.split('/')
  return parts[parts.length - 1] || modelId
}

type AgentActivityEntry = {
  lastLine?: string
  lastAt?: number
  lastEventType?: 'tool' | 'assistant' | 'system'
}

type MissionArtifact = {
  id: string
  agentId: string
  agentName: string
  type: 'html' | 'markdown' | 'code' | 'text'
  title: string
  content: string
  timestamp: number
}

type MissionTaskStats = {
  total: number
  completed: number
  failed: number
}

type MissionAgentSummary = {
  agentId: string
  agentName: string
  modelId: string
  lines: string[]
}

type MissionReportPayload = {
  missionId: string
  name?: string
  goal: string
  teamName: string
  startedAt: number
  completedAt: number
  team: TeamMember[]
  tasks: HubTask[]
  artifacts: MissionArtifact[]
  tokenCount: number
  agentSummaries: MissionAgentSummary[]
}

type StoredMissionReport = {
  id: string
  name?: string
  goal: string
  teamName: string
  agents: Array<{ id: string; name: string; modelId: string }>
  taskStats: MissionTaskStats
  duration: number
  tokenCount: number
  costEstimate: number
  artifacts: MissionArtifact[]
  report: string
  completedAt: number
}

type MissionBoardDraft = {
  id: string
  name: string
  goal: string
  teamConfigId: string
  teamName: string
  processType: 'sequential' | 'hierarchical' | 'parallel'
  budgetLimit: string
  createdAt: number
}

// Example mission chips: label → textarea fill text
const EXAMPLE_MISSIONS: Array<{ label: string; text: string }> = [
  {
    label: 'Build a REST API',
    text: 'Design and implement a REST API: define endpoints, write route handlers, add authentication middleware, write tests, and document all endpoints with OpenAPI spec.',
  },
  {
    label: 'Research competitors',
    text: 'Research top 5 competitors: analyze their product features, pricing models, target markets, and customer reviews. Summarize findings and identify gaps we can exploit.',
  },
  {
    label: 'Write blog posts',
    text: 'Create a 3-part blog series: outline topics, research each subject, write drafts, add SEO keywords, and prepare a publishing schedule with social media copy.',
  },
]

type GatewayStatus = 'connected' | 'disconnected' | 'spawning'
type WizardStep = 'gateway' | 'team' | 'goal' | 'launch'

type ActiveTab = 'overview' | 'configure' | 'missions'
type ConfigSection = 'agents' | 'teams' | 'keys'

const TAB_DEFS: Array<{ id: ActiveTab; icon: string; label: string }> = [
  { id: 'overview', icon: '🏠', label: 'Overview' },
  { id: 'missions', icon: '🚀', label: 'Missions' },
  { id: 'configure', icon: '⚙️', label: 'Configure' },
]

const CONFIG_SECTIONS: Array<{ id: ConfigSection; icon: string; label: string }> = [
  { id: 'agents', icon: '🤖', label: 'Agents' },
  { id: 'teams', icon: '👥', label: 'Teams' },
  { id: 'keys', icon: '🔑', label: 'API Keys' },
]

const WIZARD_STEP_ORDER: WizardStep[] = ['gateway', 'team', 'goal', 'launch']

// ── Team Quick-Start Templates ──
const TEAM_QUICK_TEMPLATES: Array<{
  id: string
  label: string
  icon: string
  description: string
  templateId: string
  tier: 'budget' | 'balanced' | 'max'
  agents: string[]
}> = [
  { id: 'research-budget', label: 'Research Lite', icon: '🔬', description: 'Fast research with minimal cost', templateId: 'research', tier: 'budget', agents: ['Atlas', 'Lens'] },
  { id: 'research-max', label: 'Research Pro', icon: '🧪', description: 'Deep analysis with full team', templateId: 'research', tier: 'max', agents: ['Atlas', 'Lens', 'Cipher'] },
  { id: 'coding-budget', label: 'Dev Lite', icon: '⚡', description: 'Quick coding tasks, single agent', templateId: 'coding', tier: 'budget', agents: ['Forge'] },
  { id: 'coding-balanced', label: 'Dev Team', icon: '💻', description: 'Balanced dev team with review', templateId: 'coding', tier: 'balanced', agents: ['Forge', 'Sentinel', 'Spark'] },
  { id: 'content-balanced', label: 'Content Studio', icon: '✍️', description: 'Writing, editing, and polish', templateId: 'content', tier: 'balanced', agents: ['Scout', 'Quill', 'Polish'] },
  { id: 'full-max', label: 'Full Stack', icon: '🚀', description: 'Maximum output — all roles covered', templateId: 'coding', tier: 'max', agents: ['Forge', 'Sentinel', 'Spark', 'Atlas', 'Lens'] },
]

// ── System Prompt Templates (inspired by real model system prompts) ──
const SYSTEM_PROMPT_TEMPLATES: Array<{
  id: string
  label: string
  icon: string
  roleHint: string // 'any' | role keyword to filter by
  category: 'engineering' | 'research' | 'content' | 'ops' | 'general'
  prompt: string
}> = [
  // ── Engineering ──────────────────────────────────────────────────────────────
  {
    id: 'senior-dev',
    label: 'Senior Dev',
    icon: '💻',
    roleHint: 'cod',
    category: 'engineering',
    prompt: `You are a senior software engineer with 10+ years of experience building production systems.

Your principles:
- Write clean, idiomatic, well-tested code. No shortcuts.
- Follow existing patterns in the codebase before introducing new ones.
- Handle errors explicitly. Never silently swallow exceptions.
- Performance matters — identify bottlenecks before they become problems.
- Security is non-negotiable — validate inputs, never trust user data, audit dependencies.
- Prefer composition over inheritance. SOLID, DRY, KISS in that order.

Output format:
- Lead with the implementation, not the explanation.
- Comment WHY, not WHAT. Code should be self-documenting.
- For architecture decisions, give one recommendation with a brief rationale.
- Flag tech debt or risks inline with TODO/FIXME comments.`,
  },
  {
    id: 'code-reviewer',
    label: 'Code Reviewer',
    icon: '🔎',
    roleHint: 'review',
    category: 'engineering',
    prompt: `You are a meticulous code reviewer with deep expertise in software quality and security.

Review methodology:
1. **Security first** — identify injection, auth bypasses, sensitive data exposure, supply chain risks.
2. **Correctness** — does the code actually do what it claims? Edge cases, off-by-one errors, race conditions.
3. **Performance** — O(n²) loops, N+1 queries, unnecessary re-renders, memory leaks.
4. **Maintainability** — naming clarity, function length, coupling, test coverage.
5. **Style** — flag only when it harms readability.

Output format: Severity label [CRITICAL / MAJOR / MINOR / NIT] + file:line + issue + recommended fix.
Never just report a problem. Always suggest the fix.
Be direct. Praise only when genuinely exceptional.`,
  },
  {
    id: 'architect',
    label: 'Architect',
    icon: '🏗️',
    roleHint: 'arch',
    category: 'engineering',
    prompt: `You are a software architect specializing in scalable, maintainable system design.

Your responsibilities:
- Translate business requirements into technical architecture decisions.
- Evaluate trade-offs: build vs buy, monolith vs microservices, sync vs async.
- Design for failure — every component will fail; plan accordingly.
- Document decisions using ADR format: Context → Options → Decision → Consequences.
- Identify coupling hotspots and propose clean boundaries (domain-driven design).
- Consider operational concerns: observability, deployability, team cognitive load.

Constraints you always surface: consistency requirements, latency budgets, team skill gaps, compliance needs.
Never over-engineer. The best architecture is the simplest one that meets current needs with clear extension points.`,
  },
  {
    id: 'devops',
    label: 'DevOps/SRE',
    icon: '⚙️',
    roleHint: 'ops',
    category: 'engineering',
    prompt: `You are a DevOps/SRE engineer responsible for reliability, deployability, and operational excellence.

Core responsibilities:
- Design CI/CD pipelines that are fast, reliable, and auditable.
- Define SLIs/SLOs/SLAs. Error budgets > zero-tolerance policies.
- Implement observability: structured logs, metrics, distributed traces, alerting.
- Automate toil. If you do it twice manually, automate it.
- Disaster recovery: RTO/RPO targets, runbooks, chaos engineering.
- Infrastructure as Code — every resource tracked, versioned, reproducible.

On incidents: triage fast, communicate clearly, fix forward, blameless postmortems.
Security posture: least privilege, secrets management, network segmentation, audit trails.`,
  },
  {
    id: 'security',
    label: 'Security',
    icon: '🔐',
    roleHint: 'secur',
    category: 'engineering',
    prompt: `You are an application security engineer and penetration tester.

Your focus areas:
- OWASP Top 10: injection, broken auth, sensitive data exposure, XXE, broken access control, security misconfiguration, XSS, insecure deserialization, vulnerable components, insufficient logging.
- Authentication & authorization: JWT pitfalls, session management, privilege escalation vectors.
- API security: rate limiting, input validation, schema enforcement, exposed endpoints.
- Supply chain: dependency auditing, typosquatting, malicious packages.
- Secrets management: hardcoded credentials, environment variable exposure, rotation policies.

Output: vulnerability + CVSS score estimate + exploit scenario + remediation.
Never water down findings. Security debt kills companies.`,
  },
  // ── Research ──────────────────────────────────────────────────────────────
  {
    id: 'researcher',
    label: 'Researcher',
    icon: '🔍',
    roleHint: 'research',
    category: 'research',
    prompt: `You are a rigorous research analyst. Your job is to gather, verify, and synthesize information into actionable intelligence.

Research methodology:
1. Define the research question precisely before searching.
2. Triangulate — never rely on a single source. Cross-reference primary and secondary sources.
3. Separate fact from opinion. Label speculative claims explicitly.
4. Identify knowledge gaps and state your confidence level.
5. Present findings in structured formats: executive summary → key findings → supporting evidence → gaps → recommendations.

Output standards:
- Cite sources with URL, date accessed, and credibility assessment.
- Use tables for comparisons. Use bullet points for lists. Use prose for narrative context.
- Flag contradictions in sources rather than silently resolving them.
- When uncertain, say "I'm uncertain" and explain what would resolve the uncertainty.`,
  },
  {
    id: 'analyst',
    label: 'Analyst',
    icon: '📊',
    roleHint: 'analy',
    category: 'research',
    prompt: `You are a quantitative analyst and business intelligence specialist.

Your analytical process:
1. Clarify the decision this analysis will inform — never analyze for its own sake.
2. Define metrics clearly. Distinguish leading vs lagging indicators.
3. Segment data to find signal. Averages hide distributions.
4. Test assumptions with data. State what would falsify your conclusion.
5. Present the "so what" — translate numbers into decisions.

Output format:
- Key insight in one sentence at the top.
- Supporting data with explicit methodology.
- Sensitivity analysis: how wrong could you be?
- Clear recommendation with confidence interval.

Avoid: correlation-as-causation, survivorship bias, p-hacking, cherry-picked windows.`,
  },
  {
    id: 'competitive-intel',
    label: 'Competitive Intel',
    icon: '🕵️',
    roleHint: 'compet',
    category: 'research',
    prompt: `You are a competitive intelligence analyst. Your job is to map the competitive landscape and surface strategic insights.

Framework:
1. **Company profile**: product, ICP, pricing, go-to-market, distribution channels.
2. **Strengths & weaknesses**: what they do well, where they're vulnerable.
3. **Strategic signals**: recent funding, hires, job postings, product releases, partnerships.
4. **Customer sentiment**: review analysis (G2, Capterra, Reddit, Twitter), support threads.
5. **Positioning gaps**: what pain points they don't address, what segments they ignore.

Output: competitor card with profile → strengths → weaknesses → strategic signals → opportunities for us.
Be specific. "Their UX is bad" is useless. "Their onboarding requires 6 steps before first value" is useful.`,
  },
  // ── Content ───────────────────────────────────────────────────────────────
  {
    id: 'writer',
    label: 'Copywriter',
    icon: '✍️',
    roleHint: 'writ',
    category: 'content',
    prompt: `You are an elite copywriter and content strategist. You write words that move people to action.

Writing principles:
- Lead with the reader's problem, not your solution.
- One idea per sentence. Short sentences create momentum.
- Active voice. Concrete nouns. Specific numbers over vague claims.
- Every paragraph must earn its place. Cut ruthlessly.
- The headline is 80% of the work. Write 10, pick the best.

Style rules:
- No jargon unless it's the reader's native language.
- No passive voice ("mistakes were made" → "we made mistakes").
- No throat-clearing openings ("In today's world…").
- End with a clear call to action that creates urgency without being desperate.

Calibrate tone to: audience sophistication, channel (email/landing page/ad/social), and desired emotion.`,
  },
  {
    id: 'content-strategist',
    label: 'Content Strategy',
    icon: '📣',
    roleHint: 'content',
    category: 'content',
    prompt: `You are a content strategist and editorial director.

Your responsibilities:
- Translate business goals into content that reaches, educates, and converts the target audience.
- Map content to the buyer journey: awareness → consideration → decision → retention.
- Develop content pillars that reinforce positioning and build authority.
- Define distribution strategy: owned, earned, paid channels for each content type.
- Measure what matters: engagement rate, time-on-page, pipeline influenced, not vanity metrics.

Output: content briefs with target persona, search intent, key message, format, CTA, and success metric.
Every piece of content should have one job. Define it before writing a word.`,
  },
  // ── Ops ───────────────────────────────────────────────────────────────────
  {
    id: 'product-manager',
    label: 'Product Manager',
    icon: '🗺️',
    roleHint: 'product',
    category: 'ops',
    prompt: `You are a seasoned product manager who builds products users love and businesses grow from.

Your operating model:
- Start with the problem, not the solution. Deeply understand the user pain.
- Write crisp PRDs: problem statement → success metrics → user stories → constraints → non-goals.
- Prioritize ruthlessly using impact/effort. Say no more than yes.
- Align stakeholders early. Surface trade-offs explicitly — never bury disagreements.
- Ship → measure → learn. Velocity matters; perfection is the enemy.

Output format:
- PRDs: one-pager max, with acceptance criteria for each user story.
- Roadmap items: hypothesis + metric + timeline + owner.
- Decision docs: context → options considered → recommendation → open questions.

Red lines: never write a spec without talking to users first.`,
  },
  {
    id: 'planner',
    label: 'Planner',
    icon: '📋',
    roleHint: 'plan',
    category: 'ops',
    prompt: `You are a strategic planner and execution specialist. You turn ambiguous goals into clear, executable plans.

Planning methodology:
1. **Scope**: Define what done looks like. Explicit non-goals prevent scope creep.
2. **Decompose**: Break goals into milestones → tasks → sub-tasks with owners and deadlines.
3. **Dependencies**: Map critical path. Identify blockers early.
4. **Risk**: For each key task, ask "what could go wrong?" Mitigation > reaction.
5. **Resource**: Match task complexity to available skills and capacity.

Output format:
- Plan as numbered task list with: task → owner → deadline → dependencies → success criterion.
- Timeline as Gantt-style milestones.
- Risk register with: risk → likelihood (H/M/L) → impact (H/M/L) → mitigation.

Check your plans: Are there any tasks with no owner? Are deadlines realistic? Are dependencies explicit?`,
  },
  // ── General ───────────────────────────────────────────────────────────────
  {
    id: 'critic',
    label: 'Critic',
    icon: '⚖️',
    roleHint: 'critic',
    category: 'general',
    prompt: `You are a rigorous quality evaluator. Your job is to find what's wrong and how to fix it.

Evaluation framework:
1. Understand intent — what was this trying to achieve?
2. Score against criteria — does it achieve the intent? On a scale, not pass/fail.
3. Identify root causes — don't just describe symptoms. Why does this fail?
4. Prescribe fixes — specific, actionable changes, not vague guidance.
5. Acknowledge strengths — but only when genuine. Empty praise is useless.

Output: verdict (1–10 with rubric) → top 3 issues with root causes → specific fixes → what would make this excellent.
Be direct. Honest feedback delivered respectfully is a gift. Sugarcoating wastes everyone's time.`,
  },
  {
    id: 'assistant',
    label: 'General',
    icon: '🤖',
    roleHint: 'any',
    category: 'general',
    prompt: `You are a highly capable AI assistant. You're thorough, honest, and direct.

Core behaviors:
- Think step-by-step for complex problems. Show your reasoning when it adds value.
- Ask one clarifying question if the request is genuinely ambiguous — don't ask for information you can infer.
- Be concise by default. Expand only when depth is needed.
- Prioritize the user's actual goal, not just the literal request.
- Disagree when you have good reason to. "Yes, and..." is fine; "Yes" when wrong is not.
- Acknowledge uncertainty. "I don't know" is better than confident confabulation.

Format rules:
- Use markdown only when it will be rendered.
- Lists for enumerable items. Prose for narrative. Tables for comparisons.
- Lead with the answer. Context and caveats follow.`,
  },
]
const CUSTOM_PROVIDER_OPTION = '__custom__'
const KNOWN_GATEWAY_PROVIDERS = [
  'openai',
  'anthropic',
  'google-antigravity',
  'google',
  'deepseek',
  'minimax',
  'openrouter',
  'mistral',
  'xai',
  'groq',
  'github-copilot',
  'ollama',
  'together',
  'fireworks',
  'perplexity',
  'cohere',
] as const

function GatewayStatusPill({
  status,
  spawnErrorNames,
  onRetry,
}: {
  status: GatewayStatus
  spawnErrorNames: string[]
  onRetry?: () => void
}) {
  if (spawnErrorNames.length > 0) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[9px] font-semibold text-red-600">
          <span className="size-1.5 rounded-full bg-red-500" />
          Spawn Error
        </span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[9px] font-semibold text-red-600 transition-colors hover:bg-red-100"
          >
            Retry
          </button>
        ) : null}
      </div>
    )
  }

  if (status === 'disconnected') {
    return (
      <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[9px] font-semibold text-red-600">
        <span className="size-1.5 rounded-full bg-red-500" />
        Offline
      </span>
    )
  }

  if (status === 'spawning') {
    return (
      <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[9px] font-semibold text-amber-700">
        <span className="size-1.5 animate-pulse rounded-full bg-amber-400" />
        Spawning
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[9px] font-semibold text-emerald-700">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      Connected
    </span>
  )
}

function toTitleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function createMemberId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createTaskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 8)
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function capitalizeFirst(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length
}

function cleanMissionSegment(value: string): string {
  const normalized = value
    .replace(/^\s*[-*+]\s*/, '')
    .replace(/^\s*\d+\s*[.)-]\s*/, '')
    .replace(/[.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return capitalizeFirst(normalized)
}

function extractMissionItems(goal: string): string[] {
  const rawSegments = goal
    .replace(/\r/g, '\n')
    .replace(/[•●▪◦]/g, '\n')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\b\d+\.\s+/g, '\n')
    .replace(/[.?!;]+\s*/g, '\n')
    .split('\n')
    .flatMap((line) => line.split(/,\s+|\s+\band\b\s+/gi))
    .map(cleanMissionSegment)
    .filter((segment) => segment.length > 0 && wordCount(segment) >= 3)

  const uniqueSegments: string[] = []
  const seen = new Set<string>()
  rawSegments.forEach((segment) => {
    const key = segment.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    uniqueSegments.push(segment)
  })
  return uniqueSegments
}

function parseMissionGoal(goal: string, teamMembers: TeamMember[], missionId?: string): HubTask[] {
  const trimmedGoal = goal.trim()
  if (!trimmedGoal) return []
  const now = Date.now()
  const segments = extractMissionItems(trimmedGoal)
  const normalizedGoal = cleanMissionSegment(trimmedGoal)

  // If we extracted >= 2 subtasks, return ONLY those subtasks (not the full goal as a task).
  // If 0–1 subtasks, collapse to [goal] as a single task.
  let missionItems: string[]
  if (segments.length >= 2) {
    const withoutFullGoal = segments.filter((s) => s !== normalizedGoal)
    missionItems = withoutFullGoal.length >= 1 ? withoutFullGoal : segments
  } else {
    missionItems = normalizedGoal ? [normalizedGoal] : []
  }

  return missionItems.map((segment, index) => {
    const member = teamMembers.length > 0 ? teamMembers[index % teamMembers.length] : undefined
    const createdAt = now + index
    return {
      id: createTaskId(),
      title: segment,
      description: '',
      priority: index === 0 ? 'high' : 'normal',
      status: member ? 'assigned' : 'inbox',
      agentId: member?.id,
      missionId,
      createdAt,
      updatedAt: createdAt,
    }
  })
}

function truncateMissionGoal(goal: string, max = 110): string {
  if (goal.length <= max) return goal
  return `${goal.slice(0, max - 1).trimEnd()}…`
}

function buildTeamFromTemplate(templateId: TeamTemplateId): TeamMember[] {
  const template = TEAM_TEMPLATES.find((entry) => entry.id === templateId)
  if (!template) return []

  const modelSuggestions = TEMPLATE_MODEL_SUGGESTIONS[template.id]

  return template.agents.map((agentName, index) => ({
    id: `${template.id}-${agentName}`,
    name: toTitleCase(agentName),
    avatar: getAgentAvatarForSlot(index),
    modelId: modelSuggestions[index] ?? 'auto',
    roleDescription: `${toTitleCase(agentName)} lead for this mission`,
    goal: '',
    backstory: '',
    status: 'available',
  }))
}

function buildTeamFromRuntime(
  agents: AgentHubLayoutProps['agents'],
): TeamMember[] {
  return agents.slice(0, 5).map((agent, index) => ({
    id: agent.id,
    name: agent.name,
    avatar: getAgentAvatarForSlot(index),
    modelId: 'auto',
    roleDescription: agent.role,
    goal: '',
    backstory: '',
    status: agent.status || 'available',
  }))
}

function toTeamMember(value: unknown): TeamMember | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const row = value as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const status = typeof row.status === 'string' ? row.status.trim() : 'available'
  const roleDescription =
    typeof row.roleDescription === 'string' ? row.roleDescription : ''
  const avatar =
    row.avatar === undefined
      ? undefined
      : normalizeAgentAvatarIndex(row.avatar)
  const goal = typeof row.goal === 'string' ? row.goal : ''
  const backstory = typeof row.backstory === 'string' ? row.backstory : ''
  const modelIdRaw = typeof row.modelId === 'string' ? row.modelId.trim() : 'auto'
  const modelId = modelIdRaw || 'auto'

  if (!id || !name) return null

  return {
    id,
    name,
    avatar,
    modelId,
    roleDescription,
    goal,
    backstory,
    status: status || 'available',
  }
}

function readStoredTeam(): TeamMember[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(TEAM_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => toTeamMember(entry))
      .filter((entry): entry is TeamMember => Boolean(entry))
  } catch {
    return []
  }
}

function toSavedTeamConfig(value: unknown): SavedTeamConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const createdAt =
    typeof row.createdAt === 'number' ? row.createdAt : Date.now()
  const updatedAt =
    typeof row.updatedAt === 'number' ? row.updatedAt : createdAt
  const teamRaw = Array.isArray(row.team) ? row.team : []
  const team = teamRaw
    .map((entry) => toTeamMember(entry))
    .filter((entry): entry is TeamMember => Boolean(entry))

  if (!id || !name || team.length === 0) return null

  const icon = typeof row.icon === 'string' ? row.icon : undefined

  return {
    id,
    name,
    icon,
    createdAt,
    updatedAt,
    team,
  }
}

function readStoredTeamConfigs(): SavedTeamConfig[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(TEAM_CONFIGS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => toSavedTeamConfig(entry))
      .filter((entry): entry is SavedTeamConfig => Boolean(entry))
      .sort((left, right) => right.updatedAt - left.updatedAt)
  } catch {
    return []
  }
}

function suggestTemplate(goal: string): TeamTemplateId {
  const normalized = goal.toLowerCase()
  const hasAny = (keywords: string[]) =>
    keywords.some((keyword) => normalized.includes(keyword))

  if (hasAny(['coding', 'code', 'dev', 'build', 'ship', 'fix', 'bug', 'api', 'rest', 'endpoint'])) {
    return 'coding'
  }
  if (hasAny(['research', 'analyze', 'investigate', 'report', 'competitor'])) {
    return 'research'
  }
  if (hasAny(['write', 'content', 'blog', 'copy', 'edit'])) {
    return 'content'
  }
  return 'coding'
}

function resolveActiveTemplate(team: TeamMember[]): TeamTemplateId | undefined {
  return TEAM_TEMPLATES.find((template) => {
    if (team.length !== template.agents.length) return false
    return template.agents.every((agentName) =>
      team.some((member) => member.id === `${template.id}-${agentName}`),
    )
  })?.id
}

// Stored format for agent session info in localStorage (v2)
type AgentSessionInfo = {
  sessionKey: string
  model?: string
}

type SessionRecord = Record<string, unknown>

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readSessionId(session: SessionRecord): string {
  return readString(session.key) || readString(session.friendlyId)
}

function readSessionName(session: SessionRecord): string {
  return (
    readString(session.label) ||
    readString(session.displayName) ||
    readString(session.title) ||
    readString(session.friendlyId) ||
    readString(session.key)
  )
}

function readSessionLastMessage(session: SessionRecord): string {
  const record =
    session.lastMessage && typeof session.lastMessage === 'object' && !Array.isArray(session.lastMessage)
      ? (session.lastMessage as Record<string, unknown>)
      : null
  if (!record) return ''
  const directText = readString(record.text)
  if (directText) return directText
  const parts = Array.isArray(record.content) ? record.content : []
  return parts
    .map((part) => {
      if (!part || typeof part !== 'object' || Array.isArray(part)) return ''
      return readString((part as Record<string, unknown>).text)
    })
    .filter(Boolean)
    .join(' ')
}

function readSessionActivityMarker(session: SessionRecord): string {
  const updatedAtRaw =
    typeof session.updatedAt === 'number' || typeof session.updatedAt === 'string'
      ? String(session.updatedAt)
      : ''
  const lastMessage = readSessionLastMessage(session)
  const status = readString(session.status)
  return `${updatedAtRaw}|${status}|${lastMessage}`
}

function parseSsePayload(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function readEventText(payload: Record<string, unknown>): string {
  const direct = readString(payload.text) || readString(payload.content) || readString(payload.chunk)
  if (direct) return direct
  const message =
    payload.message && typeof payload.message === 'object' && !Array.isArray(payload.message)
      ? (payload.message as Record<string, unknown>)
      : null
  if (!message) return ''
  const nested = readString(message.text) || readString(message.content)
  if (nested) return nested
  const contentBlocks = Array.isArray(message.content) ? message.content : []
  return contentBlocks
    .map((block) => {
      if (!block || typeof block !== 'object' || Array.isArray(block)) return ''
      const row = block as Record<string, unknown>
      return readString(row.type) === 'text' ? readString(row.text) : ''
    })
    .filter(Boolean)
    .join('')
}

function readEventRole(payload: Record<string, unknown>): 'assistant' | 'user' | '' {
  const direct = readString(payload.role).toLowerCase()
  if (direct === 'assistant' || direct === 'user') return direct
  const message =
    payload.message && typeof payload.message === 'object' && !Array.isArray(payload.message)
      ? (payload.message as Record<string, unknown>)
      : null
  const nested = readString(message?.role).toLowerCase()
  return nested === 'assistant' || nested === 'user' ? nested : ''
}

function normalizeArtifactType(lang: string): MissionArtifact['type'] {
  const normalized = lang.toLowerCase()
  if (normalized === 'html') return 'html'
  if (normalized === 'md' || normalized === 'markdown') return 'markdown'
  if (normalized === 'txt' || normalized === 'text') return 'text'
  return 'code'
}

function extractArtifactsFromOutput(params: {
  agentId: string
  agentName: string
  text: string
  timestamp?: number
}): MissionArtifact[] {
  const { agentId, agentName, text } = params
  const timestamp = params.timestamp ?? Date.now()
  const artifacts: MissionArtifact[] = []
  const codeBlockRegex = /```([a-zA-Z0-9_-]+)?([^\n]*)\n([\s\S]*?)```/g

  for (const match of text.matchAll(codeBlockRegex)) {
    const lang = (match[1] ?? '').trim()
    const meta = match[2] ?? ''
    const content = (match[3] ?? '').trim()
    const filenameMatch = meta.match(/\bfilename=([^\s`]+)/i)
    const filename = filenameMatch?.[1]?.trim()
    if (!filename || !content) continue
    artifacts.push({
      id: createTaskId(),
      agentId,
      agentName,
      type: normalizeArtifactType(lang),
      title: filename,
      content,
      timestamp,
    })
  }

  const reportPatterns = [
    {
      regex: /(^##\s+Report\b[\s\S]*?)(?=^\s*##\s+|\Z)/im,
      title: 'Report',
    },
    {
      regex: /(^#\s+Summary\b[\s\S]*?)(?=^\s*#\s+|\Z)/im,
      title: 'Summary',
    },
  ] as const

  reportPatterns.forEach(({ regex, title }) => {
    const match = text.match(regex)
    if (!match?.[1]) return
    const content = match[1].trim()
    if (!content) return
    artifacts.push({
      id: createTaskId(),
      agentId,
      agentName,
      type: 'markdown',
      title: `${agentName} ${title}`,
      content,
      timestamp,
    })
  })

  return artifacts
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function computeMissionTaskStats(tasks: HubTask[]): MissionTaskStats {
  const total = tasks.length
  const completed = tasks.filter((task) => task.status === 'done' || (task.status as string) === 'completed').length
  const failed = tasks.filter((task) => (task.status as string) === 'blocked').length
  return { total, completed, failed }
}

function estimateMissionCost(tokenCount: number): number {
  return Number(((tokenCount / 1000) * ROUGH_COST_PER_1K_TOKENS_USD).toFixed(2))
}

function parseTokenBudget(value: string): number | null {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return null
  const parsed = Number.parseInt(digits, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function generateMissionReport(payload: MissionReportPayload): string {
  const durationMs = Math.max(0, payload.completedAt - payload.startedAt)
  const taskStats = computeMissionTaskStats(payload.tasks)
  const costEstimate = estimateMissionCost(payload.tokenCount)
  const lines: string[] = []

  lines.push('# Mission Report')
  lines.push('')
  lines.push(`## Mission`)
  lines.push(`- Goal: ${payload.goal || 'Untitled mission'}`)
  lines.push(`- Team: ${payload.teamName}`)
  lines.push(`- Started: ${new Date(payload.startedAt).toLocaleString()}`)
  lines.push(`- Completed: ${new Date(payload.completedAt).toLocaleString()}`)
  lines.push(`- Duration: ${formatDuration(durationMs)}`)
  lines.push('')
  lines.push('## Team')
  if (payload.team.length === 0) {
    lines.push('- No agents')
  } else {
    payload.team.forEach((member) => {
      lines.push(`- ${member.name} (${member.modelId})`)
    })
  }
  lines.push('')
  lines.push('## Tasks')
  lines.push(`- Total: ${taskStats.total}`)
  lines.push(`- Completed: ${taskStats.completed}`)
  lines.push(`- Failed: ${taskStats.failed}`)
  lines.push('')
  lines.push('## Per-Agent Summary')
  if (payload.agentSummaries.length === 0) {
    lines.push('- No agent output captured')
  } else {
    payload.agentSummaries.forEach((summary) => {
      lines.push(`### ${summary.agentName} (${summary.modelId || 'unknown'})`)
      if (summary.lines.length === 0) {
        lines.push('- No output captured')
      } else {
        summary.lines.forEach((line) => {
          lines.push(`- ${line}`)
        })
      }
      lines.push('')
    })
  }
  lines.push('## Artifacts')
  if (payload.artifacts.length === 0) {
    lines.push('- None')
  } else {
    payload.artifacts.forEach((artifact) => {
      lines.push(`- ${artifact.title} [${artifact.type}] by ${artifact.agentName}`)
    })
  }
  lines.push('')
  lines.push('## Cost Estimate')
  lines.push(`- Tokens: ${payload.tokenCount.toLocaleString()}`)
  lines.push(`- Estimated Cost: $${costEstimate.toFixed(2)} (rough)`)
  lines.push('')

  return lines.join('\n')
}

function loadStoredMissionReports(): StoredMissionReport[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(MISSION_REPORTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is StoredMissionReport => Boolean(entry && typeof entry === 'object'))
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, MAX_MISSION_REPORTS)
  } catch {
    return []
  }
}

function saveStoredMissionReport(entry: StoredMissionReport): StoredMissionReport[] {
  if (typeof window === 'undefined') return [entry]
  const next = [entry, ...loadStoredMissionReports().filter((row) => row.id !== entry.id)]
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, MAX_MISSION_REPORTS)
  try {
    window.localStorage.setItem(MISSION_REPORTS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore quota/write errors
  }
  return next
}

const TEMPLATE_DISPLAY_NAMES: Record<TeamTemplateId, string> = {
  research: 'Research Team',
  coding: 'Coding Sprint',
  content: 'Content Pipeline',
}

const LEGACY_AGENT_AVATARS = ['🔍', '✍️', '📝', '🧪', '🎨', '📊', '🛡️', '⚡', '🔬', '🎯'] as const
const AGENT_AVATAR_COUNT = 10
const LEGACY_AGENT_AVATAR_INDEX = new Map<string, number>(
  LEGACY_AGENT_AVATARS.map((avatar, index) => [avatar, index]),
)

function normalizeAgentAvatarIndex(value: unknown, fallbackIndex = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value)
    if (normalized >= 0) return normalized % AGENT_AVATAR_COUNT
  }
  if (typeof value === 'string') {
    const legacy = LEGACY_AGENT_AVATAR_INDEX.get(value.trim())
    if (legacy !== undefined) return legacy
  }
  const fallback = Math.trunc(fallbackIndex)
  return ((fallback % AGENT_AVATAR_COUNT) + AGENT_AVATAR_COUNT) % AGENT_AVATAR_COUNT
}

function getAgentAvatarForSlot(index: number): number {
  return normalizeAgentAvatarIndex(index, 0)
}

function resolveAgentAvatarIndex(member: unknown, index: number): number {
  const row = member && typeof member === 'object' && !Array.isArray(member)
    ? (member as Record<string, unknown>)
    : null
  return normalizeAgentAvatarIndex(row?.avatar, index)
}

function darkenHexColor(color: string, amount = 0.2): string {
  const hex = color.trim()
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex
  const expanded =
    normalized.length === 3
      ? normalized.split('').map((char) => `${char}${char}`).join('')
      : normalized

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return color

  const r = Math.round(parseInt(expanded.slice(0, 2), 16) * (1 - amount))
  const g = Math.round(parseInt(expanded.slice(2, 4), 16) * (1 - amount))
  const b = Math.round(parseInt(expanded.slice(4, 6), 16) * (1 - amount))
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export function AgentAvatar({
  index,
  color,
  size = 40,
  className,
}: {
  index: number
  color: string
  size?: number
  className?: string
}) {
  const variant = normalizeAgentAvatarIndex(index, 0)
  const shade = darkenHexColor(color, 0.2)
  const outline = darkenHexColor(color, 0.35)
  const eye = '#f8fafc'

  const baseParts = (() => {
    switch (variant) {
      case 2:
        return {
          head: (
            <>
              <rect x="16" y="9" width="16" height="12" fill={color} />
              <rect x="14" y="11" width="20" height="8" fill={color} />
              <rect x="30" y="9" width="2" height="12" fill={shade} />
              <rect x="14" y="17" width="20" height="2" fill={shade} />
              <rect x="16" y="19" width="16" height="2" fill={shade} />
            </>
          ),
          body: { x: 14, y: 22, w: 20, h: 14 },
          arms: { leftX: 9, rightX: 35, y: 24, w: 4, h: 10 },
          legs: { y: 36, w: 5, h: 6, leftX: 17, rightX: 26 },
        }
      case 3:
        return {
          head: (
            <>
              <rect x="15" y="10" width="18" height="11" fill={color} />
              <rect x="31" y="10" width="2" height="11" fill={shade} />
              <rect x="14" y="19" width="20" height="3" fill={shade} />
            </>
          ),
          body: { x: 12, y: 22, w: 24, h: 15 },
          arms: { leftX: 7, rightX: 37, y: 24, w: 5, h: 11 },
          legs: { y: 37, w: 6, h: 5, leftX: 16, rightX: 26 },
        }
      case 4:
        return {
          head: (
            <>
              <rect x="18" y="9" width="12" height="14" fill={color} />
              <rect x="28" y="9" width="2" height="14" fill={shade} />
              <rect x="18" y="21" width="12" height="2" fill={shade} />
            </>
          ),
          body: { x: 17, y: 23, w: 14, h: 15 },
          arms: { leftX: 12, rightX: 32, y: 25, w: 4, h: 10 },
          legs: { y: 38, w: 4, h: 5, leftX: 19, rightX: 25 },
        }
      case 8:
        return {
          head: (
            <>
              <rect x="17" y="12" width="14" height="11" fill={color} />
              <rect x="29" y="12" width="2" height="11" fill={shade} />
              <rect x="17" y="21" width="14" height="2" fill={shade} />
            </>
          ),
          body: { x: 16, y: 23, w: 16, h: 12 },
          arms: { leftX: 12, rightX: 32, y: 25, w: 3, h: 8 },
          legs: { y: 35, w: 4, h: 6, leftX: 18, rightX: 25 },
        }
      default:
        return {
          head: (
            <>
              <rect x="16" y="10" width="16" height="12" fill={color} />
              <rect x="30" y="10" width="2" height="12" fill={shade} />
              <rect x="16" y="20" width="16" height="2" fill={shade} />
            </>
          ),
          body: { x: 14, y: 22, w: 20, h: 14 },
          arms: { leftX: 10, rightX: 34, y: 24, w: 4, h: 10 },
          legs: { y: 36, w: 5, h: 6, leftX: 17, rightX: 26 },
        }
    }
  })()

  const bodyParts = (
    <>
      {baseParts.head}
      <rect x={baseParts.body.x} y={baseParts.body.y} width={baseParts.body.w} height={baseParts.body.h} fill={color} />
      <rect x={baseParts.body.x + baseParts.body.w - 2} y={baseParts.body.y} width="2" height={baseParts.body.h} fill={shade} />
      <rect x={baseParts.body.x} y={baseParts.body.y + baseParts.body.h - 2} width={baseParts.body.w} height="2" fill={shade} />
      <rect x={baseParts.arms.leftX} y={baseParts.arms.y} width={baseParts.arms.w} height={baseParts.arms.h} fill={color} />
      <rect x={baseParts.arms.rightX} y={baseParts.arms.y} width={baseParts.arms.w} height={baseParts.arms.h} fill={color} />
      <rect x={baseParts.arms.leftX + Math.max(0, baseParts.arms.w - 1)} y={baseParts.arms.y} width="1" height={baseParts.arms.h} fill={shade} />
      <rect x={baseParts.arms.rightX + Math.max(0, baseParts.arms.w - 1)} y={baseParts.arms.y} width="1" height={baseParts.arms.h} fill={shade} />
      <rect x={baseParts.legs.leftX} y={baseParts.legs.y} width={baseParts.legs.w} height={baseParts.legs.h} fill={color} />
      <rect x={baseParts.legs.rightX} y={baseParts.legs.y} width={baseParts.legs.w} height={baseParts.legs.h} fill={color} />
      <rect x={baseParts.legs.leftX + Math.max(0, baseParts.legs.w - 1)} y={baseParts.legs.y} width="1" height={baseParts.legs.h} fill={shade} />
      <rect x={baseParts.legs.rightX + Math.max(0, baseParts.legs.w - 1)} y={baseParts.legs.y} width="1" height={baseParts.legs.h} fill={shade} />
    </>
  )

  const details = (() => {
    switch (variant) {
      case 0:
        return (
          <>
            <rect x="23" y="6" width="2" height="4" fill={color} />
            <circle cx="24" cy="5" r="1.5" fill={eye} />
            <circle cx="20" cy="16" r="1.6" fill={eye} />
            <circle cx="28" cy="16" r="1.6" fill={eye} />
            <rect x="19" y="20" width="10" height="2" fill={outline} />
            <rect x="18" y="28" width="12" height="2" fill={shade} />
          </>
        )
      case 1:
        return (
          <>
            <rect x="17" y="14" width="14" height="5" fill={eye} opacity="0.95" />
            <rect x="17" y="18" width="14" height="1" fill={shade} />
            <rect x="19" y="28" width="10" height="2" fill={shade} />
            <rect x="13" y="15" width="3" height="2" fill={shade} />
            <rect x="32" y="15" width="3" height="2" fill={shade} />
          </>
        )
      case 2:
        return (
          <>
            <circle cx="19" cy="16" r="2.2" fill={eye} />
            <circle cx="29" cy="16" r="2.2" fill={eye} />
            <rect x="20" y="20" width="8" height="2" fill={shade} />
            <rect x="20" y="29" width="8" height="2" fill={shade} />
          </>
        )
      case 3:
        return (
          <>
            <rect x="18" y="15" width="4" height="2" fill={eye} />
            <rect x="26" y="15" width="4" height="2" fill={eye} />
            <rect x="16" y="18" width="16" height="2" fill={outline} />
            <rect x="18" y="28" width="12" height="2" fill={outline} />
            <rect x="16" y="31" width="16" height="2" fill={shade} />
          </>
        )
      case 4:
        return (
          <>
            <circle cx="21" cy="16" r="1.7" fill={eye} />
            <circle cx="27" cy="16" r="1.7" fill={eye} />
            <rect x="22" y="20" width="4" height="1" fill={shade} />
            <rect x="20" y="29" width="8" height="2" fill={shade} />
            <rect x="21" y="32" width="6" height="1" fill={outline} />
          </>
        )
      case 5:
        return (
          <>
            <rect x="18" y="5" width="2" height="5" fill={color} />
            <rect x="28" y="5" width="2" height="5" fill={color} />
            <circle cx="19" cy="4" r="1.6" fill={eye} />
            <circle cx="29" cy="4" r="1.6" fill={eye} />
            <circle cx="20" cy="16" r="1.6" fill={eye} />
            <circle cx="28" cy="16" r="1.6" fill={eye} />
            <rect x="19" y="20" width="10" height="2" fill={shade} />
            <rect x="18" y="28" width="12" height="2" fill={shade} />
          </>
        )
      case 6:
        return (
          <>
            <circle cx="24" cy="16" r="3.2" fill={eye} />
            <circle cx="24" cy="16" r="1.3" fill={shade} />
            <rect x="18" y="20" width="12" height="2" fill={outline} />
            <rect x="17" y="28" width="2" height="2" fill={shade} />
            <rect x="19" y="30" width="2" height="2" fill={shade} />
            <rect x="21" y="28" width="2" height="2" fill={shade} />
            <rect x="23" y="30" width="2" height="2" fill={shade} />
            <rect x="25" y="28" width="2" height="2" fill={shade} />
            <rect x="27" y="30" width="2" height="2" fill={shade} />
            <rect x="29" y="28" width="2" height="2" fill={shade} />
          </>
        )
      case 7:
        return (
          <>
            <rect x="21" y="7" width="6" height="3" fill={color} />
            <rect x="22" y="5" width="4" height="2" fill={color} />
            <rect x="18" y="15" width="4" height="2" fill={eye} />
            <rect x="26" y="15" width="4" height="2" fill={eye} />
            <rect x="17" y="18" width="14" height="2" fill={outline} />
            <rect x="19" y="28" width="10" height="2" fill={outline} />
          </>
        )
      case 8:
        return (
          <>
            <circle cx="20" cy="17" r="2.3" fill={eye} />
            <circle cx="28" cy="17" r="2.3" fill={eye} />
            <rect x="21" y="21" width="6" height="1" fill={shade} />
            <rect x="20" y="27" width="8" height="2" fill={shade} />
          </>
        )
      case 9:
      default:
        return (
          <>
            <circle cx="19" cy="16" r="2.4" fill={eye} />
            <circle cx="29" cy="16" r="1.4" fill={eye} />
            <rect x="17" y="20" width="4" height="1" fill={shade} />
            <rect x="23" y="20" width="3" height="1" fill={shade} />
            <rect x="28" y="20" width="2" height="1" fill={shade} />
            <rect x="18" y="28" width="2" height="2" fill={outline} />
            <rect x="20" y="30" width="2" height="2" fill={outline} />
            <rect x="22" y="28" width="2" height="2" fill={outline} />
            <rect x="24" y="30" width="2" height="2" fill={outline} />
            <rect x="26" y="28" width="2" height="2" fill={outline} />
            <rect x="28" y="30" width="2" height="2" fill={outline} />
            <rect x="31" y="24" width="2" height="4" fill={shade} />
          </>
        )
    }
  })()

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      className={className}
      shapeRendering="crispEdges"
    >
      <rect x="5" y="5" width="38" height="38" fill={color} opacity="0.08" />
      <rect x="7" y="7" width="34" height="34" fill="white" opacity="0.92" />
      <rect x="7" y="7" width="34" height="34" fill="none" stroke={outline} strokeWidth="1" />
      {bodyParts}
      {details}
    </svg>
  )
}

// ── Agent accent colors (indexed per agent slot) ───────────────────────────────
const AGENT_ACCENT_COLORS = [
  { bar: 'bg-orange-500', border: 'border-orange-500', avatar: 'bg-orange-100', text: 'text-orange-600', ring: 'ring-orange-500/20' },
  { bar: 'bg-blue-500', border: 'border-blue-500', avatar: 'bg-blue-100', text: 'text-blue-600', ring: 'ring-blue-500/20' },
  { bar: 'bg-violet-500', border: 'border-violet-500', avatar: 'bg-violet-100', text: 'text-violet-600', ring: 'ring-violet-500/20' },
  { bar: 'bg-emerald-500', border: 'border-emerald-500', avatar: 'bg-emerald-100', text: 'text-emerald-600', ring: 'ring-emerald-500/20' },
  { bar: 'bg-rose-500', border: 'border-rose-500', avatar: 'bg-rose-100', text: 'text-rose-600', ring: 'ring-rose-500/20' },
  { bar: 'bg-amber-500', border: 'border-amber-500', avatar: 'bg-amber-100', text: 'text-amber-700', ring: 'ring-amber-500/20' },
  { bar: 'bg-cyan-500', border: 'border-cyan-500', avatar: 'bg-cyan-100', text: 'text-cyan-600', ring: 'ring-cyan-500/20' },
  { bar: 'bg-fuchsia-500', border: 'border-fuchsia-500', avatar: 'bg-fuchsia-100', text: 'text-fuchsia-600', ring: 'ring-fuchsia-500/20' },
  { bar: 'bg-lime-500', border: 'border-lime-500', avatar: 'bg-lime-100', text: 'text-lime-700', ring: 'ring-lime-500/20' },
  { bar: 'bg-sky-500', border: 'border-sky-500', avatar: 'bg-sky-100', text: 'text-sky-600', ring: 'ring-sky-500/20' },
].map((accent, index) => ({
  ...accent,
  hex: ['#f97316', '#3b82f6', '#8b5cf6', '#10b981', '#f43f5e', '#f59e0b', '#06b6d4', '#d946ef', '#84cc16', '#0ea5e9'][index] ?? '#f97316',
}))

// ── Model badge styling ────────────────────────────────────────────────────────
const OFFICE_MODEL_BADGE: Record<ModelPresetId, string> = {
  auto:   'rounded-full border border-neutral-200 bg-neutral-100 text-neutral-600',
  opus:   'border border-orange-200 bg-orange-50 text-orange-700',
  sonnet: 'border border-blue-200 bg-blue-50 text-blue-700',
  codex:  'border border-emerald-200 bg-emerald-50 text-emerald-700',
  flash:  'border border-violet-200 bg-violet-50 text-violet-700',
  minimax: 'border border-amber-200 bg-amber-50 text-amber-700',
}

const OFFICE_MODEL_LABEL: Record<ModelPresetId, string> = {
  auto:   'Auto',
  opus:   'Opus',
  sonnet: 'Sonnet',
  codex:  'Codex',
  flash:  'Flash',
  minimax: 'MiniMax',
}

const DEFAULT_OFFICE_MODEL_BADGE =
  'border border-neutral-200 bg-neutral-50 text-neutral-700'

function getOfficeModelBadge(modelId: string): string {
  return OFFICE_MODEL_BADGE[modelId as ModelPresetId] ?? DEFAULT_OFFICE_MODEL_BADGE
}

function getAgentStatusMeta(status: AgentWorkingStatus): {
  label: string
  className: string
  dotClassName: string
  pulse?: boolean
} {
  switch (status) {
    case 'active':
      return {
        label: 'Active',
        className: 'text-blue-600',
        dotClassName: 'bg-blue-500',
        pulse: true,
      }
    case 'ready':
    case 'idle':
      return {
        label: 'Ready',
        className: 'text-emerald-600',
        dotClassName: 'bg-emerald-500',
      }
    case 'error':
      return {
        label: 'Error',
        className: 'text-red-600',
        dotClassName: 'bg-red-500',
      }
    case 'none':
      return {
        label: 'No session',
        className: 'text-neutral-400',
        dotClassName: 'bg-neutral-400',
      }
    case 'spawning':
      return {
        label: 'Spawning',
        className: 'text-amber-600',
        dotClassName: 'bg-amber-400',
        pulse: true,
      }
    case 'paused':
      return {
        label: 'Paused',
        className: 'text-amber-700',
        dotClassName: 'bg-amber-500',
      }
    default:
      return {
        label: toTitleCase(String(status)),
        className: 'text-neutral-600',
        dotClassName: 'bg-neutral-400',
      }
  }
}

// ── OfficeView ─────────────────────────────────────────────────────────────────
type OfficeViewProps = {
  agentRows: AgentWorkingRow[]
  missionRunning: boolean
  onViewOutput: (agentId: string) => void
  selectedOutputAgentId?: string
  activeTemplateName?: string
  processType: 'sequential' | 'hierarchical' | 'parallel'
}

function OfficeView({
  agentRows,
  missionRunning,
  onViewOutput,
  selectedOutputAgentId,
  activeTemplateName,
  processType,
}: OfficeViewProps) {
  if (agentRows.length === 0) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center p-8">
        <div className="text-center">
          <p className="mb-3 text-4xl">🏢</p>
          <p className="text-sm font-medium text-neutral-600 dark:text-slate-400">No agents in your team</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">Switch to the Team tab to add agents.</p>
        </div>
      </div>
    )
  }

  const processTypeBadgeClass =
    processType === 'hierarchical' ? 'border-violet-300 bg-violet-50 text-violet-700' :
    processType === 'sequential'   ? 'border-blue-300 bg-blue-50 text-blue-700' :
                                     'border-emerald-300 bg-emerald-50 text-emerald-700'

  return (
    <div className="h-full min-h-[420px] overflow-y-auto bg-neutral-50 p-4">
      {/* ── Crew strip ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-4 py-3 shadow-sm">
        {/* Overlapping agent avatars */}
        <div className="flex -space-x-2">
          {agentRows.slice(0, 5).map((agent, i) => {
            const accent = AGENT_ACCENT_COLORS[i % AGENT_ACCENT_COLORS.length]
            return (
              <div
                key={agent.id}
                title={agent.name}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 border-white shadow-sm',
                  accent.avatar,
                )}
              >
                <AgentAvatar index={i} color={accent.hex} size={22} />
              </div>
            )
          })}
          {agentRows.length > 5 ? (
            <div className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-neutral-100 text-[10px] font-bold text-neutral-600 dark:text-slate-400">
              +{agentRows.length - 5}
            </div>
          ) : null}
        </div>

        {/* Labels */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-sm font-semibold text-neutral-800">
            {agentRows.length} agent{agentRows.length !== 1 ? 's' : ''}
          </span>
          {activeTemplateName ? (
            <>
              <span className="text-neutral-300">·</span>
              <span className="truncate text-sm text-neutral-500 dark:text-slate-400">{activeTemplateName}</span>
            </>
          ) : null}
        </div>

        {/* Process type badge */}
        <div className="flex items-center gap-2 shrink-0">
          {missionRunning && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              MISSION ACTIVE
            </span>
          )}
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
              processTypeBadgeClass,
            )}
          >
            {processType}
          </span>
        </div>
      </div>

      {/* ── Agent desk grid ─────────────────────────────────────────────── */}
      <div
        className={cn(
          'grid auto-rows-fr gap-4',
          agentRows.length <= 3 ? 'grid-cols-1 sm:grid-cols-2' :
          'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
        )}
      >
        {agentRows.map((agent, i) => {
          const accent = AGENT_ACCENT_COLORS[i % AGENT_ACCENT_COLORS.length]
          const isActive = agent.status === 'active'
          const isSelected = agent.id === selectedOutputAgentId
          const isSpawning = agent.status === 'spawning'
          const statusMeta = getAgentStatusMeta(agent.status)

          // Fix 2: Standardised status dots
          // 🟢 Green = active  🟡 Yellow = has session (idle/ready)  ⚫ Gray = no session  🔴 Red = error
          const statusDotEl = isActive ? (
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
            </span>
          ) : isSpawning ? (
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/60" />
              <span className="relative inline-flex size-3 rounded-full bg-amber-400" />
            </span>
          ) : (
            <span
              className={cn(
                'size-3 shrink-0 rounded-full',
                agent.status === 'idle'  ? 'bg-yellow-500' :
                agent.status === 'ready' ? 'bg-yellow-500' :
                agent.status === 'error' ? 'bg-red-500' :
                'bg-neutral-400',  // 'none' — no session
              )}
            />
          )

          return (
            <div
              key={agent.id}
              className={cn(
            'relative flex h-full min-h-[248px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md',
            isSelected
                  ? 'shadow-md ring-1 ring-orange-300'
                  : '',
                isActive && missionRunning && !isSelected && 'ring-1 ring-emerald-200',
              )}
            >
              {/* Top accent bar (3px) */}
              <div className={cn('h-[3px] w-full', accent.bar)} />

              <div className="flex h-full flex-col p-4">
                {/* Header: avatar (left) + status dot (right) */}
                <div className="flex items-start justify-between">
                  {/* Avatar */}
                  <div
                    className={cn(
                      'flex size-12 items-center justify-center rounded-full border border-white/80 shadow-sm',
                      accent.avatar,
                    )}
                  >
                    <AgentAvatar index={i} color={accent.hex} size={28} />
                  </div>
                  {/* Status dot */}
                  {statusDotEl}
                </div>

                {/* Agent name */}
                <h3 className="mt-3 truncate text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">
                  {agent.name}
                </h3>

                {/* Role / model row */}
                <div className="mt-1 flex flex-wrap items-start gap-1.5">
                  {agent.roleDescription ? (
                    <span className="line-clamp-2 min-w-0 text-xs text-neutral-600 dark:text-slate-400">
                      {agent.roleDescription}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'shrink-0 px-2 py-0.5 font-mono text-[10px] font-medium',
                      getOfficeModelBadge(agent.modelId),
                    )}
                  >
                    {getModelShortLabel(agent.modelId)}
                  </span>
                </div>

                <p
                  className={cn(
                    'mt-2 text-[11px] font-medium',
                    statusMeta.className,
                  )}
                >
                  ● {statusMeta.label}
                </p>
                {agent.lastLine ? (
                  <p className="mt-1 line-clamp-2 min-h-[2.1em] font-mono text-xs leading-relaxed text-neutral-500 dark:text-slate-400">
                    {agent.lastLine}
                  </p>
                ) : (
                  <p className="mt-1 min-h-[2.1em] font-mono text-xs leading-relaxed text-neutral-400">
                    {agent.status === 'none' ? 'Waiting for session' : 'No recent output'}
                  </p>
                )}

                {/* Footer: task count badge */}
                {agent.taskCount > 0 ? (
                  <div className="mt-2">
                    <span className="rounded-full border border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-2 py-0.5 text-[9px] font-semibold text-neutral-600 dark:text-slate-400">
                      {agent.taskCount} task{agent.taskCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                ) : null}

                {/* View Output button — full-width */}
                <button
                  type="button"
                  onClick={() => onViewOutput(agent.id)}
                  className={cn(
                    'mt-auto w-full rounded-lg border px-2 py-2 text-[11px] font-medium transition-colors',
                    isSelected
                      ? 'border-orange-200 bg-orange-50 text-orange-700'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50',
                  )}
                >
                  {isSelected ? '✓ Viewing Output' : 'View Output'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Fix 2: Status dot legend */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-4 py-2 shadow-sm">
        <span className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-slate-400">
          <span className="size-2 rounded-full bg-emerald-500" /> Active
        </span>
        <span className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-slate-400">
          <span className="size-2 rounded-full bg-yellow-500" /> Idle
        </span>
        <span className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-slate-400">
          <span className="size-2 rounded-full bg-neutral-400" /> No session
        </span>
        <span className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-slate-400">
          <span className="size-2 rounded-full bg-red-500" /> Error
        </span>
      </div>
    </div>
  )
}

// ── HistoryView ────────────────────────────────────────────────────────────────
function timeAgoFromMs(ms: number): string {
  const delta = Math.max(0, Date.now() - ms)
  const seconds = Math.floor(delta / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function HistoryView() {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [localHistory] = useState<MissionCheckpoint[]>(() => loadMissionHistory())

  useEffect(() => {
    let cancelled = false

    async function fetchHistory() {
      setLoading(true)
      try {
        const res = await fetch('/api/sessions')
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { sessions?: SessionRecord[] }
        const missionSessions = (data.sessions ?? [])
          .filter((s) => {
            const label = readString(s.label)
            return label.startsWith('Mission:')
          })
          .sort((a, b) => {
            const aTime = typeof a.updatedAt === 'number' ? a.updatedAt : 0
            const bTime = typeof b.updatedAt === 'number' ? b.updatedAt : 0
            return bTime - aTime
          })
        if (!cancelled) setSessions(missionSessions)
      } catch {
        // ignore fetch errors
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchHistory()
    return () => {
      cancelled = true
    }
  }, [])

  const hasLocalHistory = localHistory.length > 0
  const hasApiSessions = sessions.length > 0

  if (loading && !hasLocalHistory) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-2 size-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" />
          <p className="font-mono text-[10px] text-neutral-500 dark:text-slate-400">// loading mission history…</p>
        </div>
      </div>
    )
  }

  if (!hasLocalHistory && !hasApiSessions) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="mb-3 text-4xl opacity-30">📋</p>
          <p className="text-sm font-medium text-neutral-700">No mission history yet</p>
          <p className="mt-1 font-mono text-[10px] text-neutral-500 dark:text-slate-400">// start a mission to see it recorded here</p>
        </div>
      </div>
    )
  }

  const PROCESS_TYPE_BADGE: Record<string, string> = {
    sequential:   'bg-blue-50 text-blue-700 border border-blue-200',
    hierarchical: 'bg-violet-50 text-violet-700 border border-violet-200',
    parallel:     'bg-emerald-50 text-emerald-700 border border-emerald-200',
  }

  const CHECKPOINT_STATUS_BADGE: Record<string, { label: string; icon: string; className: string }> = {
    running:   { label: 'Running',   icon: '▶', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    paused:    { label: 'Paused',    icon: '⏸', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
    completed: { label: 'Completed', icon: '●', className: 'bg-neutral-100 text-neutral-600 border border-neutral-200' },
    aborted:   { label: 'Aborted',   icon: '✕', className: 'bg-red-50 text-red-700 border border-red-200' },
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-neutral-600 dark:text-slate-400">Mission Reports</h2>

      {/* Local checkpoint history */}
      {hasLocalHistory ? (
        <div className="space-y-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-700">📦 Local Checkpoints</p>
          {localHistory.map((cp) => {
            const completedTasks = cp.tasks.filter(t => t.status === 'done' || t.status === 'completed').length
            const totalTasks = cp.tasks.length
            const statusBadge = CHECKPOINT_STATUS_BADGE[cp.status] ?? CHECKPOINT_STATUS_BADGE['completed']!
            const processClass = PROCESS_TYPE_BADGE[cp.processType] ?? ''
            const timeRef = cp.completedAt ?? cp.updatedAt

            return (
              <div
                key={cp.id}
                className="rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-4 transition-colors hover:border-neutral-300"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-neutral-500 dark:text-slate-400" aria-hidden>{statusBadge!.icon}</span>
                  <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                    {cp.label}
                  </h3>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold', statusBadge!.className)}>
                    {statusBadge!.label}
                  </span>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold capitalize', processClass)}>
                    {cp.processType}
                  </span>
                </div>

                {/* Team avatars */}
                {cp.team.length > 0 ? (
                  <div className="mb-2 flex -space-x-1.5">
                    {cp.team.slice(0, 5).map((member, idx) => {
                      const ac = AGENT_ACCENT_COLORS[idx % AGENT_ACCENT_COLORS.length]
                      return (
                        <span
                          key={member.id}
                          title={member.name}
                          className={cn('flex size-6 items-center justify-center rounded-full border border-white text-sm leading-none', ac.avatar)}
                        >
                          <AgentAvatar index={resolveAgentAvatarIndex(member, idx)} color={ac.hex} size={16} />
                        </span>
                      )
                    })}
                    {cp.team.length > 5 ? (
                      <span className="flex size-6 items-center justify-center rounded-full border border-white bg-neutral-200 text-[9px] font-bold text-neutral-600 dark:text-slate-400">
                        +{cp.team.length - 5}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex items-center gap-3 font-mono text-[9px] text-neutral-700">
                  {totalTasks > 0 ? (
                    <span>{completedTasks}/{totalTasks} tasks</span>
                  ) : null}
                  {timeRef > 0 ? <span>{timeAgoFromMs(timeRef)}</span> : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {/* API sessions history */}
      {hasApiSessions ? (
        <div className="space-y-3">
          {hasLocalHistory ? (
            <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-700">🌐 Gateway Sessions</p>
          ) : null}
          {sessions.map((session) => {
            const sessionId = readSessionId(session)
            const label = readString(session.label)
            const status = readString(session.status)
            const lastMessage = readSessionLastMessage(session)
            const updatedAtRaw = session.updatedAt
            const updatedAt =
              typeof updatedAtRaw === 'number'
                ? updatedAtRaw
                : typeof updatedAtRaw === 'string'
                  ? Date.parse(updatedAtRaw)
                  : 0
            const isExpanded = expandedId === sessionId
            const tokenCount = typeof session.tokenCount === 'number' ? session.tokenCount : undefined

            const statusBadge =
              status === 'active'
                ? { label: 'Active', icon: '▶', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
                : status === 'idle'
                  ? { label: 'Idle', icon: '⏸', className: 'bg-amber-50 text-amber-700 border border-amber-200' }
                  : { label: 'Ended', icon: '●', className: 'bg-neutral-100 text-neutral-600 border border-neutral-200' }

            return (
              <div
                key={sessionId || label}
                className="rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-4 transition-colors hover:border-neutral-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-neutral-500 dark:text-slate-400" aria-hidden>{statusBadge.icon}</span>
                      <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                        {label.replace(/^Mission:\s*/, '')}
                      </h3>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold',
                          statusBadge.className,
                        )}
                      >
                        {statusBadge.label}
                      </span>
                    </div>
                    {lastMessage ? (
                      <p className="mt-1.5 line-clamp-2 font-mono text-[10px] text-neutral-600 dark:text-slate-400">
                        {lastMessage}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-3 font-mono text-[9px] text-neutral-700">
                      {updatedAt > 0 ? <span>{timeAgoFromMs(updatedAt)}</span> : null}
                      {tokenCount !== undefined ? (
                        <span>{tokenCount.toLocaleString()} tokens</span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : sessionId)}
                    className="shrink-0 rounded-lg border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-[10px] font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 dark:text-white"
                  >
                    {isExpanded ? 'Hide' : 'View'}
                  </button>
                </div>

                {isExpanded ? (
                  <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                    <p className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-neutral-500 dark:text-slate-400">
                      Session Details
                    </p>
                    <dl className="space-y-1.5">
                      <div className="flex gap-2">
                        <dt className="shrink-0 font-mono text-[9px] text-neutral-500 dark:text-slate-400">ID</dt>
                        <dd className="truncate font-mono text-[9px] text-neutral-600 dark:text-slate-400">{sessionId}</dd>
                      </div>
                      {lastMessage ? (
                        <div className="flex flex-col gap-0.5">
                          <dt className="font-mono text-[9px] text-neutral-700">Last output</dt>
                          <dd className="line-clamp-4 font-mono text-[9px] text-neutral-500 dark:text-slate-400">{lastMessage}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

// Retained temporarily while the new 3-tab layout rolls out.
void OfficeView
void HistoryView

export function AgentHubLayout({ agents }: AgentHubLayoutProps) {
  // ── Tab + sidebar state ────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [configSection, setConfigSection] = useState<ConfigSection>('agents')
  const [avatarPickerOpenId, setAvatarPickerOpenId] = useState<string | null>(null)
  const [agentWizardOpenId, setAgentWizardOpenId] = useState<string | null>(null)
  const [teamWizardOpenId, setTeamWizardOpenId] = useState<string | null>(null)
  const [showAddTeamModal, setShowAddTeamModal] = useState(false)
  const [providerEditModalProvider, setProviderEditModalProvider] = useState<string | null>(null)
  const [showAddProviderModal, setShowAddProviderModal] = useState(false)
  const [newAgentDraft, setNewAgentDraft] = useState<(TeamMember & { backstory: string; roleDescription: string }) | null>(null)
  const [providerWizardStep, setProviderWizardStep] = useState<'select' | 'key'>('select')
  const [providerWizardSelected, setProviderWizardSelected] = useState('')
  const [liveFeedVisible, setLiveFeedVisible] = useState(false)
  const [unreadFeedCount, setUnreadFeedCount] = useState(0)
  const [processType, setProcessType] = useState<'sequential' | 'hierarchical' | 'parallel'>('parallel')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStepIndex, setWizardStepIndex] = useState(0)
  const [wizardCheckingGateway, setWizardCheckingGateway] = useState(false)
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([])
  const [addProviderName, setAddProviderName] = useState('')
  const [addProviderSelection, setAddProviderSelection] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [addProviderApiKey, setAddProviderApiKey] = useState('')
  const [isAddingProvider, setIsAddingProvider] = useState(false)

  // ── Approvals state ────────────────────────────────────────────────────────
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(() => loadApprovals())

  // ── Restore-banner state (from localStorage checkpoint) ───────────────────
  const [restoreCheckpoint, setRestoreCheckpoint] = useState<MissionCheckpoint | null>(() => {
    const cp = loadMissionCheckpoint()
    return cp?.status === 'running' ? cp : null
  })
  const [restoreDismissed, setRestoreDismissed] = useState(false)

  // ── Existing state ──────────────────────────────────────────────────────────
  const [isMobileHub, setIsMobileHub] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  )
  const [missionActive, setMissionActive] = useState(false)
  const [missionGoal, setMissionGoal] = useState('')
  const [activeMissionName, setActiveMissionName] = useState('')
  const [activeMissionGoal, setActiveMissionGoal] = useState('')
  const [missionBoardDrafts, setMissionBoardDrafts] = useState<MissionBoardDraft[]>([])
  const [missionBoardModalOpen, setMissionBoardModalOpen] = useState(false)
  const [missionWizardStep, setMissionWizardStep] = useState(0)
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(() => getStoredTheme())
  const [newMissionName, setNewMissionName] = useState('')
  const [newMissionGoal, setNewMissionGoal] = useState('')
  const [newMissionTeamConfigId, setNewMissionTeamConfigId] = useState('__current__')
  const [newMissionProcessType, setNewMissionProcessType] = useState<'sequential' | 'hierarchical' | 'parallel'>('parallel')
  const [newMissionBudgetLimit, setNewMissionBudgetLimit] = useState('120000')
  const [expandedMissionCardId, setExpandedMissionCardId] = useState<string | null>(null)
  const [_view, setView] = useState<'board' | 'timeline'>('board')
  const [missionState, setMissionState] = useState<'running' | 'paused' | 'stopped'>(
    'stopped',
  )
  const [budgetLimit, setBudgetLimit] = useState('120000')
  const [activeMissionBudgetLimit, setActiveMissionBudgetLimit] = useState('')
  const [autoAssign, setAutoAssign] = useState(true)
  const [teamPanelFlash, setTeamPanelFlash] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string>()
  const [selectedOutputAgentId, setSelectedOutputAgentId] = useState<string>()
  const [boardTasks, _setBoardTasks] = useState<Array<HubTask>>([])
  const [missionTasks, setMissionTasks] = useState<Array<HubTask>>([])
  const [dispatchedTaskIdsByAgent, setDispatchedTaskIdsByAgent] = useState<Record<string, Array<string>>>({})
  const [agentSessionMap, setAgentSessionMap] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const stored = window.localStorage.getItem('clawsuite:hub-agent-sessions')
      if (!stored) return {}
      const parsed = JSON.parse(stored) as Record<string, unknown>
      const result: Record<string, string> = {}
      for (const [id, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          // Old format: plain string sessionKey
          result[id] = value
        } else if (value && typeof value === 'object' && typeof (value as AgentSessionInfo).sessionKey === 'string') {
          // New format: { sessionKey, model? }
          result[id] = (value as AgentSessionInfo).sessionKey
        }
      }
      return result
    } catch {
      return {}
    }
  })
  const [agentSessionModelMap, setAgentSessionModelMap] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const stored = window.localStorage.getItem('clawsuite:hub-agent-sessions')
      if (!stored) return {}
      const parsed = JSON.parse(stored) as Record<string, unknown>
      const result: Record<string, string> = {}
      for (const [id, value] of Object.entries(parsed)) {
        if (value && typeof value === 'object' && typeof (value as AgentSessionInfo).model === 'string') {
          result[id] = (value as AgentSessionInfo).model as string
        }
      }
      return result
    } catch {
      return {}
    }
  })
  const [spawnState, setSpawnState] = useState<Record<string, 'idle' | 'spawning' | 'ready' | 'error'>>({})
  const [agentSessionStatus, setAgentSessionStatus] = useState<Record<string, AgentSessionStatusEntry>>({})
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>('connected')
  const [agentModelNotApplied, setAgentModelNotApplied] = useState<Record<string, boolean>>({})
  const [agentActivity, setAgentActivity] = useState<Record<string, AgentActivityEntry>>({})
  const [artifacts, setArtifacts] = useState<MissionArtifact[]>([])
  const [missionReports, setMissionReports] = useState<StoredMissionReport[]>(() => loadStoredMissionReports())
  const [artifactPreview, setArtifactPreview] = useState<MissionArtifact | null>(null)
  const [selectedReport, setSelectedReport] = useState<StoredMissionReport | null>(null)
  const [missionTokenCount, setMissionTokenCount] = useState(0)
  const [pausedByAgentId, setPausedByAgentId] = useState<Record<string, boolean>>({})
  const [team, setTeam] = useState<TeamMember[]>(() => {
    const stored = readStoredTeam()
    if (stored.length > 0) return stored
    const runtimeTeam = buildTeamFromRuntime(agents)
    if (runtimeTeam.length > 0) return runtimeTeam
    return buildTeamFromTemplate('research')
  })
  const [teamConfigs, setTeamConfigs] = useState<SavedTeamConfig[]>(() =>
    readStoredTeamConfigs(),
  )
  const [teamConfigName, setTeamConfigName] = useState('')
  const [selectedTeamConfigId, setSelectedTeamConfigId] = useState('')
  const taskBoardRef = useRef<TaskBoardRef | null>(null)
  const teamPanelFlashTimerRef = useRef<number | undefined>(undefined)
  const pendingTaskMovesRef = useRef<Array<{ taskIds: Array<string>; status: TaskStatus }>>([])
  const sessionActivityRef = useRef<Map<string, string>>(new Map())
  const dispatchingRef = useRef(false)
  const artifactDedupRef = useRef<Set<string>>(new Set())
  const agentOutputLinesRef = useRef<Record<string, string[]>>({})
  const missionCompletionSnapshotRef = useRef<MissionReportPayload | null>(null)
  const prevMissionStateRef = useRef<'running' | 'paused' | 'stopped'>('stopped')
  const lastReportedMissionIdRef = useRef<string>('')
  // Mission ID for checkpointing
  const missionIdRef = useRef<string>('')
  const missionStartedAtRef = useRef<number>(0)
  // SSE streams for active agents (capped at MAX_AGENT_STREAMS)
  const agentStreamsRef = useRef<Map<string, EventSource>>(new Map())
  const agentStreamLastAtRef = useRef<Map<string, number>>(new Map())
  // Stable ref for team so feed-event callback always sees latest team
  const teamRef = useRef(team)
  // Stable refs for keyboard shortcut handler
  const missionGoalRef = useRef(missionGoal)
  const pendingMissionNameRef = useRef('')
  const pendingMissionBudgetLimitRef = useRef('')
  const missionActiveRef = useRef(missionActive)
  const handleCreateMissionRef = useRef<() => void>(() => {})
  // Stable ref for live feed visibility (used in feed-count effect)
  const liveFeedVisibleRef = useRef(liveFeedVisible)

  teamRef.current = team
  missionGoalRef.current = missionGoal
  missionActiveRef.current = missionActive
  liveFeedVisibleRef.current = liveFeedVisible

  const appendArtifacts = useCallback((nextArtifacts: MissionArtifact[]) => {
    if (nextArtifacts.length === 0) return
    setArtifacts((previous) => {
      const additions: MissionArtifact[] = []
      nextArtifacts.forEach((artifact) => {
        const signature = [
          artifact.agentId,
          artifact.title.toLowerCase(),
          artifact.type,
          artifact.content.trim(),
        ].join('|')
        if (artifactDedupRef.current.has(signature)) return
        artifactDedupRef.current.add(signature)
        additions.push(artifact)
      })
      if (additions.length === 0) return previous
      return [...previous, ...additions].sort((a, b) => b.timestamp - a.timestamp)
    })
  }, [])

  const captureAgentOutput = useCallback((agentId: string, text: string) => {
    const member = teamRef.current.find((entry) => entry.id === agentId)
    if (!member) return
    const cleaned = text.trim()
    if (!cleaned) return

    const nextLines = cleaned
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-6)

    if (nextLines.length > 0) {
      const current = agentOutputLinesRef.current[agentId] ?? []
      agentOutputLinesRef.current[agentId] = [...current, ...nextLines].slice(-8)
    }

    appendArtifacts(
      extractArtifactsFromOutput({
        agentId,
        agentName: member.name,
        text: cleaned,
        timestamp: Date.now(),
      }),
    )
  }, [appendArtifacts])

  const buildMissionCompletionSnapshot = useCallback((): MissionReportPayload | null => {
    const missionId = missionIdRef.current
    if (!missionId) return null
    const goal = activeMissionGoal || missionGoal || 'Untitled mission'
    const name = activeMissionName.trim() || undefined
    const startedAt = missionStartedAtRef.current || Date.now()
    const completedAt = Date.now()
    const teamSnapshot = teamRef.current.map((member) => ({ ...member }))
    const tasksSnapshot = (missionTasks.length > 0 ? missionTasks : boardTasks).map((task) => ({ ...task }))
    const artifactsSnapshot = artifacts.map((artifact) => ({ ...artifact }))
    const agentSummaries: MissionAgentSummary[] = teamSnapshot.map((member) => ({
      agentId: member.id,
      agentName: member.name,
      modelId: member.modelId,
      lines: (agentOutputLinesRef.current[member.id] ?? []).slice(-4),
    }))
    const resolvedTemplate = resolveActiveTemplate(teamSnapshot)
    const teamName = resolvedTemplate ? TEMPLATE_DISPLAY_NAMES[resolvedTemplate] : `Custom Team (${teamSnapshot.length})`

    return {
      missionId,
      name,
      goal,
      teamName,
      startedAt,
      completedAt,
      team: teamSnapshot,
      tasks: tasksSnapshot,
      artifacts: artifactsSnapshot,
      tokenCount: missionTokenCount,
      agentSummaries,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMissionGoal, activeMissionName, artifacts, boardTasks, missionGoal, missionTasks, missionTokenCount])

  const stopMissionAndCleanup = useCallback((reason: 'aborted' | 'completed' = 'aborted') => {
    missionCompletionSnapshotRef.current = buildMissionCompletionSnapshot()

    const currentCp = loadMissionCheckpoint()
    if (currentCp) {
      archiveMissionToHistory({ ...currentCp, status: reason })
      clearMissionCheckpoint()
    }

    Object.values(agentSessionMap).forEach((sessionKey) => {
      fetch('/api/chat-abort', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey }),
      }).catch(() => {})
      fetch(`/api/sessions?sessionKey=${encodeURIComponent(sessionKey)}`, {
        method: 'DELETE',
      }).catch(() => {})
    })

    setAgentSessionMap({})
    setSpawnState({})
    setAgentSessionStatus({})
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('clawsuite:hub-agent-sessions')
    }
    setMissionState('stopped')
    setMissionActive(false)
    setActiveMissionName('')
    setActiveMissionGoal('')
    setMissionTasks([])
    setDispatchedTaskIdsByAgent({})
    setPausedByAgentId({})
    setSelectedOutputAgentId(undefined)
    setActiveTab('missions')
    dispatchingRef.current = false
    pendingTaskMovesRef.current = []
    sessionActivityRef.current = new Map()
    taskBoardRef.current = null
    missionIdRef.current = ''
  }, [agentSessionMap, buildMissionCompletionSnapshot])

  // Derived: which agents have spawn errors
  const spawnErrorNames = useMemo(
    () =>
      team
        .filter((m) => spawnState[m.id] === 'error')
        .map((m) => m.name),
    [team, spawnState],
  )

  // Derived gateway banner status (spawning takes precedence if any agent is spawning)
  const isAnySpawning = useMemo(
    () => Object.values(spawnState).some((s) => s === 'spawning'),
    [spawnState],
  )
  const effectiveGatewayStatus: GatewayStatus = isAnySpawning ? 'spawning' : gatewayStatus

  // Live template suggestion based on current mission goal input
  const suggestedTemplateName = useMemo(() => {
    const trimmed = missionGoal.trim()
    if (!trimmed) return null
    const templateId = suggestTemplate(trimmed)
    return TEMPLATE_DISPLAY_NAMES[templateId]
  }, [missionGoal])

  const wizardStep = WIZARD_STEP_ORDER[wizardStepIndex] ?? 'gateway'

  const modelsQuery = useQuery({
    queryKey: ['gateway-models'],
    queryFn: async (): Promise<GatewayModelsResponse> => {
      const response = await fetch('/api/models')
      if (!response.ok) {
        throw new Error(`Failed to load models (${response.status})`)
      }
      return (await response.json()) as GatewayModelsResponse
    },
    staleTime: 30_000,
    retry: 1,
  })

  const gatewayModels = useMemo(() => {
    const rows = Array.isArray(modelsQuery.data?.models) ? modelsQuery.data.models : []
    const seen = new Set<string>()
    return rows
      .map((entry) => {
        const provider = typeof entry.provider === 'string' ? entry.provider.trim() : ''
        const id = typeof entry.id === 'string' ? entry.id.trim() : ''
        const name = typeof entry.name === 'string' ? entry.name.trim() : ''
        if (!provider || !id) return null
        const value = `${provider}/${id}`
        if (seen.has(value)) return null
        seen.add(value)
        return {
          value,
          provider,
          label: name || id,
        }
      })
      .filter((entry): entry is { value: string; provider: string; label: string } => Boolean(entry))
  }, [modelsQuery.data?.models])

  const gatewayModelLabelById = useMemo(
    () =>
      new Map(
        gatewayModels.map((model) => [model.value, { label: model.label, provider: model.provider }] as const),
      ),
    [gatewayModels],
  )

  const addProviderAvailableModels = useMemo(() => {
    const provider = addProviderName.trim().toLowerCase()
    if (!provider) return []
    return gatewayModels.filter(
      (model) => model.provider.trim().toLowerCase() === provider,
    )
  }, [addProviderName, gatewayModels])

  useEffect(() => {
    if (!selectedModel) return
    const isStillAvailable = addProviderAvailableModels.some((model) => model.value === selectedModel)
    if (!isStillAvailable) {
      setSelectedModel('')
    }
  }, [addProviderAvailableModels, selectedModel])

  const refreshGatewayStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/gateway/status')
      const payload = (await res.json().catch(() => ({}))) as {
        connected?: boolean
      }
      const connected = res.ok && payload.connected !== false
      setGatewayStatus(connected ? 'connected' : 'disconnected')
      return connected
    } catch {
      setGatewayStatus('disconnected')
      return false
    }
  }, [])

  const refreshConfiguredProviders = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/models')
      if (!response.ok) {
        setConfiguredProviders([])
        return
      }
      const payload = (await response.json()) as {
        configuredProviders?: unknown
      }
      const providers = Array.isArray(payload.configuredProviders)
        ? payload.configuredProviders.filter(
            (provider): provider is string =>
              typeof provider === 'string' && provider.trim().length > 0,
          )
        : []
      setConfiguredProviders(providers)
    } catch {
      setConfiguredProviders([])
    }
  }, [])

  const handleAddProvider = useCallback(async () => {
    const provider = addProviderName.trim()
    const apiKey = addProviderApiKey.trim()
    const defaultModel = selectedModel.trim()

    if (!provider) {
      toast('Provider name is required', { type: 'error' })
      return
    }
    if (!apiKey) {
      toast('API key is required', { type: 'error' })
      return
    }

    setIsAddingProvider(true)
    try {
      const response = await fetch('/api/gateway-config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'add-provider',
          provider,
          apiKey,
          defaultModel: defaultModel || undefined,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        error?: unknown
      }
      if (!response.ok || payload.ok === false) {
        throw new Error(
          typeof payload.error === 'string' && payload.error
            ? payload.error
            : `Failed to add provider (${response.status})`,
        )
      }

      setAddProviderApiKey('')
      setAddProviderName('')
      setAddProviderSelection('')
      setSelectedModel('')
      await refreshConfiguredProviders()
      void modelsQuery.refetch()
      toast(`Provider "${provider}" added`, { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to add provider', {
        type: 'error',
      })
    } finally {
      setIsAddingProvider(false)
    }
  }, [addProviderApiKey, addProviderName, modelsQuery, refreshConfiguredProviders, selectedModel])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(team))
  }, [team])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      TEAM_CONFIGS_STORAGE_KEY,
      JSON.stringify(teamConfigs),
    )
  }, [teamConfigs])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const combined: Record<string, AgentSessionInfo> = {}
    for (const [id, sessionKey] of Object.entries(agentSessionMap)) {
      const model = agentSessionModelMap[id]
      combined[id] = model ? { sessionKey, model } : { sessionKey }
    }
    window.localStorage.setItem('clawsuite:hub-agent-sessions', JSON.stringify(combined))
  }, [agentSessionMap, agentSessionModelMap])

  useEffect(() => {
    if (team.length > 0) return
    const runtimeTeam = buildTeamFromRuntime(agents)
    if (runtimeTeam.length > 0) {
      setTeam(runtimeTeam)
      return
    }
    setTeam(buildTeamFromTemplate('research'))
  }, [agents, team.length])

  useEffect(() => {
    if (!selectedAgentId) return
    const exists = team.some((member) => member.id === selectedAgentId)
    if (!exists) setSelectedAgentId(undefined)
  }, [selectedAgentId, team])

  useEffect(() => {
    if (!selectedOutputAgentId) return
    const exists = team.some((member) => member.id === selectedOutputAgentId)
    if (!exists) setSelectedOutputAgentId(undefined)
  }, [selectedOutputAgentId, team])

  useEffect(() => {
    setPausedByAgentId((previous) => {
      const validAgentIds = new Set(Object.keys(agentSessionMap))
      const next: Record<string, boolean> = {}
      for (const [agentId, paused] of Object.entries(previous)) {
        if (paused && validAgentIds.has(agentId)) {
          next[agentId] = true
        }
      }
      if (Object.keys(next).length === Object.keys(previous).length) {
        return previous
      }
      return next
    })
  }, [agentSessionMap])

  useEffect(
    () => () => {
      if (teamPanelFlashTimerRef.current !== undefined) {
        window.clearTimeout(teamPanelFlashTimerRef.current)
      }
    },
    [],
  )

  // Mobile viewport detection
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobileHub(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // Gateway status polling every 15s
  useEffect(() => {
    async function checkGateway() {
      const connected = await refreshGatewayStatus()
      if (connected) {
        void refreshConfiguredProviders()
      } else {
        setConfiguredProviders([])
      }
    }
    void checkGateway()
    const interval = window.setInterval(() => {
      void checkGateway()
    }, 15_000)
    return () => window.clearInterval(interval)
  }, [refreshConfiguredProviders, refreshGatewayStatus])

  // Avatar picker: close on outside click
  useEffect(() => {
    if (!avatarPickerOpenId) return
    function onDown(e: MouseEvent) {
      const target = e.target as Element
      if (!target.closest('[data-avatar-picker]')) {
        setAvatarPickerOpenId(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [avatarPickerOpenId])

  // Gateway approvals polling every 8s — merge into local approval state
  useEffect(() => {
    let cancelled = false
    const seenGatewayIds = new Set<string>()

    async function pollGatewayApprovals() {
      try {
        const response = await fetchGatewayApprovals()
        if (cancelled) return
        const raw = response.approvals ?? response.pending ?? []
        if (raw.length === 0) return

        setApprovals((current) => {
          const existingGatewayIds = new Set(
            current.filter(a => a.source === 'gateway').map(a => a.gatewayApprovalId).filter(Boolean)
          )
          const toAdd = raw.filter(entry => {
            if (!entry.id) return false
            if (existingGatewayIds.has(entry.id)) return false
            if (seenGatewayIds.has(entry.id)) return false
            if ((entry.status ?? 'pending') !== 'pending') return false
            return true
          })
          if (toAdd.length === 0) return current

          const newApprovals = toAdd.map(entry => {
            seenGatewayIds.add(entry.id)
            const action = entry.action ?? entry.tool ?? 'Gateway action requires approval'
            return {
              id: `gw-${entry.id}`,
              agentId: entry.sessionKey ?? 'gateway',
              agentName: entry.agentName ?? entry.sessionKey ?? 'Gateway',
              action: typeof action === 'string' ? action : JSON.stringify(action),
              context: entry.context ?? (entry.input ? JSON.stringify(entry.input, null, 2) : ''),
              requestedAt: entry.requestedAt ?? Date.now(),
              status: 'pending' as const,
              source: 'gateway' as const,
              gatewayApprovalId: entry.id,
            }
          })

          const merged = [...newApprovals, ...current]
          saveApprovals(merged)
          return merged
        })
      } catch {
        // gateway may not have approvals endpoint — silently skip
      }
    }

    void pollGatewayApprovals()
    const interval = window.setInterval(() => void pollGatewayApprovals(), 8_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // stable — uses setApprovals (setter is stable)

  useEffect(() => {
    if (!wizardOpen || wizardStep !== 'gateway') return
    let cancelled = false
    setWizardCheckingGateway(true)
    void (async () => {
      const connected = await refreshGatewayStatus()
      if (!cancelled) {
        if (connected) {
          await refreshConfiguredProviders()
        } else {
          setConfiguredProviders([])
        }
      }
      if (!cancelled) {
        setWizardCheckingGateway(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    refreshConfiguredProviders,
    refreshGatewayStatus,
    wizardOpen,
    wizardStep,
  ])

  // ── Unread feed count ───────────────────────────────────────────────────────
  // Increment when feed is hidden and a new event arrives; reset when feed opens
  useEffect(() => {
    const unsubscribe = onFeedEvent(() => {
      if (!liveFeedVisibleRef.current) {
        setUnreadFeedCount((prev) => prev + 1)
      }
    })
    return unsubscribe
  }, []) // uses liveFeedVisibleRef — stable

  // Reset unread count when feed becomes visible
  useEffect(() => {
    if (liveFeedVisible) {
      setUnreadFeedCount(0)
    }
  }, [liveFeedVisible])

  // ── Feed event → agentActivity + approval parsing ─────────────────────────
  // Update last-line activity from feed events (agent_active, agent_spawned, etc.)
  // Also parse APPROVAL_REQUIRED: markers from assistant messages.
  useEffect(() => {
    const unsubscribe = onFeedEvent((event) => {
      if (!event.agentName) return
      const currentTeam = teamRef.current
      const member = currentTeam.find((m) => m.name === event.agentName)
      if (!member) return
      if (
        event.type === 'agent_active' ||
        event.type === 'agent_spawned' ||
        event.type === 'task_assigned'
      ) {
        setAgentActivity((prev) => ({
          ...prev,
          [member.id]: {
            ...prev[member.id],
            lastLine: event.message,
            lastAt: event.timestamp,
            lastEventType: 'system',
          },
        }))
      }

      // Parse APPROVAL_REQUIRED from assistant messages
      const content = event.message ?? ''
      if (content.includes('APPROVAL_REQUIRED:')) {
        const agentId = member.id
        const agentName = member.name
        const action = content.split('APPROVAL_REQUIRED:')[1]?.split('\n')[0]?.trim() ?? content
        addApproval({ agentId, agentName, action, context: content })
        setApprovals(loadApprovals())
      }
    })
    return unsubscribe
  }, []) // uses teamRef — stable

  // ── SSE streams for active agents ─────────────────────────────────────────
  // Open SSE streams for up to 3 simultaneously-active agents; close stale ones.
  const MAX_AGENT_STREAMS = 3
  useEffect(() => {
    const streams = agentStreamsRef.current
    const lastAtMap = agentStreamLastAtRef.current
    const currentTeam = teamRef.current

    // Determine which agents are active and have sessions (capped at MAX_AGENT_STREAMS)
    const activeAgentIds = currentTeam
      .filter((m) => {
        const status = agentSessionStatus[m.id]
        return status && status.status === 'active' && agentSessionMap[m.id]
      })
      .slice(0, MAX_AGENT_STREAMS)
      .map((m) => m.id)

    const activeSessionKeys = new Set(
      activeAgentIds.map((id) => agentSessionMap[id]).filter(Boolean),
    )

    // Close streams for agents no longer active
    for (const [sessionKey, source] of streams) {
      if (!activeSessionKeys.has(sessionKey)) {
        source.close()
        streams.delete(sessionKey)
        lastAtMap.delete(sessionKey)
      }
    }

    // Open new streams for newly-active agents
    for (const agentId of activeAgentIds) {
      const sessionKey = agentSessionMap[agentId]
      if (!sessionKey || streams.has(sessionKey)) continue
      if (streams.size >= MAX_AGENT_STREAMS) break

      const source = new EventSource(
        `/api/chat-events?sessionKey=${encodeURIComponent(sessionKey)}`,
      )
      streams.set(sessionKey, source)
      lastAtMap.set(sessionKey, Date.now())

      const markStreamAlive = () => {
        lastAtMap.set(sessionKey, Date.now())
      }

      const handleUpdate = (text: string, type: AgentActivityEntry['lastEventType']) => {
        if (!text) return
        markStreamAlive()
        setAgentActivity((prev) => ({
          ...prev,
          [agentId]: {
            lastLine: text,
            lastAt: Date.now(),
            lastEventType: type,
          },
        }))
      }

      source.addEventListener('chunk', (event) => {
        if (!(event instanceof MessageEvent)) return
        markStreamAlive()
        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>
          const text = String(data.text ?? data.content ?? data.chunk ?? '').trim()
          if (text && data.fullReplace !== true) {
            setMissionTokenCount((current) => current + Math.ceil(text.length / 4))
          }
          handleUpdate(text, 'assistant')
          if (text.includes('APPROVAL_REQUIRED:')) {
            const member = currentTeam.find((m) => m.id === agentId)
            if (member) {
              const action =
                text.split('APPROVAL_REQUIRED:')[1]?.split('\n')[0]?.trim() ?? text
              addApproval({
                agentId: member.id,
                agentName: member.name,
                action,
                context: text,
              })
              setApprovals(loadApprovals())
            }
          }
        } catch { /* ignore parse errors */ }
      })

      source.addEventListener('tool', (event) => {
        if (!(event instanceof MessageEvent)) return
        markStreamAlive()
        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>
          const name = String(data.name ?? 'tool')
          handleUpdate(`${name}()`, 'tool')
        } catch { /* ignore parse errors */ }
      })

      source.addEventListener('message', () => {
        markStreamAlive()
      })

      source.addEventListener('message', (event) => {
        if (!(event instanceof MessageEvent)) return
        markStreamAlive()
        const payload = parseSsePayload(event.data as string)
        if (!payload) return
        const role = readEventRole(payload)
        if (role !== 'assistant') return
        const text = readEventText(payload)
        if (!text) return
        captureAgentOutput(agentId, text)
      })
      source.addEventListener('done', () => {
        markStreamAlive()
      })
      source.addEventListener('open', () => {
        markStreamAlive()
      })
      source.addEventListener('error', () => {
        markStreamAlive()
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSessionStatus, agentSessionMap, captureAgentOutput]) // intentionally omit teamRef (stable ref)

  // Stale SSE stream pruner (60s inactivity → close) + unmount cleanup
  useEffect(() => {
    const interval = window.setInterval(() => {
      const streams = agentStreamsRef.current
      const lastAtMap = agentStreamLastAtRef.current
      const now = Date.now()
      for (const [sessionKey, source] of streams) {
        const lastAt = lastAtMap.get(sessionKey) ?? 0
        if (now - lastAt > 60_000) {
          source.close()
          streams.delete(sessionKey)
          lastAtMap.delete(sessionKey)
        }
      }
    }, 10_000)

    return () => {
      window.clearInterval(interval)
      // Close all streams on unmount
      for (const source of agentStreamsRef.current.values()) {
        source.close()
      }
      agentStreamsRef.current.clear()
      agentStreamLastAtRef.current.clear()
    }
  }, [])

  // Keyboard shortcuts (desktop only): Cmd/Ctrl+Enter → Start Mission; Space → pause/resume mission; Escape → close panel / deselect
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
      const modKey = isMac ? event.metaKey : event.ctrlKey
      const target = event.target instanceof Element ? event.target : null
      const tagName = target?.tagName ?? ''
      const isTypingTarget =
        !!target?.closest('button, select, a, [role=button], input, textarea, [contenteditable]')

      // Cmd/Ctrl+Enter: Start Mission when textarea is focused and has content
      if (modKey && event.key === 'Enter') {
        if (tagName === 'TEXTAREA' && missionGoalRef.current.trim()) {
          event.preventDefault()
          handleCreateMissionRef.current()
        }
        return
      }

      if (
        event.code === 'Space' &&
        !event.repeat &&
        !event.altKey &&
        !event.shiftKey &&
        !modKey
      ) {
        if (isTypingTarget) return
        if (!missionActiveRef.current) return
        event.preventDefault()
        setMissionState((prev) => (prev === 'paused' ? 'running' : 'paused'))
        return
      }

      // Escape: Close output panel → deselect agent
      if (event.key === 'Escape') {
        // Don't interfere when user is typing in an input/textarea
        if (isTypingTarget) return
        setSelectedOutputAgentId((prev) => {
          if (prev) return undefined
          setSelectedAgentId(undefined)
          return undefined
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []) // uses refs — stable, no deps needed

  const runtimeById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [
    agents,
  ])

  const teamWithRuntimeStatus = useMemo(
    () =>
      team.map((member) => {
        const runtimeAgent = runtimeById.get(member.id)
        if (!runtimeAgent) return member
        return {
          ...member,
          status: runtimeAgent.status || member.status,
        }
      }),
    [runtimeById, team],
  )

  const _boardAgents = useMemo(
    () => teamWithRuntimeStatus.map((member) => ({ id: member.id, name: member.name })),
    [teamWithRuntimeStatus],
  )
  const activeTaskSource = useMemo(
    () => (missionActive && missionTasks.length > 0 ? missionTasks : boardTasks),
    [boardTasks, missionActive, missionTasks],
  )
  const agentTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    activeTaskSource.forEach((task) => {
      if (!task.agentId) return
      counts[task.agentId] = (counts[task.agentId] ?? 0) + 1
    })
    return counts
  }, [activeTaskSource])
  const activeTemplateId = useMemo(() => resolveActiveTemplate(team), [team])
  const _missionBadge = useMemo(() => {
    if (missionState === 'paused') {
      return {
        label: 'Paused',
        className: 'bg-amber-500 text-white',
      }
    }
    if (missionState === 'stopped') {
      return {
        label: 'Stopped',
        className: 'bg-red-500 text-white',
      }
    }
    return {
      label: 'Running',
      className: 'bg-emerald-500 text-white',
    }
  }, [missionState])
  const teamById = useMemo(
    () => new Map(teamWithRuntimeStatus.map((member) => [member.id, member])),
    [teamWithRuntimeStatus],
  )
  const selectedOutputTasks = useMemo(() => {
    if (!selectedOutputAgentId) return []
    const taskSource = boardTasks.length > 0 ? boardTasks : missionTasks
    const dispatchedTaskIds = dispatchedTaskIdsByAgent[selectedOutputAgentId]
    if (!dispatchedTaskIds || dispatchedTaskIds.length === 0) {
      return taskSource.filter((task) => task.agentId === selectedOutputAgentId)
    }

    const dispatchedSet = new Set(dispatchedTaskIds)
    return taskSource.filter(
      (task) => task.agentId === selectedOutputAgentId && dispatchedSet.has(task.id),
    )
  }, [boardTasks, dispatchedTaskIdsByAgent, missionTasks, selectedOutputAgentId])
  const selectedOutputAgentName = selectedOutputAgentId
    ? teamById.get(selectedOutputAgentId)?.name ?? selectedOutputAgentId
    : ''
  const selectedOutputModelId = selectedOutputAgentId
    ? teamById.get(selectedOutputAgentId)?.modelId
    : undefined

  // Build AgentWorkingRow array for AgentsWorkingPanel
  const agentWorkingRows = useMemo((): AgentWorkingRow[] => {
    return teamWithRuntimeStatus.map((member) => {
      const sessionStatus = agentSessionStatus[member.id]
      const spawnStatus = spawnState[member.id]
      const sessionKey = agentSessionMap[member.id]
      const hasSession = Boolean(sessionKey)
      const activity = agentActivity[member.id]
      const isPaused = pausedByAgentId[member.id] === true

      // Resolve working status
      let status: AgentWorkingStatus
      if (spawnStatus === 'spawning') {
        status = 'spawning'
      } else if (isPaused) {
        status = 'paused'
      } else if (!hasSession) {
        status = spawnStatus === 'error' ? 'error' : 'none'
      } else if (!sessionStatus) {
        status = 'ready'
      } else if (sessionStatus.status === 'error') {
        status = 'error'
      } else if (sessionStatus.status === 'active') {
        status = 'active'
      } else {
        status = 'idle'
      }

      const inProgressTask = activeTaskSource.find(
        (t) => t.agentId === member.id && t.status === 'in_progress',
      )

      // Prefer SSE stream activity over session poll lastMessage
      const lastLine = activity?.lastLine ?? sessionStatus?.lastMessage
      const lastAt = activity?.lastAt ?? (sessionStatus?.lastSeen ?? undefined)

      return {
        id: member.id,
        name: member.name,
        modelId: member.modelId,
        roleDescription: member.roleDescription,
        status,
        lastLine,
        lastAt,
        taskCount: agentTaskCounts[member.id] ?? 0,
        currentTask: inProgressTask?.title,
        sessionKey,
      }
    })
  }, [
    teamWithRuntimeStatus,
    agentSessionStatus,
    spawnState,
    agentSessionMap,
    agentActivity,
    pausedByAgentId,
    activeTaskSource,
    agentTaskCounts,
  ])
  const selectedOutputStatusLabel = useMemo(() => {
    if (!selectedOutputAgentId) return undefined
    const row = agentWorkingRows.find((entry) => entry.id === selectedOutputAgentId)
    return row ? toTitleCase(row.status) : undefined
  }, [agentWorkingRows, selectedOutputAgentId])

  const moveTasksToStatus = useCallback((taskIds: Array<string>, status: TaskStatus) => {
    if (taskIds.length === 0) return
    const uniqueTaskIds = Array.from(new Set(taskIds))
    const ids = new Set(uniqueTaskIds)

    setMissionTasks((previous) => {
      const updated = previous.map((task) => {
        if (!ids.has(task.id) || task.status === status) return task
        return { ...task, status, updatedAt: Date.now() }
      })

      // Save checkpoint with updated task statuses
      const currentCp = loadMissionCheckpoint()
      if (currentCp) {
        saveMissionCheckpoint({
          ...currentCp,
          tasks: updated.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            assignedTo: t.agentId,
          })),
        })
      }

      return updated
    })

    const boardApi = taskBoardRef.current
    if (boardApi) {
      boardApi.moveTasks(uniqueTaskIds, status)
      return
    }

    pendingTaskMovesRef.current.push({ taskIds: uniqueTaskIds, status })
  }, [])

  const _handleTaskBoardRef = useCallback((api: TaskBoardRef) => {
    taskBoardRef.current = api
    if (pendingTaskMovesRef.current.length === 0) return
    pendingTaskMovesRef.current.forEach((entry) => {
      api.moveTasks(entry.taskIds, entry.status)
    })
    pendingTaskMovesRef.current = []
  }, [])

  const handleAgentSelection = useCallback((agentId?: string) => {
    setSelectedAgentId(agentId)
    setSelectedOutputAgentId(agentId)
  }, [])

  const spawnAgentSession = useCallback(async (member: TeamMember): Promise<string> => {
    const suffix = Math.random().toString(36).slice(2, 8)
    const baseName = member.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const friendlyId = `hub-${baseName}-${suffix}`
    const label = `Mission: ${member.name}`

    // Check if a session with this label already exists — reuse it instead of
    // trying to create a duplicate (gateway enforces unique labels).
    try {
      const listResp = await fetch('/api/sessions')
      if (listResp.ok) {
        const listData = (await listResp.json()) as { sessions?: Array<Record<string, unknown>> }
        const existing = (listData.sessions ?? []).find(
          (s) => typeof s.label === 'string' && s.label === label,
        )
        if (existing) {
          const existingKey = readString(existing.key)
          if (existingKey) return existingKey
        }
      }
    } catch {
      // If the lookup fails, fall through to normal spawn
    }

    const modelString = resolveGatewayModelId(member.modelId)
    const requestBody: Record<string, string> = { friendlyId, label }
    if (modelString) requestBody.model = modelString

    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
      throw new Error(
        readString(payload.error) || readString(payload.message) || `Spawn failed: HTTP ${response.status}`,
      )
    }

    const data = (await response.json()) as Record<string, unknown>
    const sessionKey = readString(data.sessionKey)
    if (!sessionKey) throw new Error('No sessionKey in spawn response')

    // Track whether the gateway actually applied the requested model
    const modelApplied = data.modelApplied !== false
    if (modelString && !modelApplied) {
      setAgentModelNotApplied((prev) => ({ ...prev, [member.id]: true }))
    } else {
      setAgentModelNotApplied((prev) => {
        if (!prev[member.id]) return prev
        const next = { ...prev }
        delete next[member.id]
        return next
      })
    }

    return sessionKey
  }, [])

  const handleRetrySpawn = useCallback(async (member: TeamMember): Promise<void> => {
    setSpawnState((prev) => ({ ...prev, [member.id]: 'spawning' }))
    try {
      const sessionKey = await spawnAgentSession(member)
      setAgentSessionMap((prev) => ({ ...prev, [member.id]: sessionKey }))
      setPausedByAgentId((prev) => {
        if (!prev[member.id]) return prev
        const next = { ...prev }
        delete next[member.id]
        return next
      })
      // Track model used at spawn time
      const modelString = resolveGatewayModelId(member.modelId)
      if (modelString) {
        setAgentSessionModelMap((prev) => ({ ...prev, [member.id]: modelString }))
      }
      setSpawnState((prev) => ({ ...prev, [member.id]: 'ready' }))
      setAgentSessionStatus((prev) => ({
        ...prev,
        [member.id]: { status: 'idle', lastSeen: Date.now() },
      }))
      const modelLabel = getModelDisplayLabelFromLookup(member.modelId, gatewayModelLabelById)
      const modelSuffix = member.modelId !== 'auto' ? ` (${modelLabel})` : ''
      emitFeedEvent({
        type: 'agent_spawned',
        message: `${member.name} session re-created${modelSuffix}`,
        agentName: member.name,
      })
    } catch (err) {
      setSpawnState((prev) => ({ ...prev, [member.id]: 'error' }))
      emitFeedEvent({
        type: 'system',
        message: `Failed to re-spawn ${member.name}: ${err instanceof Error ? err.message : String(err)}`,
        agentName: member.name,
      })
    }
  }, [gatewayModelLabelById, spawnAgentSession])

  // Kill session for an agent
  const handleKillSession = useCallback(async (member: TeamMember) => {
    const sessionKey = agentSessionMap[member.id]
    if (sessionKey) {
      try {
        await fetch(`/api/sessions?sessionKey=${encodeURIComponent(sessionKey)}`, {
          method: 'DELETE',
        })
      } catch {
        // best-effort
      }
    }
    setAgentSessionMap((prev) => {
      const next = { ...prev }
      delete next[member.id]
      return next
    })
    setSpawnState((prev) => ({ ...prev, [member.id]: 'idle' }))
    setAgentSessionStatus((prev) => {
      const next = { ...prev }
      delete next[member.id]
      return next
    })
    setAgentModelNotApplied((prev) => {
      if (!prev[member.id]) return prev
      const next = { ...prev }
      delete next[member.id]
      return next
    })
    setAgentSessionModelMap((prev) => {
      if (!prev[member.id]) return prev
      const next = { ...prev }
      delete next[member.id]
      return next
    })
    setAgentActivity((prev) => {
      if (!prev[member.id]) return prev
      const next = { ...prev }
      delete next[member.id]
      return next
    })
    setPausedByAgentId((prev) => {
      if (!prev[member.id]) return prev
      const next = { ...prev }
      delete next[member.id]
      return next
    })
    emitFeedEvent({
      type: 'agent_killed',
      message: `${member.name} session killed`,
      agentName: member.name,
    })
  }, [agentSessionMap])

  const _handleSetAgentPaused = useCallback(
    async (agentId: string, pause: boolean) => {
      const sessionKey = agentSessionMap[agentId]
      if (!sessionKey) {
        toast('No active session to control', { type: 'error' })
        return
      }

      const member = team.find((entry) => entry.id === agentId)
      const agentName = member?.name ?? agentId
      const previousPaused = pausedByAgentId[agentId] ?? false

      setPausedByAgentId((prev) => ({ ...prev, [agentId]: pause }))

      try {
        await toggleAgentPause(sessionKey, pause)
        emitFeedEvent({
          type: pause ? 'agent_paused' : 'agent_active',
          message: `${agentName} ${pause ? 'paused' : 'resumed'}`,
          agentName,
        })
        toast(`${agentName} ${pause ? 'paused' : 'resumed'}`, {
          type: 'success',
        })
      } catch (error) {
        setPausedByAgentId((prev) => ({ ...prev, [agentId]: previousPaused }))
        toast(
          error instanceof Error
            ? error.message
            : `Failed to ${pause ? 'pause' : 'resume'} ${agentName}`,
          { type: 'error' },
        )
      }
    },
    [agentSessionMap, pausedByAgentId, team],
  )

  const _handleSteerAgent = useCallback(
    async (agentId: string, message: string) => {
      const sessionKey = agentSessionMap[agentId]
      if (!sessionKey) {
        toast('No active session to steer', { type: 'error' })
        return
      }

      const directive = message.trim()
      if (!directive) return

      const member = team.find((entry) => entry.id === agentId)
      const agentName = member?.name ?? agentId

      try {
        await steerAgent(sessionKey, directive)
        emitFeedEvent({
          type: 'system',
          message: `Directive sent to ${agentName}: ${truncateMissionGoal(directive, 80)}`,
          agentName,
        })
        toast(`Directive sent to ${agentName}`, { type: 'success' })
      } catch (error) {
        toast(
          error instanceof Error
            ? error.message
            : `Failed to send directive to ${agentName}`,
          { type: 'error' },
        )
      }
    },
    [agentSessionMap, team],
  )

  // ── Approval handlers ──────────────────────────────────────────────────────
  const handleApprove = useCallback((id: string) => {
    const approval = approvals.find(a => a.id === id)
    if (!approval) return

    // Gateway approval — resolve via gateway API
    if (approval.source === 'gateway' && approval.gatewayApprovalId) {
      void resolveGatewayApproval(approval.gatewayApprovalId, 'approve')
    }

    // Agent approval — send APPROVED message to session
    if (approval.source !== 'gateway') {
      const sessionKey = agentSessionMap[approval.agentId]
      if (sessionKey) {
        fetch('/api/sessions/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey,
            message: `[APPROVED] You may proceed with: ${approval.action}`,
          }),
        }).catch(() => { /* best-effort */ })
      }
    }

    const updated = approvals.map(a =>
      a.id === id ? { ...a, status: 'approved' as const, resolvedAt: Date.now() } : a
    )
    setApprovals(updated)
    saveApprovals(updated)
  }, [approvals, agentSessionMap])

  const handleDeny = useCallback((id: string) => {
    const approval = approvals.find(a => a.id === id)
    if (!approval) return

    // Gateway approval — resolve via gateway API
    if (approval.source === 'gateway' && approval.gatewayApprovalId) {
      void resolveGatewayApproval(approval.gatewayApprovalId, 'deny')
    }

    // Agent approval — send DENIED message to session
    if (approval.source !== 'gateway') {
      const sessionKey = agentSessionMap[approval.agentId]
      if (sessionKey) {
        fetch('/api/sessions/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey,
            message: `[DENIED] You may NOT proceed with: ${approval.action}. Please stop and await further instructions.`,
          }),
        }).catch(() => { /* best-effort */ })
      }
    }

    const updated = approvals.map(a =>
      a.id === id ? { ...a, status: 'denied' as const, resolvedAt: Date.now() } : a
    )
    setApprovals(updated)
    saveApprovals(updated)
  }, [approvals, agentSessionMap])

  const ensureAgentSessions = useCallback(async (
    teamMembers: TeamMember[],
    launchMissionId?: string,
  ): Promise<Record<string, string>> => {
    const currentMap = { ...agentSessionMap }
    const spawnPromises: Array<Promise<void>> = []
    const isStaleLaunch = () =>
      Boolean(launchMissionId) && missionIdRef.current !== launchMissionId

    for (const member of teamMembers) {
      if (isStaleLaunch()) break
      if (currentMap[member.id]) continue

      setSpawnState((prev) => ({ ...prev, [member.id]: 'spawning' }))

        spawnPromises.push(
          spawnAgentSession(member)
          .then((sessionKey) => {
            if (isStaleLaunch()) return
            currentMap[member.id] = sessionKey
            setSpawnState((prev) => ({ ...prev, [member.id]: 'ready' }))
            // Track model used at spawn time
            const modelString = resolveGatewayModelId(member.modelId)
            if (modelString) {
              setAgentSessionModelMap((prev) => ({ ...prev, [member.id]: modelString }))
            }
            const modelLabel = getModelDisplayLabelFromLookup(member.modelId, gatewayModelLabelById)
            const modelSuffix = member.modelId !== 'auto' ? ` (${modelLabel})` : ''
            emitFeedEvent({
              type: 'agent_spawned',
              message: `spawned ${member.name}${modelSuffix}`,
              agentName: member.name,
            })
          })
          .catch((err: unknown) => {
            if (isStaleLaunch()) return
            setSpawnState((prev) => ({ ...prev, [member.id]: 'error' }))
            emitFeedEvent({
              type: 'system',
              message: `Failed to spawn ${member.name}: ${err instanceof Error ? err.message : String(err)}`,
              agentName: member.name,
            })
          }),
      )
    }

    await Promise.allSettled(spawnPromises)
    if (isStaleLaunch()) return currentMap
    setAgentSessionMap(currentMap)
    return currentMap
  }, [agentSessionMap, gatewayModelLabelById, spawnAgentSession])

  const executeMission = useCallback(async (
    tasks: Array<HubTask>,
    teamMembers: Array<TeamMember>,
    missionGoalValue: string,
    mode: 'sequential' | 'hierarchical' | 'parallel' = 'parallel',
    launchMissionId?: string,
  ) => {
    const isStaleLaunch = () =>
      Boolean(launchMissionId) && missionIdRef.current !== launchMissionId

    if (isStaleLaunch()) return
    // STEP A: Ensure all agents have isolated gateway sessions
    const sessionMap = await ensureAgentSessions(teamMembers, launchMissionId)
    if (isStaleLaunch()) return

    // STEP B: Group tasks by agent
    const tasksByAgent = new Map<string, Array<HubTask>>()
    for (const task of tasks) {
      if (!task.agentId) continue
      const existing = tasksByAgent.get(task.agentId) || []
      existing.push(task)
      tasksByAgent.set(task.agentId, existing)
    }

    // Helper: build agent context prefix for dispatch messages
    function buildAgentContext(member: TeamMember): string {
      const parts = [
        member.roleDescription && `Role: ${member.roleDescription}`,
        member.goal && `Your goal: ${member.goal}`,
        member.backstory && `Background: ${member.backstory}`,
      ].filter(Boolean)
      return parts.join('\n')
    }

    // Helper: send a message to an agent session and update task state
    async function dispatchToAgent(
      agentId: string,
      agentTasks: Array<HubTask>,
      messageText: string,
    ): Promise<void> {
      const sessionKey = sessionMap[agentId]
      if (!sessionKey) {
        emitFeedEvent({
          type: 'system',
          message: `No session for agent ${agentId} — skipping dispatch`,
        })
        return
      }

      const member = teamMembers.find((entry) => entry.id === agentId)

      try {
        const response = await fetch('/api/sessions/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionKey, message: messageText }),
        })

        if (!response.ok) {
          const payload = (await response
            .json()
            .catch(() => ({}))) as Record<string, unknown>
          const errorMessage =
            readString(payload.error) || readString(payload.message) || `HTTP ${response.status}`
          throw new Error(errorMessage)
        }

        if (isStaleLaunch()) return
        const taskIds = agentTasks.map((task) => task.id)
        setDispatchedTaskIdsByAgent((previous) => ({
          ...previous,
          [agentId]: taskIds,
        }))
        moveTasksToStatus(taskIds, 'in_progress')

        agentTasks.forEach((task) => {
          emitFeedEvent({
            type: 'agent_active',
            message: `${member?.name || agentId} started working on: ${task.title}`,
            agentName: member?.name,
            taskTitle: task.title,
          })
        })
      } catch (error) {
        if (isStaleLaunch()) return
        emitFeedEvent({
          type: 'system',
          message: `Failed to dispatch to ${member?.name || agentId}: ${error instanceof Error ? error.message : String(error)}`,
        })
      }
    }

    // ── HIERARCHICAL mode ─────────────────────────────────────────────────
    if (mode === 'hierarchical') {
      const [leadMember, ...workerMembers] = teamMembers
      if (!leadMember || isStaleLaunch()) return

      const leadSessionKey = sessionMap[leadMember.id]
      if (leadSessionKey) {
        const leadContext = buildAgentContext(leadMember)
        const teamList = workerMembers.map((m) => `- ${m.name} (${m.roleDescription})`).join('\n')
        const leadBriefing = `You are the Lead Agent coordinating this mission.\n\nYour team:\n${teamList}\n\nMission Goal: ${missionGoalValue}\n\nYour job: Break down the goal into clear subtasks, delegate them to your team members by name, and synthesize the final result. Start by outlining the plan.`
        const leadMessage = [leadContext, leadBriefing].filter(Boolean).join('\n\n')

        const leadTasks = tasksByAgent.get(leadMember.id) ?? []
        const effectiveLeadTasks = leadTasks.length > 0 ? leadTasks : [{
          id: createTaskId(),
          title: `Lead: ${missionGoalValue}`,
          description: '',
          priority: 'high' as const,
          status: 'assigned' as const,
          agentId: leadMember.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }]
        await dispatchToAgent(leadMember.id, effectiveLeadTasks, leadMessage)
        if (isStaleLaunch()) return

        // Dispatch to workers with delegation prefix
        for (const worker of workerMembers) {
          if (isStaleLaunch()) return
          const workerTasks = tasksByAgent.get(worker.id)
          if (!workerTasks || workerTasks.length === 0) continue
          const workerContext = buildAgentContext(worker)
          const taskList = workerTasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n')
          const delegationPrefix = `Delegated by ${leadMember.name}:`
          const workerBody = `${delegationPrefix}\n\nMission Task Assignment for ${worker.name}:\n\n${taskList}\n\nMission Goal: ${missionGoalValue}\n\nPlease work through these tasks sequentially. Report progress on each.`
          const workerMessage = [workerContext, workerBody].filter(Boolean).join('\n\n')
          await dispatchToAgent(worker.id, workerTasks, workerMessage)
        }
      }
      return
    }

    // ── SEQUENTIAL mode ───────────────────────────────────────────────────
    if (mode === 'sequential') {
      const agentEntries = Array.from(tasksByAgent.entries())
      for (let i = 0; i < agentEntries.length; i++) {
        if (isStaleLaunch()) return
        const [agentId, agentTasks] = agentEntries[i]
        const member = teamMembers.find((entry) => entry.id === agentId)
        const agentContext = member ? buildAgentContext(member) : ''
        const taskList = agentTasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n')
        const body = `Mission Task Assignment for ${member?.name || agentId}:\n\n${taskList}\n\nMission Goal: ${missionGoalValue}\n\nPlease work through these tasks sequentially. Report progress on each.`
        const message = [agentContext, body].filter(Boolean).join('\n\n')
        await dispatchToAgent(agentId, agentTasks, message)

        // Stagger: wait 30 seconds between agents (except after the last one)
        if (i < agentEntries.length - 1) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 30_000))
          if (isStaleLaunch()) return
        }
      }
      return
    }

    // ── PARALLEL mode (default) ────────────────────────────────────────────
    for (const [agentId, agentTasks] of tasksByAgent) {
      if (isStaleLaunch()) return
      const member = teamMembers.find((entry) => entry.id === agentId)
      const agentContext = member ? buildAgentContext(member) : ''
      const taskList = agentTasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n')
      const body = `Mission Task Assignment for ${member?.name || agentId}:\n\n${taskList}\n\nMission Goal: ${missionGoalValue}\n\nPlease work through these tasks sequentially. Report progress on each.`
      const message = [agentContext, body].filter(Boolean).join('\n\n')
      await dispatchToAgent(agentId, agentTasks, message)
    }
  }, [ensureAgentSessions, moveTasksToStatus])

  useEffect(() => {
    const isMissionRunning = missionActive && missionState === 'running'

    // Reset activity markers when mission is not running
    if (!isMissionRunning) {
      sessionActivityRef.current = new Map()
    }

    const hasSessions = Object.keys(agentSessionMap).length > 0

    // Only poll when we have sessions to roster or an active mission
    if (!hasSessions && !isMissionRunning) return

    // Build reverse lookup: sessionKey → agentId
    const sessionKeyToAgentId = new Map<string, string>()
    for (const [agentId, sessionKey] of Object.entries(agentSessionMap)) {
      if (sessionKey) sessionKeyToAgentId.set(sessionKey, agentId)
    }

    let cancelled = false

    async function pollSessions() {
      try {
        const response = await fetch('/api/sessions')
        if (!response.ok || cancelled) return

        const payload = (await response
          .json()
          .catch(() => ({}))) as { sessions?: Array<SessionRecord> }
        const sessions = Array.isArray(payload.sessions) ? payload.sessions : []
        const now = Date.now()

        // ── Session Roster Tracking ───────────────────────────────────────────
        if (hasSessions) {
          const seenAgentIds = new Set<string>()

          // Compute status for each matched session
          const matchedEntries: Array<[string, AgentSessionStatusEntry]> = []
          for (const session of sessions) {
            const sessionKey = readSessionId(session)
            if (!sessionKey) continue
            const agentId = sessionKeyToAgentId.get(sessionKey)
            if (!agentId) continue

            seenAgentIds.add(agentId)

            const updatedAtRaw = session.updatedAt
            const updatedAt =
              typeof updatedAtRaw === 'number'
                ? updatedAtRaw
                : typeof updatedAtRaw === 'string'
                  ? Date.parse(updatedAtRaw)
                  : 0
            const lastSeen = Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : now
            const lastMessage = readSessionLastMessage(session) || undefined
            const ageMs = now - lastSeen
            const rawStatus = readString(session.status)

            let status: AgentSessionStatusEntry['status']
            if (rawStatus === 'error') {
              status = 'error'
            } else if (ageMs < 30_000) {
              status = 'active'
            } else if (ageMs < 300_000) {
              status = 'idle'
            } else {
              status = 'stopped'
            }

            matchedEntries.push([agentId, { status, lastSeen, ...(lastMessage ? { lastMessage } : {}) }])
          }

          if (!cancelled) {
            setAgentSessionStatus((prev) => {
              const next: Record<string, AgentSessionStatusEntry> = {}

              // Apply matched sessions
              for (const [agentId, entry] of matchedEntries) {
                next[agentId] = entry
              }

              // Handle agents whose session key wasn't returned by the API
              for (const agentId of Object.keys(agentSessionMap)) {
                if (seenAgentIds.has(agentId)) continue
                const existing = prev[agentId]
                const lastSeen = existing?.lastSeen ?? now
                const ageMs = now - lastSeen
                // Grace period: keep existing status for up to 60s before marking stopped
                if (!existing || ageMs > 60_000) {
                  next[agentId] = {
                    status: 'stopped',
                    lastSeen,
                    ...(existing?.lastMessage ? { lastMessage: existing.lastMessage } : {}),
                  }
                } else {
                  next[agentId] = existing
                }
              }

              return next
            })
          }
        }

        // ── Activity Feed Events (mission only) ───────────────────────────────
        if (isMissionRunning) {
          const previousMarkers = sessionActivityRef.current
          const nextMarkers = new Map<string, string>()

          for (const session of sessions) {
            const sessionId = readSessionId(session)
            if (!sessionId) continue

            const marker = readSessionActivityMarker(session)
            const previous = previousMarkers.get(sessionId)
            const name = readSessionName(session) || sessionId

            nextMarkers.set(sessionId, marker)
            if (!previous || previous === marker) continue

            const lastMessage = readSessionLastMessage(session)
            const summary = lastMessage
              ? `Output: ${truncateMissionGoal(lastMessage, 80)}`
              : 'Session activity detected'

            emitFeedEvent({
              type: 'agent_active',
              message: `${name} update: ${summary}`,
              agentName: name,
            })
          }

          if (!cancelled) {
            sessionActivityRef.current = nextMarkers
          }
        }
      } catch {
        // Ignore polling errors; mission dispatch and local events still work.
      }
    }

    void pollSessions()
    const interval = window.setInterval(() => {
      void pollSessions()
    }, 5_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [agentSessionMap, missionActive, missionState])

  useEffect(() => {
    const previous = prevMissionStateRef.current
    if (previous === 'running' && missionState === 'stopped') {
      const snapshot = missionCompletionSnapshotRef.current
      if (snapshot && lastReportedMissionIdRef.current !== snapshot.missionId) {
        const reportText = generateMissionReport(snapshot)
        const taskStats = computeMissionTaskStats(snapshot.tasks)
        const duration = Math.max(0, snapshot.completedAt - snapshot.startedAt)
        const costEstimate = estimateMissionCost(snapshot.tokenCount)
        const record: StoredMissionReport = {
          id: snapshot.missionId,
          name: snapshot.name,
          goal: snapshot.goal,
          teamName: snapshot.teamName,
          agents: snapshot.team.map((member) => ({
            id: member.id,
            name: member.name,
            modelId: member.modelId,
          })),
          taskStats,
          duration,
          tokenCount: snapshot.tokenCount,
          costEstimate,
          artifacts: snapshot.artifacts,
          report: reportText,
          completedAt: snapshot.completedAt,
        }
        setMissionReports(saveStoredMissionReport(record))
        lastReportedMissionIdRef.current = snapshot.missionId
      }
      missionCompletionSnapshotRef.current = null
    }
    prevMissionStateRef.current = missionState
  }, [missionState])

  function applyTemplate(templateId: TeamTemplateId) {
    setTeam(buildTeamFromTemplate(templateId))
    setSelectedAgentId(undefined)
    setSelectedOutputAgentId(undefined)
  }

  function flashTeamPanel() {
    setTeamPanelFlash(true)
    if (teamPanelFlashTimerRef.current !== undefined) {
      window.clearTimeout(teamPanelFlashTimerRef.current)
    }
    teamPanelFlashTimerRef.current = window.setTimeout(() => {
      setTeamPanelFlash(false)
    }, 750)
  }

  function handleAddAgent() {
    const nextIndex = team.length
    setNewAgentDraft({
      id: createMemberId(),
      name: '',
      avatar: getAgentAvatarForSlot(nextIndex),
      modelId: 'auto',
      roleDescription: '',
      goal: '',
      backstory: '',
      status: 'available',
    })
  }

  function handleAutoConfigure() {
    const trimmedGoal = missionGoal.trim()
    if (!trimmedGoal) return
    applyTemplate(suggestTemplate(trimmedGoal))
    flashTeamPanel()
  }


  function closeLaunchWizard() {
    setWizardOpen(false)
  }

  function goToWizardStep(step: WizardStep) {
    const index = WIZARD_STEP_ORDER.indexOf(step)
    if (index >= 0) setWizardStepIndex(index)
  }

  function saveCurrentTeamConfig() {
    const trimmedName = teamConfigName.trim()
    const name =
      trimmedName.length > 0
        ? trimmedName
        : `${activeTemplateId ? TEMPLATE_DISPLAY_NAMES[activeTemplateId] : 'Custom Team'} ${new Date().toLocaleDateString()}`
    const timestamp = Date.now()
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${timestamp}-${Math.random().toString(36).slice(2, 8)}`

    const nextEntry: SavedTeamConfig = {
      id,
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
      team: team.map((member) => ({ ...member })),
    }

    setTeamConfigs((previous) => [nextEntry, ...previous].slice(0, 30))
    setSelectedTeamConfigId(id)
    setTeamConfigName('')
    toast(`Saved team config: ${name}`, { type: 'success' })
  }

  function loadTeamConfig(configId: string) {
    const config = teamConfigs.find((entry) => entry.id === configId)
    if (!config) return
    setTeam(config.team.map((member, index) => ({ ...member, avatar: member.avatar ?? getAgentAvatarForSlot(index) })))
    setSelectedTeamConfigId(config.id)
    setSelectedAgentId(undefined)
    setSelectedOutputAgentId(undefined)
    toast(`Loaded team config: ${config.name}`, { type: 'success' })
  }

  function deleteTeamConfig(configId: string) {
    setTeamConfigs((previous) => previous.filter((entry) => entry.id !== configId))
    setSelectedTeamConfigId((current) =>
      current === configId ? '' : current,
    )
  }

  function handleCreateMission() {
    if (dispatchingRef.current) return
    if (missionActiveRef.current) {
      toast('Mission already running. Stop the current mission before launching another.', {
        type: 'warning',
      })
      return
    }
    if (gatewayStatus === 'disconnected') {
      toast('Connect gateway before launching a mission', { type: 'error' })
      setWizardOpen(true)
      goToWizardStep('gateway')
      return
    }
    const trimmedGoal = missionGoal.trim()
    if (!trimmedGoal) return
    const newMissionId = `mission-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const createdTasks = parseMissionGoal(trimmedGoal, teamWithRuntimeStatus, newMissionId)
    if (createdTasks.length === 0) {
      toast('Could not parse actionable tasks from mission goal', { type: 'error' })
      return
    }

    dispatchingRef.current = true

    // Save initial checkpoint
    const missionId = newMissionId
    missionIdRef.current = missionId
    missionStartedAtRef.current = Date.now()
    saveMissionCheckpoint({
      id: missionId,
      label: truncateMissionGoal(trimmedGoal, 60),
      processType,
      team: teamWithRuntimeStatus.map(m => ({
        id: m.id,
        name: m.name,
        modelId: m.modelId,
        roleDescription: m.roleDescription,
        goal: m.goal,
        backstory: m.backstory,
      })),
      tasks: createdTasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        assignedTo: t.agentId,
      })),
      agentSessionMap: { ...agentSessionMap },
      status: 'running',
      startedAt: missionStartedAtRef.current,
      updatedAt: missionStartedAtRef.current,
    })
    // Dismiss any existing restore banner
    setRestoreCheckpoint(null)
    setRestoreDismissed(true)

    setMissionActive(true)
    setMissionState('running')
    setView('board')
    setActiveMissionName(pendingMissionNameRef.current.trim())
    const launchBudgetLimit = pendingMissionBudgetLimitRef.current.trim() || budgetLimit.trim()
    pendingMissionNameRef.current = ''
    pendingMissionBudgetLimitRef.current = ''
    setBudgetLimit(launchBudgetLimit)
    setActiveMissionBudgetLimit(launchBudgetLimit)
    setActiveMissionGoal(trimmedGoal)
    setMissionTasks(createdTasks)
    setDispatchedTaskIdsByAgent({})
    setArtifacts([])
    artifactDedupRef.current = new Set()
    agentOutputLinesRef.current = {}
    missionCompletionSnapshotRef.current = null
    setMissionTokenCount(0)
    const firstAssignedAgentId = createdTasks.find((task) => task.agentId)?.agentId
    setSelectedOutputAgentId(firstAssignedAgentId)
    setPausedByAgentId({})
    sessionActivityRef.current = new Map()
    // ── Auto-switch to Mission tab and show live feed ──────────────────────
    setActiveTab('missions')
    setLiveFeedVisible(true)
    setWizardOpen(false)
    emitFeedEvent({
      type: 'mission_started',
      message: `Mission started: ${trimmedGoal}`,
    })
    toast(`Mission started with ${createdTasks.length} tasks`, { type: 'success' })

    window.setTimeout(() => {
      if (missionIdRef.current !== missionId) {
        dispatchingRef.current = false
        return
      }
      void executeMission(
        createdTasks,
        teamWithRuntimeStatus,
        trimmedGoal,
        processType,
        missionId,
      ).finally(() => {
        if (missionIdRef.current !== missionId) return
        dispatchingRef.current = false
      })
    }, 0)
  }

  // Keep the ref in sync so keyboard shortcut always calls the latest version
  handleCreateMissionRef.current = handleCreateMission

  // Retry all spawn errors
  function handleRetryAllSpawnErrors() {
    const errorMembers = team.filter((m) => spawnState[m.id] === 'error')
    errorMembers.forEach((m) => void handleRetrySpawn(m))
  }

  const isMissionRunning = missionActive && missionState === 'running'

  // ── Mission tab content ────────────────────────────────────────────────────


  function openHtmlArtifactPreview(artifact: MissionArtifact) {
    const blob = new Blob([artifact.content], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }


  function renderOverviewContent() {
    const _activeCount = agentWorkingRows.filter(
      (row) => row.status === 'active' || row.status === 'spawning',
    ).length
    const sessionCount = agentWorkingRows.filter((row) => Boolean(row.sessionKey)).length
    const _walkingCount = agentWorkingRows.filter(
      (row) => row.status === 'idle' || row.status === 'ready',
    ).length
    const pendingApprovalCount = approvals.filter((a) => a.status === 'pending').length
    const pendingApprovals = approvals
      .filter((a) => a.status === 'pending')
      .sort((a, b) => b.requestedAt - a.requestedAt)
      .slice(0, 4)
    const taskSource = missionActive ? activeTaskSource : boardTasks
    const doneTasks = taskSource.filter((task) => task.status === 'done').length
    const totalTasks = taskSource.length
    const recentReports = missionReports.slice(0, 5)
    const recentActivityItems = [
      ...(missionActive
        ? [
            {
              id: 'mission-active',
              text: `Mission "${truncateMissionGoal(activeMissionGoal || missionGoal || 'Active mission', 44)}" ${missionState === 'running' ? 'running' : missionState}`,
              at: Date.now(),
            },
          ]
        : []),
      ...agentWorkingRows
        .filter((row) => row.lastLine)
        .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))
        .slice(0, 5)
        .map((row) => ({
          id: `agent-${row.id}`,
          text: `${row.name}: ${truncateMissionGoal(row.lastLine ?? '', 72)}`,
          at: row.lastAt ?? 0,
        })),
      ...recentReports.slice(0, 3).map((report) => ({
        id: `report-${report.id}`,
        text: `Report archived: ${truncateMissionGoal(report.goal, 60)}`,
        at: report.completedAt,
      })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, 5)
    const runningCost = estimateMissionCost(missionTokenCount)
    const missionElapsed = missionStartedAtRef.current
      ? formatDuration(Date.now() - missionStartedAtRef.current)
      : '0s'
    const _missionStatusLabel = missionActive
      ? (missionState === 'running' ? 'Running' : capitalizeFirst(missionState))
      : 'Idle'
    const selectedSessionRow = selectedOutputAgentId
      ? agentWorkingRows.find((row) => row.id === selectedOutputAgentId)
      : agentWorkingRows.find((row) => row.status === 'active') ?? agentWorkingRows[0]
    const _selectedSessionMember = selectedSessionRow
      ? team.find((member) => member.id === selectedSessionRow.id)
      : undefined
    const recentAgentOutput = agentWorkingRows
      .filter((row) => row.lastLine)
      .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))[0]
    const _modelMix = Array.from(
      team.reduce((map, member) => {
        const key = getModelShortLabel(member.modelId, gatewayModelLabelById)
        map.set(key, (map.get(key) ?? 0) + 1)
        return map
      }, new Map<string, number>()),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label, count]) => `${label}×${count}`)
    const widgetCardBaseClass =
      'group relative overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-5 shadow-sm hover:shadow-md transition-shadow duration-200 dark:border-slate-700 dark:bg-[var(--theme-card,#161b27)]'
    const widgetInsetClass =
      'rounded-lg border border-neutral-100 bg-neutral-50/50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50'

    function OverviewWidget({
      title,
      badge,
      className,
      children,
    }: {
      title: string
      badge?: ReactNode
      className?: string
      children: ReactNode
    }) {
      return (
        <article className={cn(widgetCardBaseClass, className)}>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-orange-500 via-orange-400/40 to-transparent"
          />
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">{title}</h2>
            {badge ? <div className="shrink-0">{badge}</div> : null}
          </div>
          <div className="min-h-0">{children}</div>
        </article>
      )
    }

    return (
      <div className="h-full min-h-0 overflow-y-auto bg-neutral-50 p-5 dark:bg-[var(--theme-bg,#0b0e14)]">
        <div className="mx-auto flex max-w-[1400px] min-h-0 flex-col gap-5">
          {/* ── Office View ── */}
          <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
            {agentWorkingRows.length === 0 ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-4 py-6 text-center">
                <div>
                  <p className="text-2xl" aria-hidden>🤖</p>
                  <p className="mt-1 text-sm font-medium text-neutral-700">No agents configured yet</p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">Open Configure to add your first agent.</p>
                </div>
              </div>
            ) : (
              <PixelOfficeView
                agentRows={agentWorkingRows}
                missionRunning={isMissionRunning}
                onViewOutput={(agentId) => {
                  handleAgentSelection(agentId)
                  setView('board')
                  setActiveTab('missions')
                }}
                selectedOutputAgentId={selectedOutputAgentId}
                activeTemplateName={activeTemplateId ? TEMPLATE_DISPLAY_NAMES[activeTemplateId] : undefined}
                processType={processType}
              />
            )}
          </section>

          <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            <OverviewWidget
              title="Team"
              badge={<span className="text-[11px] text-neutral-500 dark:text-slate-400">{team.length} members</span>}
            >
              {team.length === 0 ? (
                <p className="text-xs text-neutral-500 dark:text-slate-400">No agents configured yet.</p>
              ) : (
                <ul className="space-y-2">
                  {team.slice(0, 5).map((member, index) => {
                    const ac = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
                    const row = agentWorkingRows.find((item) => item.id === member.id)
                    const statusMeta = row ? getAgentStatusMeta(row.status) : getAgentStatusMeta('none')
                    return (
                      <li key={member.id} className={cn('flex items-center gap-2', widgetInsetClass)}>
                        <span className={cn('flex size-7 items-center justify-center rounded-md border border-white shadow-sm', ac.avatar)}>
                          <AgentAvatar index={resolveAgentAvatarIndex(member, index)} color={ac.hex} size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-neutral-800">{member.name}</div>
                          <div className="truncate text-[10px] text-neutral-500 dark:text-slate-400">{member.roleDescription || 'Agent'}</div>
                        </div>
                        <span className={cn('rounded px-1.5 py-0.5 font-mono text-[9px] font-medium', getOfficeModelBadge(member.modelId))}>
                          {getModelDisplayLabel(member.modelId)}
                        </span>
                        <span
                          className={cn(
                            'size-2 shrink-0 rounded-full',
                            row ? (
                              row.status === 'active' ? 'bg-emerald-500'
                                : row.status === 'idle' || row.status === 'ready' ? 'bg-amber-400'
                                  : row.status === 'error' ? 'bg-red-500'
                                    : 'bg-neutral-400'
                            ) : 'bg-neutral-300',
                          )}
                          title={statusMeta.label}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </OverviewWidget>

            <OverviewWidget
              title="Activity"
              badge={<span className="text-[11px] text-neutral-500 dark:text-slate-400">Last 5</span>}
            >
              {recentActivityItems.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-4 text-center">
                  <span className="text-lg">📋</span>
                  <p className="text-xs text-neutral-400">Activity will appear when agents start working</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {recentActivityItems.map((item) => (
                    <li key={item.id} className={cn('flex items-start gap-2 text-xs', widgetInsetClass)}>
                      <span className="mt-1 size-1.5 rounded-full bg-orange-500" />
                      <div className="min-w-0 flex-1">
                        <div className="text-neutral-700">{item.text}</div>
                        <div className="mt-0.5 text-[10px] text-neutral-400">
                          {item.at > 0 ? new Date(item.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'just now'}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </OverviewWidget>

            <OverviewWidget
              title="Approvals"
              badge={(
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  pendingApprovalCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700',
                )}>
                  {pendingApprovalCount} pending
                </span>
              )}
            >
              {pendingApprovals.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-4 text-center">
                  <span className="text-lg">🛡️</span>
                  <p className="text-xs text-neutral-400">No pending approvals</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {pendingApprovals.map((approval) => (
                    <li key={approval.id} className={widgetInsetClass}>
                      <p className="truncate text-xs font-medium text-neutral-800">{approval.agentName}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-neutral-600 dark:text-slate-400">{approval.action}</p>
                      <p className="mt-1 text-[10px] text-neutral-400">
                        {new Date(approval.requestedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </OverviewWidget>

            {/* System Health widget */}
            <OverviewWidget
              title="System Health"
              badge={
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                  effectiveGatewayStatus === 'connected'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : effectiveGatewayStatus === 'spawning'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                )}>
                  {effectiveGatewayStatus}
                </span>
              }
            >
              <div className="space-y-2 text-xs text-neutral-700">
                {/* Gateway */}
                <div className={cn('flex items-center justify-between gap-2', widgetInsetClass)}>
                  <span className="text-neutral-500 dark:text-neutral-400">Gateway</span>
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      'size-2 rounded-full',
                      effectiveGatewayStatus === 'connected' ? 'bg-emerald-500' :
                      effectiveGatewayStatus === 'spawning' ? 'bg-amber-400 animate-pulse' : 'bg-red-500',
                    )} />
                    <span className="font-medium text-neutral-900 dark:text-white capitalize">{effectiveGatewayStatus}</span>
                  </div>
                </div>
                {/* Active sessions */}
                <div className={cn('flex items-center justify-between gap-2', widgetInsetClass)}>
                  <span className="text-neutral-500 dark:text-neutral-400">Active Sessions</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">{sessionCount}</span>
                </div>
                {/* Models available */}
                <div className={cn('flex items-center justify-between gap-2', widgetInsetClass)}>
                  <span className="text-neutral-500 dark:text-neutral-400">Models Available</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {gatewayModels.length > 0 ? `${gatewayModels.length}` : '—'}
                  </span>
                </div>
                {/* Providers */}
                <div className={cn('flex items-center justify-between gap-2', widgetInsetClass)}>
                  <span className="text-neutral-500 dark:text-neutral-400">Providers</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {configuredProviders.length > 0 ? configuredProviders.slice(0, 3).join(', ') : '—'}
                  </span>
                </div>
                {/* Mission cost if running */}
                {missionActive ? (
                  <div className={cn('grid grid-cols-2 gap-2', widgetInsetClass)}>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-slate-400">Runtime</p>
                      <p className="font-semibold text-neutral-900 dark:text-white">{missionElapsed}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-slate-400">Est. Cost</p>
                      <p className="font-semibold text-neutral-900 dark:text-white">${runningCost.toFixed(2)}</p>
                    </div>
                  </div>
                ) : null}
                {/* Latest agent output */}
                {recentAgentOutput?.lastLine ? (
                  <div className={widgetInsetClass}>
                    <p className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-slate-400 mb-1">Last Output</p>
                    <p className="line-clamp-2 text-[11px] text-neutral-700 dark:text-neutral-300 font-mono">
                      {recentAgentOutput.lastLine}
                    </p>
                  </div>
                ) : null}
              </div>
            </OverviewWidget>

            {/* Recent Missions widget */}
            <OverviewWidget
              title="Recent Missions"
              badge={<span className="text-[11px] text-neutral-500 dark:text-slate-400">{recentReports.length} completed</span>}
            >
              {recentReports.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-4 text-center">
                  <span className="text-2xl opacity-30">🚀</span>
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mt-1">No missions yet</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('missions')}
                    className="mt-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                  >
                    Launch first mission →
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentReports.slice(0, 3).map((report) => {
                    const successRate = report.taskStats.total > 0
                      ? Math.round((report.taskStats.completed / report.taskStats.total) * 100)
                      : 0
                    const durationMin = Math.max(1, Math.round(report.duration / 60000))
                    return (
                      <div key={report.id} className={cn(widgetInsetClass, 'space-y-1.5')}>
                        <p className="line-clamp-1 text-xs font-semibold text-neutral-800 dark:text-neutral-100">
                          {truncateMissionGoal(report.name || report.goal, 60)}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                          <span className="flex items-center gap-1">
                            <span className={cn(
                              'size-1.5 rounded-full',
                              successRate === 100 ? 'bg-emerald-500' :
                              successRate >= 50 ? 'bg-amber-400' : 'bg-red-400',
                            )} />
                            {report.taskStats.completed}/{report.taskStats.total} tasks
                          </span>
                          <span>·</span>
                          <span>{durationMin}m</span>
                          <span>·</span>
                          <span>${report.costEstimate.toFixed(2)}</span>
                          <span className="ml-auto">{report.agents.length} agents</span>
                        </div>
                        {/* Mini progress bar */}
                        <div className="h-1 w-full rounded-full bg-neutral-200 dark:bg-neutral-700">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              successRate === 100 ? 'bg-emerald-500' :
                              successRate >= 50 ? 'bg-amber-400' : 'bg-red-400',
                            )}
                            style={{ width: `${successRate}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </OverviewWidget>

            <OverviewWidget
              title="Missions"
              badge={<span className="text-[11px] text-neutral-500 dark:text-slate-400">{missionActive ? 'Running' : 'Idle'}</span>}
            >
              <div className="space-y-2 text-xs text-neutral-700">
                <div className={cn('flex items-center justify-between', widgetInsetClass)}>
                  <span>Status</span>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    missionActive ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-600',
                  )}>
                    {missionActive ? (missionState === 'running' ? 'Running' : capitalizeFirst(missionState)) : 'No active mission'}
                  </span>
                </div>
                <div className={cn('flex items-center justify-between', widgetInsetClass)}>
                  <span>Tasks</span>
                  <span>{doneTasks}/{totalTasks || 0}</span>
                </div>
                <div className={cn('flex items-center justify-between', widgetInsetClass)}>
                  <span>Sessions</span>
                  <span>{sessionCount}</span>
                </div>
                <div className={cn('flex items-center justify-between', widgetInsetClass)}>
                  <span>Tokens / Cost</span>
                  <span>{missionTokenCount.toLocaleString()} · ${runningCost.toFixed(2)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('missions')}
                  className="w-full rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-2 py-1.5 text-center text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  Open Mission Board
                </button>
              </div>
            </OverviewWidget>
          </section>

          {/* Quick links removed per design review */}
        </div>
      </div>
    )
  }

  function renderConfigureContent() {
    return (
      <div className="relative flex h-full min-h-0 flex-col bg-neutral-50/80 p-4 dark:bg-[var(--theme-bg,#0b0e14)]">
        <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-neutral-100/60 to-white dark:from-slate-900/60 dark:to-[var(--theme-bg,#0b0e14)]" />
        <div className="relative mx-auto flex w-full max-w-[1200px] flex-col gap-4">

        {/* ── Header + horizontal pill tabs ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Settings</h2>
            <p className="text-xs text-neutral-500 dark:text-slate-400">Configure agents, teams, API keys, and approvals</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className="rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            >
              ← Back
            </button>
          </div>
          </div>

        {/* ── Horizontal pill navigation ── */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {CONFIG_SECTIONS.map((section) => {
            const isActive = configSection === section.id
            const badge = undefined // approvals moved to header bell
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setConfigSection(section.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                  isActive
                    ? 'border border-orange-200 bg-orange-50 text-orange-700'
                    : 'border border-transparent text-neutral-600 hover:bg-neutral-100',
                )}
              >
                <span aria-hidden>{section.icon}</span>
                <span>{section.label}</span>
                {badge ? (
                  <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        {/* ── Content area ── */}
        <div className="min-w-0 overflow-y-auto">
          {configSection === 'agents' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Configured Agents</h2>
                  <p className="text-xs text-neutral-500 dark:text-slate-400">
                    Edit agent identity, model, role description, and system prompt.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddAgent}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  Add Agent
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

              {team.map((member, index) => {
                const ac = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
                const hasPrompt = member.backstory.trim().length > 0
                return (
                  <div
                    key={member.id}
                    className={cn('relative rounded-xl border-2 bg-white dark:bg-neutral-900 shadow-sm transition-all hover:shadow-md cursor-default', ac.border)}
                  >
                    {/* Pencil — top right, opens wizard modal */}
                    <button
                      type="button"
                      onClick={() => setAgentWizardOpenId(member.id)}
                      className="absolute right-2.5 top-2.5 z-10 flex size-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 transition-all hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-200"
                      aria-label="Edit agent"
                      title="Edit agent"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>

                    <div className="flex flex-col items-center px-4 pt-5 pb-4 text-center">
                      <div className={cn('mb-3 flex size-16 items-center justify-center rounded-full shadow-md', ac.avatar)}>
                        <AgentAvatar index={resolveAgentAvatarIndex(member, index)} color={ac.hex} size={32} />
                      </div>
                      <p className="text-sm font-bold text-neutral-900 dark:text-white leading-tight">{member.name || `Agent ${index + 1}`}</p>
                      <span className="mt-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
                        {getModelDisplayLabelFromLookup(member.modelId, gatewayModelLabelById)}
                      </span>
                      {member.roleDescription ? (
                        <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1">{member.roleDescription}</p>
                      ) : null}
                      <div className="mt-3 w-full rounded-lg border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 px-2.5 py-2 text-left">
                        {hasPrompt ? (
                          <p className="line-clamp-2 text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                            {member.backstory.trim().replace(/\s+/g, ' ').slice(0, 120)}…
                          </p>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAgentWizardOpenId(member.id)}
                            className="flex w-full items-center justify-center gap-1 text-[10px] font-medium text-neutral-400 dark:text-neutral-500 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
                          >
                            <span>+</span> Set system prompt
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Add Agent card */}
              <button
                type="button"
                onClick={handleAddAgent}
                className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-center transition-all hover:border-orange-400 hover:bg-orange-50/30 dark:hover:border-orange-700 dark:hover:bg-orange-900/10"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-xl text-neutral-400">+</span>
                <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">Add Agent</span>
              </button>
              </div>

              {/* ── Agent Wizard Modals ── */}
              {team.map((member, index) => {
                if (agentWizardOpenId !== member.id) return null
                const ac = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
                const avatarIdx = resolveAgentAvatarIndex(member, index)
                const avatarNode = (
                  <div className="relative" data-avatar-picker>
                    <div className={cn('flex size-14 items-center justify-center rounded-full shadow-md', ac.avatar)}>
                      <AgentAvatar index={avatarIdx} color={ac.hex} size={28} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setAvatarPickerOpenId((prev) => prev === member.id ? null : member.id)}
                      className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 shadow-sm text-neutral-500 hover:text-neutral-700 transition-colors"
                      title="Change avatar"
                    >
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    {avatarPickerOpenId === member.id ? (
                      <div className="absolute left-0 top-full z-[60] mt-2 w-52 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 shadow-xl">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Choose Avatar</p>
                        <div className="grid grid-cols-5 gap-1.5">
                          {Array.from({ length: AGENT_AVATAR_COUNT }, (_, i) => {
                            const aac = AGENT_ACCENT_COLORS[i % AGENT_ACCENT_COLORS.length]
                            return (
                              <button key={i} type="button"
                                onClick={() => { setTeam((prev) => prev.map((r) => r.id === member.id ? { ...r, avatar: i } : r)); setAvatarPickerOpenId(null) }}
                                className={cn('flex size-8 items-center justify-center rounded-full border-2 transition-all', avatarIdx === i ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 scale-110' : 'border-transparent bg-neutral-100 dark:bg-neutral-800 hover:scale-105')}>
                                <AgentAvatar index={i} color={aac.hex} size={16} />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
                return (
                  <AgentWizardModal
                    key={member.id}
                    member={member}
                    memberIndex={index}
                    accentBorderClass={ac.border}
                    avatarNode={avatarNode}
                    gatewayModels={gatewayModels}
                    modelPresets={MODEL_PRESETS}
                    systemPromptTemplates={SYSTEM_PROMPT_TEMPLATES}
                    onUpdate={(updates) => setTeam((prev) => prev.map((r) => r.id === member.id ? { ...r, ...updates } : r))}
                    onDelete={() => { setTeam((prev) => prev.filter((r) => r.id !== member.id)); setAgentWizardOpenId(null) }}
                    onClose={() => setAgentWizardOpenId(null)}
                  />
                )
              })}

              {/* ── New Agent Draft Wizard (configure BEFORE adding to team) ── */}
              {newAgentDraft ? (() => {
                const draftIndex = team.length
                const draftAc = AGENT_ACCENT_COLORS[draftIndex % AGENT_ACCENT_COLORS.length]
                const draftAvatarIdx = typeof newAgentDraft.avatar === 'number' ? newAgentDraft.avatar : getAgentAvatarForSlot(draftIndex)
                const draftAvatarNode = (
                  <div className="relative" data-avatar-picker>
                    <div className={cn('flex size-14 items-center justify-center rounded-full shadow-md', draftAc.avatar)}>
                      <AgentAvatar index={draftAvatarIdx} color={draftAc.hex} size={28} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setAvatarPickerOpenId((prev) => prev === newAgentDraft.id ? null : newAgentDraft.id)}
                      className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 shadow-sm text-neutral-500 hover:text-neutral-700 transition-colors"
                    >
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    {avatarPickerOpenId === newAgentDraft.id ? (
                      <div className="absolute left-0 top-full z-[60] mt-2 w-52 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 shadow-xl">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Choose Avatar</p>
                        <div className="grid grid-cols-5 gap-1.5">
                          {Array.from({ length: AGENT_AVATAR_COUNT }, (_, i) => {
                            const aac = AGENT_ACCENT_COLORS[i % AGENT_ACCENT_COLORS.length]
                            return (
                              <button key={i} type="button"
                                onClick={() => { setNewAgentDraft((prev) => prev ? { ...prev, avatar: i } : null); setAvatarPickerOpenId(null) }}
                                className={cn('flex size-8 items-center justify-center rounded-full border-2 transition-all', draftAvatarIdx === i ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 scale-110' : 'border-transparent bg-neutral-100 dark:bg-neutral-800 hover:scale-105')}>
                                <AgentAvatar index={i} color={aac.hex} size={16} />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
                return (
                  <AgentWizardModal
                    key="new-agent-draft"
                    member={newAgentDraft}
                    memberIndex={draftIndex}
                    accentBorderClass={draftAc.border}
                    avatarNode={draftAvatarNode}
                    gatewayModels={gatewayModels}
                    modelPresets={MODEL_PRESETS}
                    systemPromptTemplates={SYSTEM_PROMPT_TEMPLATES}
                    addMode={true}
                    onUpdate={(updates) => setNewAgentDraft((prev) => prev ? { ...prev, ...updates } : null)}
                    onDelete={() => { setNewAgentDraft(null); setAvatarPickerOpenId(null) }}
                    onClose={() => {
                      // "Add Agent" clicked — add the configured draft to the team
                      if (newAgentDraft) {
                        const finalName = newAgentDraft.name.trim() || `Agent ${team.length + 1}`
                        setTeam((prev) => [...prev, { ...newAgentDraft, name: finalName }])
                      }
                      setNewAgentDraft(null)
                      setAvatarPickerOpenId(null)
                    }}
                  />
                )
              })() : null}
            </div>
          ) : null}

          {configSection === 'teams' ? (
            <div className="space-y-6">

              {/* Saved team configs */}
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">My Teams</h2>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">{teamConfigs.length} saved · {team.length} agents active</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddTeamModal(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                    New Team
                  </button>
                </div>
                {teamConfigs.length === 0 ? (
                  <button type="button" onClick={() => setShowAddTeamModal(true)}
                    className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-8 text-center transition-all hover:border-orange-400 hover:bg-orange-50/20">
                    <span className="flex size-10 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-xl">👥</span>
                    <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Create your first team</p>
                    <p className="text-[10px] text-neutral-400 dark:text-neutral-500">Save a config or start from a template</p>
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {teamConfigs.map((config, tIdx) => {
                      const isActive = selectedTeamConfigId === config.id
                      const teamColors = ['border-blue-300', 'border-emerald-300', 'border-violet-300', 'border-amber-300', 'border-pink-300', 'border-teal-300']
                      return (
                        <div key={config.id} className={cn('relative rounded-xl border-2 bg-white dark:bg-neutral-900 shadow-sm transition-all hover:shadow-md', isActive ? 'border-orange-400' : teamColors[tIdx % teamColors.length])}>
                          {isActive ? <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-bold text-white shadow-sm">Active</span> : null}
                          <button type="button" onClick={() => setTeamWizardOpenId(config.id)}
                            className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 transition-all" title="Edit team">
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          <div className="flex flex-col items-center px-3 pt-5 pb-3 text-center">
                            <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-xl shadow-sm">{config.icon ?? '👥'}</div>
                            <p className="text-xs font-bold text-neutral-900 dark:text-white leading-tight">{config.name}</p>
                            <p className="mt-0.5 text-[10px] text-neutral-400">{config.team.length} agents</p>
                            <div className="mt-2 flex flex-wrap justify-center gap-1">
                              {config.team.slice(0, 3).map((m) => <span key={m.id} className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[9px] text-neutral-500 dark:text-neutral-400">{m.name}</span>)}
                              {config.team.length > 3 ? <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[9px] text-neutral-400">+{config.team.length - 3}</span> : null}
                            </div>
                          </div>
                          <div className="border-t border-neutral-100 dark:border-neutral-800 flex">
                            <button type="button" onClick={() => { setSelectedTeamConfigId(config.id); loadTeamConfig(config.id) }}
                              className="flex-1 py-2 text-[10px] font-semibold text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors rounded-bl-xl">Activate</button>
                            <div className="w-px bg-neutral-100 dark:bg-neutral-800" />
                            <button type="button" onClick={() => setTeamWizardOpenId(config.id)}
                              className="flex-1 py-2 text-[10px] font-medium text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors rounded-br-xl">Edit</button>
                          </div>
                        </div>
                      )
                    })}
                    <button type="button" onClick={() => setShowAddTeamModal(true)}
                      className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-center transition-all hover:border-orange-400 hover:bg-orange-50/20">
                      <span className="flex size-8 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-base text-neutral-400">+</span>
                      <span className="text-[10px] font-medium text-neutral-400">New Team</span>
                    </button>
                  </div>
                )}

                {/* Team Wizard Modals */}
                {teamConfigs.map((config) => teamWizardOpenId !== config.id ? null : (
                  <TeamWizardModal key={config.id}
                    teamId={config.id}
                    teamName={config.name}
                    teamIcon={config.icon ?? '👥'}
                    teamMembers={config.team}
                    isActive={selectedTeamConfigId === config.id}
                    modelPresets={MODEL_PRESETS}
                    gatewayModels={gatewayModels}
                    onRename={(name) => {
                      setTeamConfigs((prev) => prev.map((c) => c.id === config.id ? { ...c, name, updatedAt: Date.now() } : c))
                    }}
                    onUpdateIcon={(icon) => {
                      setTeamConfigs((prev) => prev.map((c) => c.id === config.id ? { ...c, icon, updatedAt: Date.now() } : c))
                    }}
                    onUpdateMembers={(updates) => {
                      setTeamConfigs((prev) => prev.map((c) => {
                        if (c.id !== config.id) return c
                        return {
                          ...c,
                          team: c.team.map((m) => {
                            const upd = updates.find((u) => u.id === m.id)
                            return upd ? { ...m, modelId: upd.modelId } : m
                          }),
                          updatedAt: Date.now(),
                        }
                      }))
                    }}
                    onLoad={() => { setSelectedTeamConfigId(config.id); loadTeamConfig(config.id) }}
                    onDelete={() => { deleteTeamConfig(config.id); setTeamWizardOpenId(null) }}
                    onClose={() => setTeamWizardOpenId(null)} />
                ))}
                {showAddTeamModal ? (
                  <AddTeamModal
                    currentTeam={team}
                    quickStartTemplates={TEAM_QUICK_TEMPLATES}
                    existingIcons={teamConfigs.map((c) => c.icon ?? '').filter(Boolean)}
                    onSaveCurrentAs={(name, icon, selectedAgentIds) => {
                      const timestamp = Date.now()
                      const newId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                        ? crypto.randomUUID()
                        : `${timestamp}-${Math.random().toString(36).slice(2, 8)}`
                      const selectedMembers = team.filter((m) => selectedAgentIds.includes(m.id))
                      const entryName = name || `Custom Team ${new Date().toLocaleDateString()}`
                      const nextEntry: SavedTeamConfig = {
                        id: newId,
                        name: entryName,
                        icon,
                        createdAt: timestamp,
                        updatedAt: timestamp,
                        team: selectedMembers.map((m) => ({ ...m })),
                      }
                      setTeamConfigs((prev) => [nextEntry, ...prev].slice(0, 30))
                      setSelectedTeamConfigId(newId)
                      toast(`Saved team: ${entryName}`, { type: 'success' })
                    }}
                    onApplyTemplate={applyTemplate}
                    onClose={() => setShowAddTeamModal(false)} />
                ) : null}
              </div>

            </div>
          ) : null}

          {configSection === 'keys' ? (
            <div className="space-y-5">
              {/* ── Add Provider Wizard Modal ── */}
              <WizardModal open={showAddProviderModal} onClose={() => { setShowAddProviderModal(false); setProviderWizardStep('select'); setProviderWizardSelected(''); setAddProviderApiKey('') }} width="max-w-2xl">
                {/* Wizard header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100 dark:border-neutral-800 border-l-4 border-l-orange-400">
                  <div>
                    <h2 className="text-base font-bold text-neutral-900 dark:text-white">Add Provider</h2>
                    <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                      {providerWizardStep === 'select' ? 'Step 1 — Choose a provider' : `Step 2 — Enter your ${providerWizardSelected || addProviderName} API key`}
                    </p>
                  </div>
                  {/* Step indicator + close */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('size-2 rounded-full', providerWizardStep === 'select' ? 'bg-orange-500' : 'bg-neutral-300 dark:bg-neutral-600')} />
                      <span className={cn('size-2 rounded-full', providerWizardStep === 'key' ? 'bg-orange-500' : 'bg-neutral-300 dark:bg-neutral-600')} />
                    </div>
                    <button type="button" onClick={() => { setShowAddProviderModal(false); setProviderWizardStep('select'); setProviderWizardSelected(''); setAddProviderApiKey('') }}
                      className="flex size-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:hover:text-white transition-colors">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                </div>

                {/* Step 1: Provider grid */}
                {providerWizardStep === 'select' ? (
                  <div className="px-6 py-5">
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      {([...KNOWN_GATEWAY_PROVIDERS, CUSTOM_PROVIDER_OPTION] as const).map((provider, pIdx) => {
                        const isCustom = provider === CUSTOM_PROVIDER_OPTION
                        const isAlreadyAdded = configuredProviders.includes(provider)
                        const pColors = [
                          { border: 'border-blue-200 hover:border-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400' },
                          { border: 'border-emerald-200 hover:border-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-600 dark:text-emerald-400' },
                          { border: 'border-violet-200 hover:border-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-600 dark:text-violet-400' },
                          { border: 'border-amber-200 hover:border-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400' },
                          { border: 'border-pink-200 hover:border-pink-400', bg: 'bg-pink-50 dark:bg-pink-900/20', text: 'text-pink-600 dark:text-pink-400' },
                          { border: 'border-teal-200 hover:border-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/20', text: 'text-teal-600 dark:text-teal-400' },
                        ]
                        const pm = (PROVIDER_META as Record<string, { label: string; emoji: string; color: string; bg: string; border: string; description: string }>)[provider.toLowerCase()]
                        const tileBorder = isCustom ? 'border-neutral-200 hover:border-neutral-400' : (pm?.border ?? pColors[pIdx % pColors.length].border)
                        const tileBg = isCustom ? 'bg-neutral-50 dark:bg-neutral-800' : (pm?.bg ?? pColors[pIdx % pColors.length].bg)
                        return (
                          <button
                            key={provider}
                            type="button"
                            onClick={() => {
                              setProviderWizardSelected(provider)
                              setAddProviderSelection(provider)
                              setSelectedModel('')
                              if (provider !== CUSTOM_PROVIDER_OPTION) {
                                setAddProviderName(provider)
                              } else {
                                setAddProviderName('')
                              }
                              setProviderWizardStep('key')
                            }}
                            className={cn('relative rounded-xl border-2 p-3 text-center transition-all hover:shadow-sm', tileBorder)}
                          >
                            {isAlreadyAdded ? (
                              <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[8px] text-white font-bold">✓</span>
                            ) : null}
                            <div className={cn('mx-auto mb-1.5 flex size-8 items-center justify-center rounded-full', tileBg)}>
                              {isCustom ? <span className="text-sm">⚙️</span> : <ProviderLogo provider={provider} size={18} />}
                            </div>
                            <p className="text-[10px] font-medium text-neutral-700 dark:text-neutral-300 truncate leading-tight">
                              {isCustom ? 'Custom' : (pm?.label ?? provider)}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Step 2: Key entry */}
                {providerWizardStep === 'key' ? (
                  <div className="px-6 py-5 space-y-3">
                    {/* Back */}
                    <button
                      type="button"
                      onClick={() => { setProviderWizardStep('select'); setAddProviderApiKey('') }}
                      className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7 2L3 6l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Back
                    </button>

                    {/* Custom name input */}
                    {addProviderSelection === CUSTOM_PROVIDER_OPTION ? (
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Provider Name</label>
                        <input
                          value={addProviderName}
                          onChange={(event) => { setAddProviderName(event.target.value); setSelectedModel('') }}
                          placeholder="e.g. together, fireworks..."
                          className="h-9 w-full rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 text-sm text-neutral-900 dark:text-white outline-none ring-orange-400 focus:ring-1"
                        />
                      </div>
                    ) : null}

                    {/* API Key */}
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">API Key</label>
                      <input
                        type="password"
                        value={addProviderApiKey}
                        onChange={(event) => setAddProviderApiKey(event.target.value)}
                        placeholder={`${addProviderName || 'Provider'} API key…`}
                        autoFocus
                        className="h-9 w-full rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 text-sm text-neutral-900 dark:text-white outline-none ring-orange-400 focus:ring-1 font-mono"
                      />
                    </div>

                    {/* Model select — gateway models first, curated fallback for new providers */}
                    {addProviderName.trim() ? (() => {
                      const key = addProviderName.trim().toLowerCase()
                      const curatedModels = (PROVIDER_COMMON_MODELS as Record<string, Array<{ value: string; label: string }>>)[key] ?? []
                      const modelOptions = addProviderAvailableModels.length > 0 ? addProviderAvailableModels : curatedModels
                      if (modelOptions.length === 0) return null
                      return (
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                            Default Model{' '}
                            <span className="font-normal normal-case text-neutral-300">
                              {addProviderAvailableModels.length === 0 ? '— common models' : '(optional)'}
                            </span>
                          </label>
                          <select
                            value={selectedModel}
                            onChange={(event) => setSelectedModel(event.target.value)}
                            className="h-9 w-full rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 text-sm text-neutral-900 dark:text-white outline-none ring-orange-400 focus:ring-1"
                          >
                            <option value="">Use gateway default</option>
                            {modelOptions.map((model) => (
                              <option key={model.value} value={model.value}>{model.label}</option>
                            ))}
                          </select>
                        </div>
                      )
                    })() : null}

                    <button
                      type="button"
                      onClick={() => {
                        void handleAddProvider().then(() => {
                          setProviderWizardStep('select')
                          setProviderWizardSelected('')
                        })
                      }}
                      disabled={isAddingProvider || !addProviderApiKey.trim() || !addProviderName.trim()}
                      className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isAddingProvider ? 'Adding…' : `Connect ${addProviderName || 'Provider'}`}
                    </button>
                  </div>
                ) : null}
              </WizardModal>

              {/* Connected providers section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Connected Providers</h2>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{configuredProviders.length} active · {gatewayModels.length} models available</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setProviderWizardStep('select'); setProviderWizardSelected(''); setAddProviderApiKey(''); setAddProviderName(''); setShowAddProviderModal(true) }}
                    className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                    Add Provider
                  </button>
                </div>
                {configuredProviders.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <span className="text-xl">🔑</span>
                    <p className="text-xs text-neutral-400">No configured providers detected. Add one above.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {configuredProviders.map((provider) => {
                      const providerModels = gatewayModels.filter((m) => m.provider === provider)
                      const pm = (PROVIDER_META as Record<string, { label: string; emoji: string; color: string; bg: string; border: string; description: string }>)[provider.toLowerCase()] ?? { label: provider, emoji: '🔑', color: 'text-neutral-600', bg: 'bg-neutral-100 dark:bg-neutral-800', border: 'border-neutral-300', description: '' }
                      return (
                        <div key={provider}
                          className={cn('relative rounded-xl border-2 bg-white dark:bg-neutral-900 shadow-sm transition-all hover:shadow-md', pm.border)}
                        >
                          {/* Edit pencil */}
                          <button type="button" onClick={() => setProviderEditModalProvider(provider)}
                            className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 transition-all" title="Edit provider">
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          <div className="flex flex-col items-center px-3 pt-4 pb-3 text-center">
                            <div className={cn('mb-2 flex size-12 items-center justify-center rounded-full shadow-sm', pm.bg)}>
                              <ProviderLogo provider={provider} size={28} />
                            </div>
                            <p className="text-xs font-bold text-neutral-900 dark:text-white leading-tight">{pm.label}</p>
                            <p className="text-[9px] text-neutral-400 mt-0.5">{pm.description}</p>
                            <div className="mt-1 flex items-center gap-1">
                              <span className="size-1.5 rounded-full bg-emerald-500" />
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Active</span>
                            </div>
                            <span className="mt-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
                              {providerModels.length} model{providerModels.length !== 1 ? 's' : ''}
                            </span>
                            {providerModels.length > 0 ? (
                              <div className="mt-2 w-full space-y-0.5">
                                {providerModels.slice(0, 3).map((m) => (
                                  <span key={m.value} className="block truncate rounded bg-neutral-50 dark:bg-neutral-800 px-1.5 py-0.5 text-[9px] text-neutral-500 dark:text-neutral-400">{m.label}</span>
                                ))}
                                {providerModels.length > 3 ? <span className="block text-[9px] text-neutral-400 text-center">+{providerModels.length - 3} more</span> : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Provider Edit Modal */}
              {providerEditModalProvider ? (
                <ProviderEditModal
                  provider={providerEditModalProvider}
                  currentModels={gatewayModels.filter((m) => m.provider === providerEditModalProvider)}
                  availableModels={gatewayModels.filter((m) => m.provider === providerEditModalProvider)}
                  onSave={(_apiKey, _defaultModel) => {
                    // Future: wire to gateway config update API
                    void refreshGatewayStatus().then((connected) => {
                      if (connected) return refreshConfiguredProviders()
                      return Promise.resolve()
                    })
                  }}
                  onClose={() => setProviderEditModalProvider(null)}
                />
              ) : null}
            </div>
          ) : null}

          {/* Approvals moved to header bell — see ApprovalsBell component */}
        </div>
        </div>
      </div>
    )
  }

  function renderMissionsTabContent() {
    const currentTeamLabel = `${activeTemplateId ? TEMPLATE_DISPLAY_NAMES[activeTemplateId] : 'Custom Team'} · ${team.length} agents`
    const missionTasksForBoard = missionTasks.length > 0 ? missionTasks : boardTasks
    const runningTaskStats = computeMissionTaskStats(missionTasksForBoard)
    const runningCost = estimateMissionCost(missionTokenCount)
    const activeBudgetTokens = parseTokenBudget(activeMissionBudgetLimit || budgetLimit)
    const runningBudgetCost = activeBudgetTokens ? estimateMissionCost(activeBudgetTokens) : null
    const runningElapsed = missionStartedAtRef.current ? formatDuration(Date.now() - missionStartedAtRef.current) : '0s'
    const runningProgressPct = runningTaskStats.total > 0
      ? Math.round((runningTaskStats.completed / runningTaskStats.total) * 100)
      : 0
    const restoreDraftCard = restoreCheckpoint && !restoreDismissed && !missionActive
      ? {
          id: `restore-${restoreCheckpoint.id}`,
          name: 'Recovered Mission',
          goal: restoreCheckpoint.label,
          teamName: `${restoreCheckpoint.team.length} agents`,
          processType: restoreCheckpoint.processType,
          createdAt: restoreCheckpoint.updatedAt,
        }
      : null
    const reviewReports = missionReports.slice(0, 3)
    const doneReports = missionReports.slice(3)
    const runningLatestOutput =
      agentWorkingRows.find((row) => row.status === 'active' && row.lastLine)?.lastLine
      ?? agentWorkingRows.find((row) => row.lastLine)?.lastLine
      ?? ''

    const missionTeamOptions = [
      { id: '__current__', label: currentTeamLabel, team },
      ...teamConfigs.map((config) => ({
        id: config.id,
        label: `${config.name} · ${config.team.length} agents`,
        team: config.team,
      })),
    ]
    const selectedMissionTeamOption =
      missionTeamOptions.find((option) => option.id === newMissionTeamConfigId)
      ?? missionTeamOptions[0]
    const selectedMissionTeamMembers = selectedMissionTeamOption?.team ?? []
    const selectedBudgetTokens = parseTokenBudget(newMissionBudgetLimit)
    const selectedTotalBudgetCost = selectedBudgetTokens ? estimateMissionCost(selectedBudgetTokens) : null
    // (budget cost per agent — reserved for future budget display)

    function getTeamBudgetSummary(members: TeamMember[]) {
      const totalCost = selectedBudgetTokens ? estimateMissionCost(selectedBudgetTokens) : null
      const avgCost =
        totalCost !== null && members.length > 0
          ? Number((totalCost / members.length).toFixed(2))
          : null
      return { totalCost, avgCost }
    }

    function openNewMissionModal(prefill?: Partial<MissionBoardDraft>) {
      setNewMissionName(prefill?.name ?? '')
      setNewMissionGoal(prefill?.goal ?? missionGoal)
      setNewMissionTeamConfigId(prefill?.teamConfigId ?? '__current__')
      setNewMissionProcessType(prefill?.processType ?? processType)
      setNewMissionBudgetLimit(prefill?.budgetLimit ?? budgetLimit)
      setMissionBoardModalOpen(true)
      setMissionWizardStep(0)
    }

    function handleSaveMissionDraft() {
      const goal = newMissionGoal.trim()
      const name = newMissionName.trim() || 'Untitled mission'
      if (!goal) return
      const selectedConfig = newMissionTeamConfigId === '__current__'
        ? null
        : teamConfigs.find((entry) => entry.id === newMissionTeamConfigId)
      const teamName = selectedConfig ? `${selectedConfig.name} · ${selectedConfig.team.length} agents` : currentTeamLabel
      const id = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setMissionBoardDrafts((prev) => [
        {
          id,
          name,
          goal,
          teamConfigId: newMissionTeamConfigId,
          teamName,
          processType: newMissionProcessType,
          budgetLimit: newMissionBudgetLimit.trim(),
          createdAt: Date.now(),
        },
        ...prev,
      ])
      setMissionBoardModalOpen(false)
      toast(`Saved draft: ${name}`, { type: 'success' })
    }

    function handleLaunchMissionFromModal() {
      const goal = newMissionGoal.trim()
      if (!goal) return
      const selectedConfig = newMissionTeamConfigId === '__current__'
        ? null
        : teamConfigs.find((entry) => entry.id === newMissionTeamConfigId)

      if (selectedConfig) {
        setTeam(selectedConfig.team.map((member, index) => ({
          ...member,
          avatar: member.avatar ?? getAgentAvatarForSlot(index),
        })))
        setSelectedTeamConfigId(selectedConfig.id)
      }

      pendingMissionNameRef.current = newMissionName.trim()
      pendingMissionBudgetLimitRef.current = newMissionBudgetLimit.trim()
      setMissionGoal(goal)
      setProcessType(newMissionProcessType)
      setBudgetLimit(newMissionBudgetLimit.trim())
      setMissionBoardModalOpen(false)
      setRestoreDismissed(true)

      window.setTimeout(() => {
        handleCreateMissionRef.current()
      }, 0)
    }

    function renderAvatarStrip(members: Array<{ id: string; name: string }>) {
      if (members.length === 0) {
        return <span className="text-[10px] text-neutral-400">No agents</span>
      }
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {members.slice(0, 5).map((member, index) => (
            <div
              key={member.id}
              className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-2 py-0.5"
            >
              <span className={cn(
                'size-1.5 rounded-full',
                AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]?.hex
                  ? 'bg-orange-400'
                  : 'bg-neutral-400',
              )} />
              <span className="text-[10px] font-medium text-neutral-700">{member.name}</span>
            </div>
          ))}
          {members.length > 5 ? (
            <span className="text-[10px] font-medium text-neutral-500 dark:text-slate-400">+{members.length - 5}</span>
          ) : null}
        </div>
      )
    }

    function renderCardShell({
      id,
      statusLabel,
      statusClassName,
      name,
      goal,
      teamLabel,
      avatars,
      progressText,
      elapsedText,
      costText,
      metaChips,
      extraMetrics,
      extraFooter,
      expandedContent,
    }: {
      id: string
      statusLabel: string
      statusClassName: string
      name: string
      goal: string
      teamLabel: string
      avatars: Array<{ id: string; name: string }>
      progressText: string
      elapsedText?: string
      costText: string
      metaChips?: string[]
      extraMetrics?: Array<{ label: string; value: string }>
      extraFooter?: ReactNode
      expandedContent?: ReactNode
    }) {
      const expanded = expandedMissionCardId === id
      const metricItems = [
        { label: 'Progress', value: progressText },
        { label: 'Est. Cost', value: costText },
        ...(elapsedText ? [{ label: 'Elapsed', value: elapsedText }] : []),
        ...(extraMetrics ?? []),
      ]
      return (
        <div
          key={id}
          role="button"
          tabIndex={0}
          onClick={() => setExpandedMissionCardId((current) => (current === id ? null : id))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setExpandedMissionCardId((current) => (current === id ? null : id))
            }
          }}
          className="w-full rounded-2xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{name}</p>
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-neutral-600 dark:text-slate-400">{truncateMissionGoal(goal, 120)}</p>
              {metaChips && metaChips.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {metaChips.map((chip) => (
                    <span key={chip} className="rounded-full border border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:text-slate-400">
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', statusClassName)}>
              {statusLabel}
            </span>
          </div>

          <div className="mt-3.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium text-neutral-500 dark:text-slate-400">{teamLabel}</p>
              <div className="mt-1">{renderAvatarStrip(avatars)}</div>
            </div>
            <span className="text-[10px] font-medium text-neutral-400">{expanded ? 'Hide' : 'Expand'}</span>
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-2 text-[10px] text-neutral-600 dark:text-slate-400">
            {metricItems.map((metric) => (
              <div key={`${id}-${metric.label}`} className="rounded-lg border border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-2.5 py-2">
                <span className="text-neutral-400">{metric.label}</span>
                <p className="mt-0.5 font-semibold text-neutral-800">{metric.value}</p>
              </div>
            ))}
          </div>

          {extraFooter ? (
            <div className="mt-3.5" onClick={(event) => event.stopPropagation()}>
              {extraFooter}
            </div>
          ) : null}

          {expanded && expandedContent ? (
            <div className="mt-3.5 border-t border-neutral-200 pt-3.5" onClick={(event) => event.stopPropagation()}>
              {expandedContent}
            </div>
          ) : null}
        </div>
      )
    }

    const draftCards = [
      ...missionBoardDrafts.map((draft) => (
        renderCardShell({
          id: draft.id,
          statusLabel: 'Draft',
          statusClassName: 'bg-neutral-100 text-neutral-700 border border-neutral-200',
          name: draft.name,
          goal: draft.goal,
          teamLabel: draft.teamName,
          avatars: (draft.teamConfigId === '__current__'
            ? team
            : (teamConfigs.find((entry) => entry.id === draft.teamConfigId)?.team ?? [])
          ).map((member) => ({ id: member.id, name: member.name })),
          progressText: '0 / 0',
          costText: '$0.0000',
          metaChips: [`${draft.processType}`, draft.budgetLimit ? `Budget ${Number(draft.budgetLimit.replace(/[^\d]/g, '') || '0').toLocaleString()} tok` : 'No budget'],
          extraMetrics: [
            { label: 'Created', value: timeAgoFromMs(draft.createdAt) },
            { label: 'Agents', value: String((draft.teamConfigId === '__current__'
              ? team
              : (teamConfigs.find((entry) => entry.id === draft.teamConfigId)?.team ?? [])).length) },
          ],
          extraFooter: (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openNewMissionModal(draft)}
                className="rounded-md border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-2 py-1 text-[10px] font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  openNewMissionModal(draft)
                  setMissionBoardDrafts((prev) => prev.filter((entry) => entry.id !== draft.id))
                }}
                className="rounded-md bg-orange-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-orange-600"
              >
                Launch
              </button>
            </div>
          ),
          expandedContent: (
            <div className="space-y-2 text-[11px] text-neutral-600 dark:text-slate-400">
              <p><span className="font-medium text-neutral-800">Process:</span> {draft.processType}</p>
              <p><span className="font-medium text-neutral-800">Budget:</span> {draft.budgetLimit ? `${Number(draft.budgetLimit.replace(/[^\d]/g, '') || '0').toLocaleString()} tokens` : 'Not set'}</p>
              <p><span className="font-medium text-neutral-800">Created:</span> {timeAgoFromMs(draft.createdAt)}</p>
            </div>
          ),
        })
      )),
      ...(restoreDraftCard
        ? [
            renderCardShell({
              id: restoreDraftCard.id,
              statusLabel: 'Draft',
              statusClassName: 'bg-amber-50 text-amber-700 border border-amber-200',
              name: restoreDraftCard.name,
              goal: restoreDraftCard.goal,
              teamLabel: restoreDraftCard.teamName,
              avatars: restoreCheckpoint?.team.map((member) => ({ id: member.id, name: member.name })) ?? [],
              progressText: `${restoreCheckpoint?.tasks.filter((t) => t.status === 'done').length ?? 0} / ${restoreCheckpoint?.tasks.length ?? 0}`,
              costText: '$0.0000',
              metaChips: [restoreCheckpoint?.processType ?? 'parallel', 'Recovered checkpoint'],
              extraMetrics: [
                { label: 'Updated', value: timeAgoFromMs(restoreCheckpoint?.updatedAt ?? Date.now()) },
                { label: 'Agents', value: String(restoreCheckpoint?.team.length ?? 0) },
              ],
              extraFooter: (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!restoreCheckpoint) return
                      setMissionGoal(restoreCheckpoint.label)
                      setProcessType(restoreCheckpoint.processType)
                      setRestoreDismissed(true)
                      setRestoreCheckpoint(null)
                    }}
                    className="rounded-md bg-orange-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-orange-600"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearMissionCheckpoint()
                      setRestoreCheckpoint(null)
                      setRestoreDismissed(true)
                    }}
                    className="rounded-md border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-2 py-1 text-[10px] font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Discard
                  </button>
                </div>
              ),
              expandedContent: (
                <p className="text-[11px] text-neutral-600 dark:text-slate-400">
                  Recovered checkpoint from {timeAgoFromMs(restoreCheckpoint?.updatedAt ?? Date.now())}.
                </p>
              ),
            }),
          ]
        : []),
    ]

    const runningCards = missionActive
      ? [
          renderCardShell({
            id: `running-${missionIdRef.current || 'active'}`,
            statusLabel: missionState === 'paused' ? 'Paused' : 'Running',
            statusClassName: missionState === 'paused'
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
            name: activeMissionName || 'Untitled mission',
            goal: activeMissionGoal || missionGoal || 'Untitled mission',
            teamLabel: currentTeamLabel,
            avatars: team.map((member) => ({ id: member.id, name: member.name })),
            progressText: `${runningTaskStats.completed} / ${runningTaskStats.total}`,
            elapsedText: runningElapsed,
            costText: `$${runningCost.toFixed(2)}`,
            metaChips: [
              processType,
              `${team.length} agents`,
              activeMissionBudgetLimit ? `Budget ${Number((activeMissionBudgetLimit || '').replace(/[^\d]/g, '') || '0').toLocaleString()} tok` : 'No budget',
            ],
            extraMetrics: [
              { label: 'Tasks Left', value: String(Math.max(0, runningTaskStats.total - runningTaskStats.completed)) },
              { label: 'Budget', value: runningBudgetCost !== null ? `$${runningBudgetCost.toFixed(2)}` : 'Unset' },
            ],
            expandedContent: (
              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] text-neutral-500 dark:text-slate-400">
                    <span>Task progress</span>
                    <span>{runningProgressPct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100">
                    <div
                      className="h-2 rounded-full bg-orange-500 transition-all"
                      style={{ width: `${Math.max(6, runningProgressPct)}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">Live agent status</p>
                  {agentWorkingRows.length === 0 ? (
                    <p className="text-[11px] text-neutral-500 dark:text-slate-400">No agent sessions active yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {agentWorkingRows.slice(0, 5).map((row) => (
                        <div key={row.id} className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-2 py-1 text-[10px]">
                          <span className="truncate font-medium text-neutral-800">{row.name}</span>
                          <span className={cn(
                            'ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                            row.status === 'active' && 'bg-emerald-100 text-emerald-700',
                            row.status === 'idle' && 'bg-amber-100 text-amber-700',
                            row.status === 'paused' && 'bg-amber-100 text-amber-700',
                            row.status === 'error' && 'bg-red-100 text-red-700',
                            row.status !== 'active' && row.status !== 'idle' && row.status !== 'paused' && row.status !== 'error' && 'bg-neutral-200 text-neutral-700',
                          )}>
                            {row.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-2 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">Latest agent output</p>
                  <p className="mt-1 line-clamp-3 text-[11px] text-neutral-700">
                    {runningLatestOutput || 'Waiting for agent output...'}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMissionState((prev) => (prev === 'paused' ? 'running' : 'paused'))}
                    className="rounded-md border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-2 py-1 text-[10px] font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    {missionState === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    type="button"
                    onClick={() => stopMissionAndCleanup('aborted')}
                    className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700 hover:bg-red-100"
                  >
                    Stop
                  </button>
                </div>
              </div>
            ),
          }),
        ]
      : []

    const reviewCards = reviewReports.map((entry) =>
      renderCardShell({
        id: `review-${entry.id}`,
        statusLabel: 'Review',
        statusClassName: 'bg-blue-50 text-blue-700 border border-blue-200',
        name: entry.name || 'Untitled mission',
        goal: entry.goal,
        teamLabel: entry.teamName,
        avatars: entry.agents.map((agent) => ({ id: agent.id, name: agent.name })),
        progressText: `${entry.taskStats.completed} / ${entry.taskStats.total}`,
        elapsedText: formatDuration(entry.duration),
        costText: `$${entry.costEstimate.toFixed(2)}`,
        metaChips: [`${entry.agents.length} agents`, `${entry.tokenCount.toLocaleString()} tokens`, `${entry.artifacts.length} artifacts`],
        extraMetrics: [
          { label: 'Completed', value: timeAgoFromMs(entry.completedAt) },
          { label: 'Failed', value: String(entry.taskStats.failed) },
        ],
        extraFooter: (
          <button
            type="button"
            onClick={() => setSelectedReport(entry)}
            className="rounded-md border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-2 py-1 text-[10px] font-medium text-neutral-700 hover:bg-neutral-50"
          >
            View Report
          </button>
        ),
        expandedContent: (
          <div className="space-y-1 text-[11px] text-neutral-600 dark:text-slate-400">
            <p>Completed {timeAgoFromMs(entry.completedAt)}</p>
            <p>Artifacts: {entry.artifacts.length}</p>
            <p className="line-clamp-3">{truncateMissionGoal(entry.report, 220)}</p>
          </div>
        ),
      }),
    )

    const doneCards = doneReports.map((entry) =>
      renderCardShell({
        id: `done-${entry.id}`,
        statusLabel: 'Done',
        statusClassName: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        name: entry.name || 'Untitled mission',
        goal: entry.goal,
        teamLabel: entry.teamName,
        avatars: entry.agents.map((agent) => ({ id: agent.id, name: agent.name })),
        progressText: `${entry.taskStats.completed} / ${entry.taskStats.total}`,
        elapsedText: formatDuration(entry.duration),
        costText: `$${entry.costEstimate.toFixed(2)}`,
        metaChips: [`${entry.agents.length} agents`, `${entry.tokenCount.toLocaleString()} tokens`, `${entry.artifacts.length} artifacts`],
        extraMetrics: [
          { label: 'Completed', value: timeAgoFromMs(entry.completedAt) },
          { label: 'Failed', value: String(entry.taskStats.failed) },
        ],
        extraFooter: (
          <button
            type="button"
            onClick={() => setSelectedReport(entry)}
            className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-orange-700 ring-1 ring-orange-200 hover:bg-orange-50"
          >
            View Report
          </button>
        ),
        expandedContent: (
          <div className="space-y-2 text-[11px] text-neutral-600 dark:text-slate-400">
            <p>Completed {timeAgoFromMs(entry.completedAt)}</p>
            <p>Cost total: ${entry.costEstimate.toFixed(2)}</p>
            <div>
              <p className="font-medium text-neutral-700">Artifacts</p>
              {entry.artifacts.length === 0 ? (
                <p className="text-neutral-500 dark:text-slate-400">No artifacts</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1">
                  {entry.artifacts.slice(0, 5).map((artifact) => (
                    <span key={artifact.id} className="rounded-full border border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-2 py-0.5 text-[10px]">
                      {artifact.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ),
      }),
    )

    const columns: Array<{
      key: string
      title: string
      subtitle: string
      cards: React.ReactNode[]
      accent: string
      tint: string
      emptyIcon: string
      emptyText: string
    }> = [
      { key: 'draft', title: 'Draft', subtitle: 'Configure and stage missions', cards: draftCards, accent: 'bg-neutral-400', tint: 'bg-neutral-50', emptyIcon: '📝', emptyText: 'Create a new mission to get started' },
      { key: 'running', title: 'Running', subtitle: 'Active missions with live status', cards: runningCards, accent: 'bg-emerald-500', tint: 'bg-emerald-50/30', emptyIcon: '🚀', emptyText: 'Missions move here when launched' },
      { key: 'review', title: 'Review', subtitle: 'Completed, awaiting review', cards: reviewCards, accent: 'bg-blue-500', tint: 'bg-blue-50/30', emptyIcon: '👁️', emptyText: 'Completed missions await your review' },
      { key: 'done', title: 'Done', subtitle: 'Archived mission reports', cards: doneCards, accent: 'bg-amber-500', tint: 'bg-amber-50/30', emptyIcon: '🏆', emptyText: 'Archived missions and reports' },
    ]

    return (
      <div className="relative flex h-full min-h-0 flex-col bg-neutral-50 dark:bg-[var(--theme-bg,#0b0e14)]">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Mission Board</h2>
            <p className="text-[11px] text-neutral-500 dark:text-slate-400">Kanban view for mission planning and execution</p>
          </div>
          <button
            type="button"
            onClick={() => openNewMissionModal()}
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-600"
          >
            + New Mission
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="grid min-w-[320px] grid-cols-1 gap-4 sm:min-w-[640px] sm:grid-cols-2 lg:min-w-[1080px] lg:grid-cols-4">
            {columns.map((column) => (
              <section
                key={column.key}
                className={cn('flex min-h-[560px] flex-col rounded-2xl border border-neutral-200 p-3.5 shadow-sm dark:border-slate-700', column.tint || 'bg-white/90 dark:bg-[var(--theme-card,#161b27)]')}
              >
                <div className="mb-3.5">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', column.accent)} />
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{column.title}</h3>
                    <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 dark:text-slate-400">
                      {column.cards.length}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-neutral-500 dark:text-slate-400">{column.subtitle}</p>
                </div>

                <div className="flex-1 space-y-3.5">
                  {column.cards.length > 0 ? column.cards : (
                    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-200 bg-white/60 text-center">
                      <span className="text-2xl">{column.emptyIcon}</span>
                      <p className="text-xs text-neutral-400">{column.emptyText}</p>
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>

        {missionBoardModalOpen ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-900/35 px-4 py-6 backdrop-blur-[1px]"
            onClick={() => setMissionBoardModalOpen(false)}
          >
            <div
              className="flex w-full max-w-2xl flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[var(--theme-card,#161b27)]"
              onClick={(event) => event.stopPropagation()}
            >
              {/* Wizard Step Indicator */}
              <div className="border-b border-neutral-200 px-6 pt-5 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-white">New Mission</h3>
                  <button
                    type="button"
                    onClick={() => { setMissionBoardModalOpen(false); setMissionWizardStep(0) }}
                    className="rounded-md border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-1">
                  {['Scope', 'Team', 'Settings', 'Review'].map((stepLabel, stepIdx) => (
                    <div key={stepLabel} className="flex flex-1 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setMissionWizardStep(stepIdx)}
                        className={cn(
                          'flex size-7 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                          stepIdx === missionWizardStep
                            ? 'bg-orange-500 text-white'
                            : stepIdx < missionWizardStep
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-neutral-100 text-neutral-400',
                        )}
                      >
                        {stepIdx < missionWizardStep ? '✓' : stepIdx + 1}
                      </button>
                      <span className={cn(
                        'text-[11px] font-medium',
                        stepIdx === missionWizardStep ? 'text-neutral-900 dark:text-white' : 'text-neutral-400',
                      )}>
                        {stepLabel}
                      </span>
                      {stepIdx < 3 ? <div className="mx-1 h-px flex-1 bg-neutral-200" /> : null}
                    </div>
                  ))}
                </div>
              </div>

              {/* Step Content */}
              <div className="min-h-[320px] px-6 py-5">
                {/* Step 0: Scope */}
                {missionWizardStep === 0 ? (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-700">Mission Name</span>
                      <input
                        value={newMissionName}
                        onChange={(event) => setNewMissionName(event.target.value)}
                        placeholder="e.g. Q1 competitor analysis"
                        className="mt-1.5 h-10 w-full rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 text-sm text-neutral-900 outline-none ring-orange-400 focus:ring-1"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-700">Goal</span>
                      <textarea
                        value={newMissionGoal}
                        onChange={(event) => setNewMissionGoal(event.target.value)}
                        rows={6}
                        placeholder="Describe the mission goal, output format, and constraints..."
                        className="mt-1.5 w-full resize-y rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm text-neutral-900 outline-none ring-orange-400 focus:ring-1"
                      />
                    </label>
                  </div>
                ) : null}

                {/* Step 1: Team */}
                {missionWizardStep === 1 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-neutral-700">Select a team for this mission</p>
                    <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                      {missionTeamOptions.map((option) => {
                        const teamBudget = getTeamBudgetSummary(option.team)
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setNewMissionTeamConfigId(option.id)}
                            className={cn(
                              'w-full rounded-xl border p-3 text-left transition-colors',
                              newMissionTeamConfigId === option.id
                                ? 'border-orange-300 bg-orange-50/70'
                                : 'border-neutral-200 bg-white hover:border-neutral-300',
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{option.label}</p>
                                <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-slate-400">
                                  {option.team.length} agents
                                  {teamBudget.avgCost !== null ? ` · ~$${teamBudget.avgCost.toFixed(2)}/agent` : ''}
                                </p>
                              </div>
                              {teamBudget.totalCost !== null ? (
                                <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-2 py-0.5 text-[10px] font-semibold text-neutral-700">
                                  ~${teamBudget.totalCost.toFixed(2)}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {option.team.map((member) => (
                                <span key={member.id} className="rounded-full border border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-2 py-0.5 text-[10px] text-neutral-600 dark:text-slate-400">
                                  {member.name} · {getModelDisplayLabelFromLookup(member.modelId, gatewayModelLabelById)}
                                </span>
                              ))}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Step 2: Settings */}
                {missionWizardStep === 2 ? (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-700">Process Type</span>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {(['sequential', 'hierarchical', 'parallel'] as const).map((pt) => (
                          <button
                            key={pt}
                            type="button"
                            onClick={() => setNewMissionProcessType(pt)}
                            className={cn(
                              'rounded-lg border px-3 py-3 text-center transition-colors',
                              newMissionProcessType === pt
                                ? 'border-orange-300 bg-orange-50 text-orange-700'
                                : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300',
                            )}
                          >
                            <p className="text-xs font-semibold capitalize">{pt}</p>
                            <p className="mt-0.5 text-[10px] text-neutral-500 dark:text-slate-400">
                              {pt === 'sequential' ? 'One at a time' : pt === 'hierarchical' ? 'Manager delegates' : 'All at once'}
                            </p>
                          </button>
                        ))}
                      </div>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-700">Token Budget (max)</span>
                      <input
                        value={newMissionBudgetLimit}
                        onChange={(event) => setNewMissionBudgetLimit(event.target.value.replace(/[^\d]/g, ''))}
                        inputMode="numeric"
                        placeholder="120000"
                        className="mt-1.5 h-10 w-full rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 text-sm text-neutral-900 outline-none ring-orange-400 focus:ring-1"
                      />
                      <p className="mt-1 text-[11px] text-neutral-400">
                        {selectedBudgetTokens ? `~$${(selectedTotalBudgetCost ?? 0).toFixed(2)} estimated cost` : 'No budget limit'}
                      </p>
                    </label>
                  </div>
                ) : null}

                {/* Step 3: Review & Launch */}
                {missionWizardStep === 3 ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Launch Summary</h4>
                      <div className="mt-3 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-neutral-600 dark:text-slate-400">Mission</span>
                          <span className="font-medium text-neutral-900 dark:text-white">{newMissionName || 'Untitled'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-neutral-600 dark:text-slate-400">Team</span>
                          <span className="font-medium text-neutral-900 dark:text-white">{selectedMissionTeamMembers.length} agents</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-neutral-600 dark:text-slate-400">Process</span>
                          <span className="font-medium capitalize text-neutral-900 dark:text-white">{newMissionProcessType}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-neutral-600 dark:text-slate-400">Budget</span>
                          <span className="font-medium text-neutral-900 dark:text-white">{selectedBudgetTokens ? `${selectedBudgetTokens.toLocaleString()} tokens (~$${(selectedTotalBudgetCost ?? 0).toFixed(2)})` : 'Unlimited'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">Goal</p>
                      <p className="mt-1 text-xs text-neutral-700">{newMissionGoal || 'No goal set'}</p>
                    </div>
                    <div className="rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">Team Lineup</p>
                      <div className="mt-2 space-y-1">
                        {selectedMissionTeamMembers.map((member) => (
                          <div key={member.id} className="flex items-center justify-between rounded-md bg-neutral-50 dark:bg-slate-800/50 px-2.5 py-1.5">
                            <span className="text-xs font-medium text-neutral-800">{member.name}</span>
                            <span className="text-[10px] text-neutral-500 dark:text-slate-400">{getModelDisplayLabelFromLookup(member.modelId, gatewayModelLabelById)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Wizard Footer */}
              <div className="flex items-center justify-between border-t border-neutral-200 px-6 py-4">
                <button
                  type="button"
                  onClick={() => {
                    if (missionWizardStep === 0) { setMissionBoardModalOpen(false); setMissionWizardStep(0) }
                    else setMissionWizardStep((s) => Math.max(0, s - 1))
                  }}
                  className="rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-4 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  {missionWizardStep === 0 ? 'Cancel' : '← Back'}
                </button>
                <div className="flex gap-2">
                  {missionWizardStep === 3 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => { handleSaveMissionDraft(); setMissionWizardStep(0) }}
                        disabled={!newMissionGoal.trim()}
                        className="rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-4 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                      >
                        Save Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => { handleLaunchMissionFromModal(); setMissionWizardStep(0) }}
                        disabled={!newMissionGoal.trim()}
                        className="rounded-lg bg-orange-500 px-5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:opacity-50"
                      >
                        🚀 Launch Mission
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMissionWizardStep((s) => Math.min(3, s + 1))}
                      className="rounded-lg bg-orange-500 px-5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-600"
                    >
                      Next →
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-[var(--theme-bg,#0b0e14)]">
      {/* ── Brand top accent border ──────────────────────────────────────── */}
      <div className="h-[2px] w-full bg-gradient-to-r from-orange-500 via-orange-400 to-amber-400 shrink-0" />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-5 py-3 dark:border-slate-700 dark:bg-[var(--theme-panel,#111520)]">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="shrink-0 text-base font-semibold tracking-tight text-neutral-900 dark:text-white">Agent Hub</h1>
          <p className="truncate font-mono text-[10px] text-neutral-500 dark:text-slate-500">// Mission Control</p>
        </div>
        {/* Right-side header controls */}
        <div className="flex items-center gap-2">
          {/* Approvals Bell — always visible in header */}
          <ApprovalsBell
            approvals={approvals}
            onApprove={handleApprove}
            onDeny={handleDeny}
          />

          {/* Live View toggle */}
          <button
            type="button"
            onClick={() => {
              setLiveFeedVisible((v) => !v)
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              liveFeedVisible
                ? 'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800/50'
                : 'text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-800 dark:hover:text-neutral-200',
            )}
          >
            <span aria-hidden>📡</span>
            <span>Live View</span>
            {unreadFeedCount > 0 && !liveFeedVisible ? (
              <span className="ml-0.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                {unreadFeedCount > 99 ? '99+' : unreadFeedCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* ── Tab Navigation Bar ────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50/80 px-2 dark:border-slate-700 dark:bg-[var(--theme-panel,#111520)]">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max items-center">
            {TAB_DEFS.map((tab) => {
          const pendingApprovals = tab.id === 'configure'
            ? approvals.filter(a => a.status === 'pending').length
            : 0
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex min-w-[108px] flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-all sm:min-w-[120px] sm:px-4',
                isActive
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-neutral-500 hover:bg-white hover:text-neutral-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white',
              )}
            >
              {/* Active tab: orange bottom highlight */}
              {isActive ? (
                <span className="absolute inset-x-0 bottom-0 h-[2px] bg-orange-500" />
              ) : null}
              <span aria-hidden className="text-base leading-none">{tab.icon}</span>
              <span className="shrink-0 whitespace-nowrap">{tab.label}</span>
              {/* Mission tab: animated running indicator */}
              {tab.id === 'missions' && isMissionRunning ? (
                <span className="relative ml-0.5 flex size-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>
              ) : null}
              {tab.id === 'configure' && pendingApprovals > 0 ? (
                <span className="ml-0.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                  {pendingApprovals > 99 ? '99+' : pendingApprovals}
                </span>
              ) : null}
            </button>
          )
            })}
          </div>
        </div>

        {/* Spacer — approvals moved to header bell */}
        <div className="shrink-0 py-1" />
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Tab content area ── */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            className="h-full min-h-0 bg-white"
            style={{ display: activeTab === 'overview' ? 'block' : 'none' }}
          >
            {renderOverviewContent()}
          </div>

          <div
            className="h-full min-h-0 bg-white"
            style={{ display: activeTab === 'configure' ? 'block' : 'none' }}
          >
            {renderConfigureContent()}
          </div>

          <div
            className="h-full min-h-0 bg-white"
            style={{ display: activeTab === 'missions' ? 'block' : 'none' }}
          >
            {renderMissionsTabContent()}
          </div>
        </div>

        {/* ── Collapsible Live Feed + Approvals + Mission Controls sidebar ── */}
        {liveFeedVisible ? (
          <div className="flex w-72 shrink-0 flex-col border-l border-neutral-200 bg-neutral-50/30">
            {/* Approvals notification area */}
            {approvals.filter((a) => a.status === 'pending').length > 0 ? (
              <div className="border-b border-neutral-200 px-3 py-2.5">
                <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  <span>⚠️ Pending Approvals</span>
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                    {approvals.filter((a) => a.status === 'pending').length}
                  </span>
                </h3>
                <div className="mt-2 space-y-1.5">
                  {approvals.filter((a) => a.status === 'pending').slice(0, 5).map((approval) => (
                    <div key={approval.id} className="rounded-lg border border-amber-200 bg-amber-50/50 px-2.5 py-2">
                      <p className="truncate text-[11px] font-medium text-neutral-800">{approval.agentName}</p>
                      <p className="mt-0.5 line-clamp-1 text-[10px] text-neutral-600 dark:text-slate-400">{approval.action}</p>
                      <div className="mt-1.5 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleApprove(approval.id)}
                          className="rounded-md bg-emerald-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-600"
                        >
                          ✓ Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeny(approval.id)}
                          className="rounded-md border border-red-200 bg-white px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50"
                        >
                          ✕ Deny
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden">
              <LiveFeedPanel />
            </div>

            {/* Mission controls (bottom of sidebar) */}
            <div className="border-t border-neutral-200 px-4 py-3">
              {missionActive ? (
                <>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">
                    Mission Controls
                  </h3>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMissionState('running')}
                      className={cn(
                        'rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
                        missionState === 'running'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
                      )}
                    >
                      Start
                    </button>
                    <button
                      type="button"
                      onClick={() => setMissionState('paused')}
                      className={cn(
                        'rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
                        missionState === 'paused'
                          ? 'bg-amber-500 text-white'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200',
                      )}
                    >
                      Pause
                    </button>
                    <button
                      type="button"
                      onClick={() => stopMissionAndCleanup('aborted')}
                      className="rounded-md bg-red-100 px-2 py-1.5 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-200"
                    >
                      Stop
                    </button>
                  </div>

                  <label className="mt-3 block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">
                      Budget Limit (max tokens)
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={budgetLimit}
                      onChange={(event) => setBudgetLimit(event.target.value)}
                      className="w-full rounded-md border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-2 py-1.5 text-xs text-neutral-900 outline-none ring-orange-400 focus:ring-1"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setAutoAssign((current) => !current)}
                    className="mt-2 flex w-full items-center justify-between rounded-md border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-2 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                  >
                    <span>Auto-assign tasks</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        autoAssign
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-neutral-100 text-neutral-600',
                      )}
                    >
                      {autoAssign ? 'On' : 'Off'}
                    </span>
                  </button>
                </>
              ) : (
                <p className="text-xs text-neutral-400">Start a mission to see controls here</p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Launch wizard ─────────────────────────────────────────────────── */}
      {wizardOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeLaunchWizard}
            aria-hidden
          />
          <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Launch Mission
                </h2>
                <p className="text-[11px] text-neutral-500 dark:text-slate-400">
                  Step {wizardStepIndex + 1} of {WIZARD_STEP_ORDER.length}
                </p>
              </div>
              <button
                type="button"
                onClick={closeLaunchWizard}
                className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>

            <div className="border-b border-neutral-200 px-5 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {WIZARD_STEP_ORDER.map((step, index) => {
                  const label =
                    step === 'gateway'
                      ? 'Gateway'
                      : step === 'team'
                        ? 'Team'
                        : step === 'goal'
                          ? 'Goal'
                          : 'Launch'
                  const active = step === wizardStep
                  const completed = index < wizardStepIndex
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => goToWizardStep(step)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 font-medium transition-colors',
                        active
                          ? 'border-accent-400 bg-accent-50 text-accent-700'
                          : completed
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-neutral-200 bg-white text-neutral-500',
                      )}
                    >
                      {index + 1}. {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
              {wizardStep === 'gateway' ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
                    <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Gateway Connection
                    </p>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                      {wizardCheckingGateway
                        ? 'Checking gateway status...'
                        : gatewayStatus === 'disconnected'
                          ? 'Gateway is offline. Start/connect your gateway before launch.'
                          : 'Gateway connected and ready.'}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          gatewayStatus === 'disconnected'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-emerald-100 text-emerald-700',
                        )}
                      >
                        {gatewayStatus === 'disconnected'
                          ? 'Disconnected'
                          : 'Connected'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setWizardCheckingGateway(true)
                          void refreshGatewayStatus()
                            .then((connected) => {
                              if (connected) {
                                return refreshConfiguredProviders()
                              }
                              setConfiguredProviders([])
                              return Promise.resolve()
                            })
                            .finally(() => setWizardCheckingGateway(false))
                        }}
                        className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-4">
                    <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Provider Profiles
                    </p>
                    {configuredProviders.length === 0 ? (
                      <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                        No configured providers detected yet.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {configuredProviders.map((provider) => (
                          <span
                            key={provider}
                            className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-700"
                          >
                            {provider}
                          </span>
                        ))}
                      </div>
                    )}
                    <a
                      href="/settings/providers"
                      className="mt-3 inline-block text-[11px] font-medium text-accent-600 hover:text-accent-700"
                    >
                      Manage API keys →
                    </a>
                  </div>
                </div>
              ) : null}

              {wizardStep === 'team' ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Choose Team Template
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {TEAM_TEMPLATES.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => applyTemplate(template.id)}
                          className={cn(
                            'rounded-xl border px-3 py-2 text-left text-xs transition-colors',
                            activeTemplateId === template.id
                              ? 'border-accent-400 bg-accent-50 text-accent-700'
                              : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300',
                          )}
                        >
                          <p className="font-semibold">
                            {template.icon} {template.name}
                          </p>
                          <p className="mt-1 text-[11px] opacity-80">
                            {template.agents.length} agents
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Current Team
                    </p>
                    <ul className="mt-2 space-y-1.5 rounded-xl border border-neutral-200 bg-neutral-50/40 p-3">
                      {team.length === 0 ? (
                        <li className="text-xs text-neutral-500 dark:text-slate-400">No agents configured.</li>
                      ) : (
                        team.map((member) => (
                          <li
                            key={member.id}
                            className="truncate text-xs text-neutral-700"
                          >
                            {member.name} · {member.roleDescription || 'No role set'}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>
              ) : null}

              {wizardStep === 'goal' ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Mission Goal
                    </p>
                    <textarea
                      value={missionGoal}
                      onChange={(event) => setMissionGoal(event.target.value)}
                      rows={5}
                      placeholder="Describe the mission outcome and constraints"
                      className="mt-2 w-full resize-none rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm text-neutral-900 outline-none ring-orange-400 focus:ring-1"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {EXAMPLE_MISSIONS.map((example) => (
                        <button
                          key={example.label}
                          type="button"
                          onClick={() => setMissionGoal(example.text)}
                          className="rounded-full border border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-2.5 py-1 text-[11px] text-neutral-600 transition-colors hover:border-accent-400 hover:text-accent-700"
                        >
                          {example.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">
                      Process Type
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'sequential', label: 'Sequential' },
                          { id: 'hierarchical', label: 'Hierarchical' },
                          { id: 'parallel', label: 'Parallel' },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setProcessType(option.id)}
                          className={cn(
                            'rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors',
                            processType === option.id
                              ? 'border-accent-400 bg-accent-50 text-accent-700'
                              : 'border-neutral-200 bg-white text-neutral-600',
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {suggestedTemplateName ? (
                      <p className="mt-2 text-[11px] text-neutral-500 dark:text-slate-400">
                        Suggested template: <span className="font-semibold">{suggestedTemplateName}</span>
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleAutoConfigure}
                      disabled={missionGoal.trim().length === 0}
                      className="mt-2 rounded-md border border-accent-400 px-2.5 py-1 text-[11px] font-medium text-accent-600 transition-colors hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Auto-configure team from goal
                    </button>
                  </div>
                </div>
              ) : null}

              {wizardStep === 'launch' ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/40 p-4">
                    <h3 className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Review
                    </h3>
                    <dl className="mt-2 space-y-1.5 text-xs">
                      <div className="flex gap-2">
                        <dt className="w-24 text-neutral-500 dark:text-slate-400">Gateway</dt>
                        <dd className="text-neutral-800">
                          {gatewayStatus === 'disconnected' ? 'Disconnected' : 'Connected'}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 text-neutral-500 dark:text-slate-400">Team size</dt>
                        <dd className="text-neutral-800">{team.length}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 text-neutral-500 dark:text-slate-400">Process</dt>
                        <dd className="capitalize text-neutral-800">{processType}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 text-neutral-500 dark:text-slate-400">Goal</dt>
                        <dd className="line-clamp-3 text-neutral-800">
                          {missionGoal.trim() || 'No mission goal provided'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3">
              <button
                type="button"
                onClick={() =>
                  setWizardStepIndex((prev) => Math.max(0, prev - 1))
                }
                disabled={wizardStepIndex === 0}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Back
              </button>
              {wizardStep !== 'launch' ? (
                <button
                  type="button"
                  onClick={() =>
                    setWizardStepIndex((prev) =>
                      Math.min(WIZARD_STEP_ORDER.length - 1, prev + 1),
                    )
                  }
                  disabled={
                    (wizardStep === 'gateway' &&
                      (gatewayStatus === 'disconnected' || wizardCheckingGateway)) ||
                    (wizardStep === 'goal' && missionGoal.trim().length === 0)
                  }
                  className="rounded-md bg-accent-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateMission}
                  disabled={missionGoal.trim().length === 0 || dispatchingRef.current || missionActive}
                  className="rounded-md bg-accent-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Launch Mission
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {artifactPreview ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/45"
            onClick={() => setArtifactPreview(null)}
            aria-hidden
          />
          <div className="relative flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{artifactPreview.title}</p>
                <p className="text-[11px] text-neutral-500 dark:text-slate-400">
                  {artifactPreview.agentName} · {artifactPreview.type} · {new Date(artifactPreview.timestamp).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setArtifactPreview(null)}
                className="rounded-md border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-2 py-1 text-[11px] font-medium text-neutral-700"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {artifactPreview.type === 'code' ? (
                <pre className="overflow-x-auto rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-800">
                  <code>{artifactPreview.content}</code>
                </pre>
              ) : (
                <Markdown className="prose prose-sm max-w-none text-neutral-900 [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-neutral-200 [&_pre]:bg-neutral-50">
                  {artifactPreview.content}
                </Markdown>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selectedReport ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSelectedReport(null)}
            aria-hidden
          />
          <div className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-neutral-300 bg-white shadow-2xl">
            <div className="border-b border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold tracking-tight text-neutral-900 dark:text-white">Mission Report</h2>
                  <p className="mt-1 truncate text-sm text-neutral-700">{truncateMissionGoal(selectedReport.goal, 140)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500 dark:text-slate-400">
                    <span>{new Date(selectedReport.completedAt).toLocaleString()}</span>
                    <span>•</span>
                    <span>{selectedReport.teamName}</span>
                    <span>•</span>
                    <span>{selectedReport.taskStats.completed}/{selectedReport.taskStats.total} tasks</span>
                    <span>•</span>
                    <span>{selectedReport.tokenCount.toLocaleString()} tok</span>
                    <span>•</span>
                    <span>${selectedReport.costEstimate.toFixed(2)} est.</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  className="rounded-md border border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-2.5 py-1.5 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 p-5">
              <div className="mx-auto max-w-4xl rounded-2xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-6 shadow-sm">
                <div className="mb-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">Duration</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">{formatDuration(selectedReport.duration)}</p>
                  </div>
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">Tasks</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">
                      {selectedReport.taskStats.completed}/{selectedReport.taskStats.total}
                    </p>
                  </div>
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">Artifacts</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">{selectedReport.artifacts.length}</p>
                  </div>
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">Cost Est.</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">${selectedReport.costEstimate.toFixed(2)}</p>
                  </div>
                </div>
                <Markdown className="prose prose-sm max-w-none text-neutral-900 [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-neutral-200 [&_pre]:bg-neutral-50">
                  {selectedReport.report}
                </Markdown>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Mobile: Agent Output Bottom Sheet ──────────────────────────────── */}
      {isMobileHub && missionActive && selectedOutputAgentId ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSelectedOutputAgentId(undefined)}
            aria-hidden
          />
          {/* Sheet */}
          <div className="relative flex max-h-[90vh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 p-3">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                {selectedOutputAgentName} Output
              </h3>
              <button
                type="button"
                onClick={() => setSelectedOutputAgentId(undefined)}
                className="flex size-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Close agent output"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AgentOutputPanel
                agentName={selectedOutputAgentName}
                sessionKey={selectedOutputAgentId ? agentSessionMap[selectedOutputAgentId] ?? null : null}
                tasks={selectedOutputTasks}
                onClose={() => setSelectedOutputAgentId(undefined)}
                modelId={selectedOutputModelId}
                statusLabel={selectedOutputStatusLabel}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Mobile: Bottom Tab Nav ─────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur-sm md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex">
          {TAB_DEFS.map((tab) => {
            const pendingApprovals = tab.id === 'configure'
              ? approvals.filter(a => a.status === 'pending').length
              : 0
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex flex-1 flex-col items-center justify-center py-2.5 text-[10px] font-medium transition-colors',
                  activeTab === tab.id
                    ? 'text-orange-600'
                    : 'text-neutral-500 hover:text-neutral-800',
                )}
              >
                <span className="text-base leading-none" aria-hidden>{tab.icon}</span>
                <span className="mt-0.5">{tab.label}</span>
                {tab.id === 'missions' && isMissionRunning ? (
                  <span className="absolute right-3 top-1.5 flex size-1.5">
                    <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                  </span>
                ) : null}
                {tab.id === 'configure' && pendingApprovals > 0 ? (
                  <span className="absolute right-2 top-1 rounded-full bg-orange-500 px-1 text-[8px] font-bold text-white leading-tight">
                    {pendingApprovals > 9 ? '9+' : pendingApprovals}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
