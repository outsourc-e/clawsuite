'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { TeamMember, TeamTemplateId } from './team-panel'
import { TEAM_TEMPLATES } from './team-panel'

// ─── Provider metadata ────────────────────────────────────────────────────────

/** SimpleIcons slug for each provider key (used for CDN logos). */
const SIMPLEICONS_SLUGS: Record<string, string> = {
  anthropic:          'anthropic',
  openai:             'openai',
  'openai-codex':     'openai',
  'github-copilot':   'githubcopilot',
  google:             'google',
  'google-antigravity': 'google',
  deepseek:           'deepseek',
  mistral:            'mistral',
  groq:               'groq',
  ollama:             'ollama',
  perplexity:         'perplexity',
  cohere:             'cohere',
  xai:                'x',
  together:           'togetherai',
  fireworks:          'fireworks',
  openrouter:         'openrouter',
}

/** Branded hex color per provider (passed to simpleicons CDN for colored SVGs). */
const PROVIDER_HEX: Record<string, string> = {
  anthropic:          'D97757',
  openai:             '10A37F',
  'openai-codex':     '10A37F',
  'github-copilot':   '6E40C9',
  google:             '4285F4',
  'google-antigravity': '4285F4',
  deepseek:           '4D6BFE',
  mistral:            'F7501E',
  groq:               'F55036',
  ollama:             '000000',
  perplexity:         '20808D',
  cohere:             '39594D',
  xai:                '000000',
  together:           'FF6BFF',
  fireworks:          'FF4500',
  openrouter:         '6467F2',
  minimax:            '7B2FBE',
}

export const PROVIDER_META: Record<string, {
  label: string
  emoji: string
  color: string
  bg: string
  border: string
  description: string
}> = {
  anthropic:          { label: 'Anthropic',       emoji: '🟠', color: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-50 dark:bg-orange-900/20',   border: 'border-orange-300',   description: 'Claude models' },
  openai:             { label: 'OpenAI',           emoji: '🟢', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-300',  description: 'GPT & o-series' },
  'openai-codex':     { label: 'OpenAI Codex',     emoji: '🟢', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-300',  description: 'Codex models' },
  'github-copilot':   { label: 'GitHub Copilot',   emoji: '⚫', color: 'text-neutral-700 dark:text-neutral-300', bg: 'bg-neutral-100 dark:bg-neutral-800',   border: 'border-neutral-400',  description: 'Copilot via GitHub' },
  google:             { label: 'Google',           emoji: '🔵', color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-900/20',       border: 'border-blue-300',     description: 'Gemini models' },
  'google-antigravity': { label: 'Google AG',      emoji: '🔵', color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-900/20',       border: 'border-blue-300',     description: 'Gemini experimental' },
  deepseek:           { label: 'DeepSeek',         emoji: '🐋', color: 'text-sky-600 dark:text-sky-400',         bg: 'bg-sky-50 dark:bg-sky-900/20',         border: 'border-sky-300',      description: 'DeepSeek R-series' },
  minimax:            { label: 'MiniMax',          emoji: '🟣', color: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-50 dark:bg-violet-900/20',   border: 'border-violet-300',   description: 'M-series models' },
  openrouter:         { label: 'OpenRouter',       emoji: '🌐', color: 'text-indigo-600 dark:text-indigo-400',   bg: 'bg-indigo-50 dark:bg-indigo-900/20',   border: 'border-indigo-300',   description: 'Multi-provider routing' },
  mistral:            { label: 'Mistral',          emoji: '🔴', color: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-50 dark:bg-rose-900/20',       border: 'border-rose-300',     description: 'Mistral models' },
  xai:                { label: 'xAI',              emoji: '⚡', color: 'text-neutral-800 dark:text-neutral-100', bg: 'bg-neutral-100 dark:bg-neutral-800',   border: 'border-neutral-400',  description: 'Grok models' },
  groq:               { label: 'Groq',             emoji: '⚡', color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-900/20',     border: 'border-amber-300',    description: 'Ultra-fast inference' },
  ollama:             { label: 'Ollama',           emoji: '🦙', color: 'text-teal-600 dark:text-teal-400',       bg: 'bg-teal-50 dark:bg-teal-900/20',       border: 'border-teal-300',     description: 'Local models' },
  together:           { label: 'Together AI',      emoji: '🤝', color: 'text-pink-600 dark:text-pink-400',       bg: 'bg-pink-50 dark:bg-pink-900/20',       border: 'border-pink-300',     description: 'Together inference' },
  fireworks:          { label: 'Fireworks',        emoji: '🎆', color: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-50 dark:bg-orange-900/20',   border: 'border-orange-300',   description: 'Fast open models' },
  perplexity:         { label: 'Perplexity',       emoji: '🔮', color: 'text-purple-600 dark:text-purple-400',   bg: 'bg-purple-50 dark:bg-purple-900/20',   border: 'border-purple-300',   description: 'Search-augmented AI' },
  cohere:             { label: 'Cohere',           emoji: '🌊', color: 'text-cyan-600 dark:text-cyan-400',       bg: 'bg-cyan-50 dark:bg-cyan-900/20',       border: 'border-cyan-300',     description: 'Command R series' },
}

export function getProviderMeta(provider: string) {
  const key = provider.toLowerCase()
  return PROVIDER_META[key] ?? {
    label: provider,
    emoji: '🔑',
    color: 'text-neutral-600 dark:text-neutral-400',
    bg: 'bg-neutral-100 dark:bg-neutral-800',
    border: 'border-neutral-300',
    description: 'Custom provider',
  }
}

// ─── Provider Logo component ──────────────────────────────────────────────────

/**
 * Renders the real provider logo from SimpleIcons CDN.
 * Falls back to the emoji if the image fails to load or no slug is known.
 */
export function ProviderLogo({ provider, size = 28 }: { provider: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const key = provider.toLowerCase()
  const meta = getProviderMeta(provider)
  const slug = SIMPLEICONS_SLUGS[key]
  const hex = PROVIDER_HEX[key]

  if (!failed && slug) {
    const src = hex
      ? `https://cdn.simpleicons.org/${slug}/${hex}`
      : `https://cdn.simpleicons.org/${slug}`
    return (
      <img
        src={src}
        alt={meta.label}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        style={{ width: size, height: size, objectFit: 'contain' }}
        draggable={false}
      />
    )
  }

  // Fallback: branded letter abbreviation
  const letters = provider.slice(0, 2).toUpperCase()
  return (
    <span className={cn('font-bold text-sm leading-none', meta.color)} style={{ fontSize: Math.max(10, size * 0.4) }}>
      {letters}
    </span>
  )
}

// ─── Shared Modal wrapper ─────────────────────────────────────────────────────

function WizardModal({
  open,
  onClose,
  children,
  width = 'max-w-xl',
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop — clicking this closes the modal */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel — clicks inside stay inside */}
      <div
        className={cn(
          'relative w-full rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-2xl',
          'max-h-[90vh] overflow-y-auto',
          width,
        )}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">{children}</span>
}

const INPUT_CLS = 'h-9 w-full rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 px-3 text-sm text-neutral-900 dark:text-white outline-none ring-orange-400 focus:ring-1 transition-colors'
const SELECT_CLS = 'h-9 w-full rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 px-3 text-sm text-neutral-900 dark:text-white outline-none ring-orange-400 focus:ring-1'

// ─── AgentWizardModal ─────────────────────────────────────────────────────────

type AgentWizardProps = {
  member: TeamMember & { avatar?: number; backstory: string; roleDescription: string }
  memberIndex: number
  accentBorderClass: string
  /** Pre-rendered avatar node (includes the avatar + pencil button for changing it) */
  avatarNode: React.ReactNode
  gatewayModels: Array<{ value: string; label: string; provider: string }>
  modelPresets: Array<{ id: string; label: string }>
  systemPromptTemplates: Array<{ id: string; label: string; icon: string; category: string; prompt: string }>
  onUpdate: (updates: Partial<TeamMember & { avatar?: number; backstory: string; roleDescription: string }>) => void
  onDelete: () => void
  onClose: () => void
}

export function AgentWizardModal({
  member,
  memberIndex,
  accentBorderClass,
  avatarNode,
  gatewayModels,
  modelPresets,
  systemPromptTemplates,
  onUpdate,
  onDelete,
  onClose,
}: AgentWizardProps) {
  const isCustomPrompt = member.backstory.trim() !== '' && !systemPromptTemplates.some((t) => t.prompt === member.backstory)

  return (
    <WizardModal open onClose={onClose} width="max-w-2xl">
      {/* Header */}
      <div className={cn('flex items-center gap-4 border-b border-neutral-100 dark:border-neutral-800 px-6 py-5 border-l-4', accentBorderClass)}>
        {/* Avatar slot (rendered by parent to avoid circular import) */}
        {avatarNode}
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-neutral-900 dark:text-white">{member.name || `Agent ${memberIndex + 1}`}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Agent {memberIndex + 1}</p>
        </div>
        <button type="button" onClick={onClose}
          className="flex size-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:hover:text-white transition-colors">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* Form body */}
      <div className="px-6 py-5 space-y-4">
        {/* Name + Model + Role row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <FieldLabel>Name</FieldLabel>
            <input value={member.name} onChange={(e) => onUpdate({ name: e.target.value })} className={INPUT_CLS} />
          </div>
          <div>
            <FieldLabel>Model</FieldLabel>
            <select value={member.modelId} onChange={(e) => onUpdate({ modelId: e.target.value })} className={SELECT_CLS}>
              <optgroup label="Presets">
                {modelPresets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </optgroup>
              {gatewayModels.length > 0 ? (
                <optgroup label="Available Models">
                  {gatewayModels.map((m) => <option key={m.value} value={m.value}>{m.label} ({m.provider})</option>)}
                </optgroup>
              ) : null}
            </select>
          </div>
          <div>
            <FieldLabel>Role</FieldLabel>
            <input value={member.roleDescription} onChange={(e) => onUpdate({ roleDescription: e.target.value })} className={INPUT_CLS} />
          </div>
        </div>

        {/* System Prompt */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <FieldLabel>System Prompt</FieldLabel>
            <div className="flex gap-1.5">
              <span className={cn('rounded-md border px-1.5 py-0.5 text-[9px] font-semibold',
                isCustomPrompt ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-400'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-400')}>
                {isCustomPrompt ? '✏️ Custom' : 'Template'}
              </span>
              {member.backstory.trim() ? (
                <button type="button" onClick={() => onUpdate({ backstory: '' })}
                  className="rounded-md border border-neutral-200 dark:border-neutral-700 px-1.5 py-0.5 text-[9px] text-neutral-400 hover:text-red-500 transition-colors">
                  ✕ Clear
                </button>
              ) : null}
            </div>
          </div>

          {/* Template pills by category */}
          {(['engineering', 'research', 'content', 'ops', 'general'] as const).map((cat) => {
            const catTemplates = systemPromptTemplates.filter((t) => t.category === cat)
            const catLabels: Record<string, string> = { engineering: '⚙️ Eng', research: '🔬 Research', content: '📝 Content', ops: '🗺️ Ops', general: '🤖 General' }
            return (
              <div key={cat} className="flex flex-wrap items-center gap-1 mb-1">
                <span className="shrink-0 w-16 text-[9px] font-bold uppercase tracking-widest text-neutral-300 dark:text-neutral-600">{catLabels[cat]}</span>
                {catTemplates.map((tpl) => {
                  const active = member.backstory === tpl.prompt
                  return (
                    <button key={tpl.id} type="button"
                      onClick={() => onUpdate({ backstory: active ? '' : tpl.prompt })}
                      className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                        active ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
                          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700')}
                      title={tpl.prompt.slice(0, 120)}
                    >
                      {tpl.icon} {tpl.label}
                    </button>
                  )
                })}
              </div>
            )
          })}

          <textarea
            value={member.backstory}
            onChange={(e) => onUpdate({ backstory: e.target.value })}
            rows={6}
            className="mt-2 min-h-[120px] w-full resize-y rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 px-3 py-2.5 text-xs text-neutral-900 dark:text-white outline-none ring-orange-400 focus:ring-1 font-mono leading-relaxed"
            placeholder="Persona, instructions, and context for this agent..."
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-neutral-100 dark:border-neutral-800 px-6 py-4">
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800/50 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Remove Agent
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors"
        >
          ✓ Done
        </button>
      </div>
    </WizardModal>
  )
}

// ─── Team icon picker ─────────────────────────────────────────────────────────

const TEAM_ICONS = [
  '👥', '🚀', '⚡', '🔥', '🎯', '💡', '🛡️', '⚙️', '🔬', '📊',
  '🎨', '🏗️', '🧠', '💼', '🦾', '🌐', '🏆', '✨', '🤖', '🔐',
  '🧩', '🎓', '💪', '🌟', '🦅', '🎭', '🧬', '📡', '🏋️', '🌊',
  '🎪', '🔭', '💎', '🌈', '🐉', '🦁', '🐺', '🦊', '🐝', '🦋',
]

function TeamIconPicker({
  currentIcon,
  onSelect,
  onClose,
}: {
  currentIcon: string
  onSelect: (icon: string) => void
  onClose: () => void
}) {
  return (
    <div className="absolute left-0 top-full mt-1 z-[60] rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-2 w-52">
      <div className="grid grid-cols-8 gap-0.5">
        {TEAM_ICONS.map((icon) => (
          <button
            key={icon}
            type="button"
            onClick={() => { onSelect(icon); onClose() }}
            className={cn(
              'flex size-7 items-center justify-center rounded-md text-base transition-all hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:scale-110',
              currentIcon === icon ? 'bg-orange-50 dark:bg-orange-900/20 ring-1 ring-orange-400' : '',
            )}
          >
            {icon}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── TeamWizardModal (edit existing team) ────────────────────────────────────

type TeamWizardProps = {
  teamId: string
  teamName: string
  teamIcon: string
  teamMembers: Array<{ id: string; name: string; modelId: string }>
  isActive: boolean
  onRename: (name: string) => void
  onUpdateIcon: (icon: string) => void
  onLoad: () => void
  onDelete: () => void
  onClose: () => void
}

export function TeamWizardModal({
  teamId: _teamId,
  teamName,
  teamIcon,
  teamMembers,
  isActive,
  onRename,
  onUpdateIcon,
  onLoad,
  onDelete,
  onClose,
}: TeamWizardProps) {
  const [name, setName] = useState(teamName)
  const [icon, setIcon] = useState(teamIcon || '👥')
  const [showIconPicker, setShowIconPicker] = useState(false)

  const accentColors = [
    'border-orange-400',
    'border-blue-400',
    'border-emerald-400',
    'border-violet-400',
  ]
  const accentBorder = isActive ? accentColors[0] : accentColors[1]

  function handleSave() {
    onRename(name)
    onUpdateIcon(icon)
    onClose()
  }

  return (
    <WizardModal open onClose={onClose} width="max-w-lg">
      {/* Header — matches agent wizard style */}
      <div className={cn('flex items-center gap-4 border-b border-neutral-100 dark:border-neutral-800 px-6 py-5 border-l-4', accentBorder)}>
        {/* Team icon with pencil */}
        <div className="relative shrink-0">
          <div className="flex size-14 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-3xl shadow-sm">
            {icon}
          </div>
          <button
            type="button"
            onClick={() => setShowIconPicker((v) => !v)}
            className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-white dark:border-neutral-900 bg-neutral-700 text-white shadow-md hover:bg-neutral-600 transition-colors"
            title="Change icon"
          >
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          {showIconPicker ? (
            <TeamIconPicker
              currentIcon={icon}
              onSelect={(newIcon) => { setIcon(newIcon); setShowIconPicker(false) }}
              onClose={() => setShowIconPicker(false)}
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-neutral-900 dark:text-white">{name || 'Untitled Team'}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{teamMembers.length} agent{teamMembers.length !== 1 ? 's' : ''}</p>
        </div>
        <button type="button" onClick={onClose}
          className="flex size-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:hover:text-white transition-colors">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </button>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Active / Set main team */}
        {isActive ? (
          <div className="flex items-center gap-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 px-3 py-2.5">
            <span className="size-2 rounded-full bg-orange-500 shrink-0" />
            <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">Currently active team</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { onLoad(); onClose() }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-200 dark:border-neutral-700 px-3 py-2.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400 hover:border-orange-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50/30 dark:hover:bg-orange-900/10 transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Set as Active Team
          </button>
        )}

        {/* Team name */}
        <div>
          <FieldLabel>Team Name</FieldLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLS} />
        </div>

        {/* Agents list */}
        <div>
          <FieldLabel>Agents ({teamMembers.length})</FieldLabel>
          <div className="space-y-1.5">
            {teamMembers.map((m, idx) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[10px] font-bold text-neutral-600 dark:text-neutral-300">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-100 truncate">{m.name}</p>
                  <p className="text-[10px] text-neutral-400 truncate">{m.modelId}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-100 dark:border-neutral-800 px-6 py-4">
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800/50 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Delete Team
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
        >
          ✓ Save
        </button>
      </div>
    </WizardModal>
  )
}

// ─── AddTeamModal ─────────────────────────────────────────────────────────────

type AddTeamModalProps = {
  currentTeam: Array<{ id: string; name: string; modelId: string }>
  quickStartTemplates: Array<{
    id: string; icon: string; label: string; description: string;
    tier: string; agents: string[]; templateId?: string
  }>
  onSaveCurrentAs: (name: string) => void
  onApplyTemplate: (templateId: TeamTemplateId) => void
  onClose: () => void
}

export function AddTeamModal({ currentTeam, quickStartTemplates, onSaveCurrentAs, onApplyTemplate, onClose }: AddTeamModalProps) {
  const [step, setStep] = useState<'choose' | 'name'>('choose')
  const [newName, setNewName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  function handleSave() {
    if (!newName.trim()) return
    if (selectedTemplate) {
      const tpl = quickStartTemplates.find((t) => t.id === selectedTemplate)
      if (tpl?.templateId && tpl.templateId in TEAM_TEMPLATES) {
        onApplyTemplate(tpl.templateId as TeamTemplateId)
      }
    }
    onSaveCurrentAs(newName.trim())
    onClose()
  }

  return (
    <WizardModal open onClose={onClose} width="max-w-lg">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-neutral-100 dark:border-neutral-800 px-6 py-5 border-l-4 border-l-orange-400">
        <div className="flex size-12 items-center justify-center rounded-full bg-orange-50 dark:bg-orange-900/20 text-2xl shadow-sm">
          {step === 'choose' ? '👥' : '✏️'}
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-neutral-900 dark:text-white">
            {step === 'choose' ? 'New Team' : 'Name Your Team'}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {step === 'choose' ? 'Start from a template or save your current agents' : 'Give this team a name to save it'}
          </p>
        </div>
        <button type="button" onClick={onClose}
          className="flex size-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:hover:text-white transition-colors">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </button>
      </div>

      {step === 'choose' ? (
        <div className="px-6 py-5">
          {/* Current team option */}
          <div className="mb-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Current Configuration</p>
            <button
              type="button"
              onClick={() => { setSelectedTemplate(null); setStep('name') }}
              className="w-full rounded-xl border-2 border-neutral-200 dark:border-neutral-700 p-3 text-left transition-all hover:border-orange-400 hover:bg-orange-50/30 dark:hover:bg-orange-900/10 hover:shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">✨</span>
                <div>
                  <p className="text-xs font-semibold text-neutral-900 dark:text-white">Save current team</p>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    {currentTeam.length} agents: {currentTeam.slice(0, 3).map((m) => m.name).join(', ')}{currentTeam.length > 3 ? `…` : ''}
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* Templates */}
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Quick-Start Templates</p>
          <div className="grid grid-cols-2 gap-2">
            {quickStartTemplates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => { setSelectedTemplate(tpl.id); setStep('name'); setNewName(tpl.label) }}
                className={cn('rounded-xl border-2 p-3 text-left transition-all hover:shadow-sm',
                  selectedTemplate === tpl.id ? 'border-orange-400 bg-orange-50/30 dark:bg-orange-900/10' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300')}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span>{tpl.icon}</span>
                  <p className="text-xs font-semibold text-neutral-900 dark:text-white">{tpl.label}</p>
                </div>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-1.5">{tpl.description}</p>
                <div className="flex flex-wrap gap-1">
                  {tpl.agents.slice(0, 3).map((a) => (
                    <span key={a} className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[9px] text-neutral-500">{a}</span>
                  ))}
                  {tpl.agents.length > 3 ? <span className="text-[9px] text-neutral-400">+{tpl.agents.length - 3}</span> : null}
                </div>
                <div className="mt-1.5">
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                    tpl.tier === 'budget' ? 'bg-green-50 text-green-700' : tpl.tier === 'balanced' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700')}>
                    {tpl.tier === 'budget' ? '💰 Budget' : tpl.tier === 'balanced' ? '⚖️ Balanced' : '🚀 Max'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-6 py-5">
          <button type="button" onClick={() => setStep('choose')} className="flex items-center gap-1 mb-4 text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7 2L3 6l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back
          </button>
          <FieldLabel>Team Name</FieldLabel>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            placeholder="e.g. Research Squad, Dev Team..."
            autoFocus
            className={INPUT_CLS}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-neutral-100 dark:border-neutral-800 px-6 py-4">
        <button type="button" onClick={onClose} className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
          Cancel
        </button>
        {step === 'name' ? (
          <button type="button" onClick={handleSave} disabled={!newName.trim()}
            className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
            Create Team
          </button>
        ) : null}
      </div>
    </WizardModal>
  )
}

// ─── ProviderEditModal ────────────────────────────────────────────────────────

type ProviderEditModalProps = {
  provider: string
  currentModels: Array<{ value: string; label: string; provider: string }>
  availableModels: Array<{ value: string; label: string; provider: string }>
  onSave: (apiKey: string, defaultModel: string) => void
  onClose: () => void
}

export function ProviderEditModal({ provider, currentModels, availableModels, onSave, onClose }: ProviderEditModalProps) {
  const [apiKey, setApiKey] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const meta = getProviderMeta(provider)

  return (
    <WizardModal open onClose={onClose} width="max-w-md">
      {/* Header — branded with provider logo + accent border */}
      <div className={cn('flex items-center gap-4 border-b border-neutral-100 dark:border-neutral-800 px-6 py-5 border-l-4', meta.border)}>
        <div className={cn('flex size-14 shrink-0 items-center justify-center rounded-full shadow-sm', meta.bg)}>
          <ProviderLogo provider={provider} size={32} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-neutral-900 dark:text-white">{meta.label}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{meta.description}</p>
          {currentModels.length > 0 ? (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                {currentModels.length} model{currentModels.length !== 1 ? 's' : ''} active
              </span>
            </div>
          ) : null}
        </div>
        <button type="button" onClick={onClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:hover:text-white transition-colors">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </button>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Current models list */}
        {currentModels.length > 0 ? (
          <div>
            <FieldLabel>Available Models</FieldLabel>
            <div className="rounded-lg border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 p-2 max-h-36 overflow-y-auto">
              {currentModels.map((m) => (
                <div key={m.value} className="flex items-center gap-2 px-1 py-1">
                  <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Default model picker */}
        {availableModels.length > 0 ? (
          <div>
            <FieldLabel>Default Model</FieldLabel>
            <select value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} className={SELECT_CLS}>
              <option value="">Use gateway default</option>
              {availableModels.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        ) : null}

        {/* API key update */}
        <div>
          <FieldLabel>
            Update API Key{' '}
            <span className="font-normal normal-case text-neutral-300 dark:text-neutral-600">— leave blank to keep current</span>
          </FieldLabel>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="New API key…"
            className={cn(INPUT_CLS, 'font-mono')}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-neutral-100 dark:border-neutral-800 px-6 py-4">
        <button type="button" onClick={onClose}
          className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => { onSave(apiKey, defaultModel); onClose() }}
          className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
        >
          Update Provider
        </button>
      </div>
    </WizardModal>
  )
}
