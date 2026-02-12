import { HugeiconsIcon } from '@hugeicons/react'
import {
  CheckmarkCircle02Icon,
  CloudIcon,
  ComputerIcon,
  MessageMultiple01Icon,
  Moon01Icon,
  Notification03Icon,
  PaintBoardIcon,
  Settings02Icon,
  SourceCodeSquareIcon,
  Sun01Icon,
  UserIcon,
} from '@hugeicons/core-free-icons'
import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import type * as React from 'react'
import type {AccentColor, SettingsThemeMode} from '@/hooks/use-settings';
import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import {
  
  
  applyTheme,
  useSettings
} from '@/hooks/use-settings'
import { cn } from '@/lib/utils'
import {
  getChatProfileDisplayName,
  useChatSettingsStore,
} from '@/hooks/use-chat-settings'
import type { LoaderStyle } from '@/hooks/use-chat-settings'
import { UserAvatar } from '@/components/avatars'
import { Input } from '@/components/ui/input'
import { LogoLoader } from '@/components/logo-loader'
import { BrailleSpinner } from '@/components/ui/braille-spinner'
import type { BrailleSpinnerPreset } from '@/components/ui/braille-spinner'
import { ThreeDotsSpinner } from '@/components/ui/three-dots-spinner'

export const Route = createFileRoute('/settings/')({
  component: SettingsRoute,
})

type SectionProps = {
  title: string
  description: string
  icon: React.ComponentProps<typeof HugeiconsIcon>['icon']
  children: React.ReactNode
}

function SettingsSection({ title, description, icon, children }: SectionProps) {
  return (
    <section className="rounded-2xl border border-primary-200 bg-primary-50/80 p-4 shadow-sm backdrop-blur-xl md:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-xl border border-primary-200 bg-primary-100/70">
          <HugeiconsIcon icon={icon} size={20} strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-medium text-primary-900 text-balance">{title}</h2>
          <p className="text-sm text-primary-600 text-pretty">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

type RowProps = {
  label: string
  description?: string
  children: React.ReactNode
}

function SettingsRow({ label, description, children }: RowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary-900 text-balance">{label}</p>
        {description ? (
          <p className="text-xs text-primary-600 text-pretty">{description}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function SettingsRoute() {
  usePageTitle('Settings')
  const { settings, updateSettings } = useSettings()
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'testing' | 'connected' | 'failed'
  >('idle')

  // Phase 4.2: Fetch models for preferred model dropdowns
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; label: string }>>([])
  
  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await fetch('/api/models')
        if (!res.ok) return
        const data = await res.json()
        const models = Array.isArray(data.models) ? data.models : []
        setAvailableModels(
          models.map((m: any) => ({
            id: m.id || '',
            label: m.id?.split('/').pop() || m.id || '',
          }))
        )
      } catch {
        // Ignore fetch errors
      }
    }
    void fetchModels()
  }, [])

  async function handleTestConnection() {
    setConnectionStatus('testing')

    try {
      const response = await fetch('/api/ping')
      setConnectionStatus(response.ok ? 'connected' : 'failed')
    } catch {
      setConnectionStatus('failed')
    }
  }

  function handleThemeChange(value: string) {
    const theme = value as SettingsThemeMode
    applyTheme(theme)
    updateSettings({ theme })
  }

  function getAccentBadgeClass(color: AccentColor): string {
    if (color === 'orange') return 'bg-accent-500'
    if (color === 'purple') return 'bg-purple-500'
    if (color === 'blue') return 'bg-blue-500'
    return 'bg-green-500'
  }

  function getConnectionDotClass(): string {
    if (connectionStatus === 'connected') return 'bg-green-500'
    if (connectionStatus === 'failed') return 'bg-red-500'
    if (connectionStatus === 'testing') return 'bg-accent-500'
    return 'bg-primary-500'
  }

  return (
    <div className="min-h-screen bg-surface text-primary-900">
      <div className="pointer-events-none fixed inset-0 bg-radial from-primary-400/20 via-transparent to-transparent" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-primary-100/25 via-transparent to-primary-300/20" />

      <main className="relative mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6 lg:py-8">
        <header className="rounded-2xl border border-primary-200 bg-primary-50/85 p-4 shadow-sm backdrop-blur-xl md:p-5">
          <h1 className="text-xl font-medium text-primary-900 text-balance">Settings</h1>
          <p className="text-sm text-primary-600 text-pretty">
            Configure gateway connection, theme, editor behavior, and notifications.
          </p>
        </header>

        <SettingsSection
          title="Gateway Connection"
          description="Set your gateway endpoint and verify connectivity."
          icon={CloudIcon}
        >
          <SettingsRow
            label="Gateway URL"
            description="Used by ClawSuite for provider connectivity checks."
          >
            <input
              type="url"
              placeholder="https://api.openclaw.ai"
              value={settings.gatewayUrl}
              onChange={function onGatewayChange(event) {
                updateSettings({ gatewayUrl: event.target.value })
              }}
              className="h-9 w-full min-w-[220px] rounded-lg border border-primary-200 bg-primary-50 px-3 text-sm text-primary-900 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary-400"
            />
          </SettingsRow>

          <SettingsRow label="Connection status" description="Current gateway reachability check state.">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium',
                connectionStatus === 'connected' &&
                  'border-green-500/35 bg-green-500/10 text-green-500',
                connectionStatus === 'failed' && 'border-red-500/35 bg-red-500/10 text-red-500',
                connectionStatus === 'testing' &&
                  'border-accent-500/35 bg-accent-500/10 text-accent-500',
                connectionStatus === 'idle' &&
                  'border-primary-300 bg-primary-100 text-primary-700',
              )}
            >
              <span className={cn('size-2 rounded-full', getConnectionDotClass())} />
              {connectionStatus === 'idle' ? 'Not tested' : null}
              {connectionStatus === 'testing' ? 'Testing...' : null}
              {connectionStatus === 'connected' ? 'Connected' : null}
              {connectionStatus === 'failed' ? 'Failed' : null}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={function onTestConnection() {
                void handleTestConnection()
              }}
              disabled={connectionStatus === 'testing'}
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={20} strokeWidth={1.5} />
              Test
            </Button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection
          title="Appearance"
          description="Choose app theme and accent color."
          icon={PaintBoardIcon}
        >
          <SettingsRow label="Theme" description="Apply light, dark, or follow system preference.">
            <Tabs value={settings.theme} onValueChange={handleThemeChange}>
              <TabsList variant="default" className="gap-1">
                <TabsTab value="system">
                  <HugeiconsIcon icon={ComputerIcon} size={20} strokeWidth={1.5} />
                  <span>System</span>
                </TabsTab>
                <TabsTab value="light">
                  <HugeiconsIcon icon={Sun01Icon} size={20} strokeWidth={1.5} />
                  <span>Light</span>
                </TabsTab>
                <TabsTab value="dark">
                  <HugeiconsIcon icon={Moon01Icon} size={20} strokeWidth={1.5} />
                  <span>Dark</span>
                </TabsTab>
              </TabsList>
            </Tabs>
          </SettingsRow>

          <SettingsRow label="Accent color" description="Select the primary accent for controls and highlights.">
            <div className="flex flex-wrap gap-2">
              {(['orange', 'purple', 'blue', 'green'] as const).map(function mapAccent(
                color,
              ) {
                const active = settings.accentColor === color
                return (
                  <Button
                    key={color}
                    variant="ghost"
                    size="sm"
                    onClick={function onAccentClick() {
                      updateSettings({ accentColor: color })
                    }}
                    className={cn(
                      'border border-primary-200 bg-primary-100/70 text-primary-900 hover:bg-primary-200',
                      active && 'border-primary-500 bg-primary-200',
                    )}
                  >
                    <span className={cn('size-2.5 rounded-full', getAccentBadgeClass(color))} />
                    <span className="capitalize">{color}</span>
                  </Button>
                )
              })}
            </div>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection
          title="Editor"
          description="Configure Monaco defaults for the files workspace."
          icon={SourceCodeSquareIcon}
        >
          <SettingsRow label="Font size" description="Adjust editor font size between 12 and 20.">
            <div className="flex w-full min-w-[220px] items-center gap-2">
              <input
                type="range"
                min={12}
                max={20}
                value={settings.editorFontSize}
                onChange={function onFontSizeChange(event) {
                  updateSettings({ editorFontSize: Number(event.target.value) })
                }}
                className="w-full accent-primary-900"
              />
              <span className="w-12 text-right text-sm tabular-nums text-primary-700">
                {settings.editorFontSize}px
              </span>
            </div>
          </SettingsRow>

          <SettingsRow
            label="Word wrap"
            description="Wrap long lines in the editor by default."
          >
            <Switch
              checked={settings.editorWordWrap}
              onCheckedChange={function onWordWrapChange(checked) {
                updateSettings({ editorWordWrap: checked })
              }}
            />
          </SettingsRow>

          <SettingsRow label="Minimap" description="Show minimap preview in Monaco editor.">
            <Switch
              checked={settings.editorMinimap}
              onCheckedChange={function onMinimapChange(checked) {
                updateSettings({ editorMinimap: checked })
              }}
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection
          title="Notifications"
          description="Control alert delivery and usage warning threshold."
          icon={Notification03Icon}
        >
          <SettingsRow label="Enable alerts" description="Show usage and system alert notifications.">
            <Switch
              checked={settings.notificationsEnabled}
              onCheckedChange={function onNotificationsChange(checked) {
                updateSettings({ notificationsEnabled: checked })
              }}
            />
          </SettingsRow>

          <SettingsRow
            label="Usage threshold"
            description="Set usage warning trigger between 50% and 100%."
          >
            <div className="flex w-full min-w-[220px] items-center gap-2">
              <input
                type="range"
                min={50}
                max={100}
                value={settings.usageThreshold}
                onChange={function onThresholdChange(event) {
                  updateSettings({ usageThreshold: Number(event.target.value) })
                }}
                className="w-full accent-primary-900"
                disabled={!settings.notificationsEnabled}
              />
              <span className="w-12 text-right text-sm tabular-nums text-primary-700">
                {settings.usageThreshold}%
              </span>
            </div>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection
          title="Smart Suggestions"
          description="Get proactive model suggestions to optimize cost and quality."
          icon={Settings02Icon}
        >
          <SettingsRow
            label="Enable smart suggestions"
            description="Suggest cheaper models for simple tasks or better models for complex work."
          >
            <Switch
              checked={settings.smartSuggestionsEnabled}
              onCheckedChange={function onSmartSuggestionsChange(checked) {
                updateSettings({ smartSuggestionsEnabled: checked })
              }}
            />
          </SettingsRow>

          <SettingsRow
            label="Preferred budget model"
            description="Default model for cheaper suggestions (leave empty for auto-detect)."
          >
            <select
              value={settings.preferredBudgetModel}
              onChange={function onBudgetModelChange(event) {
                updateSettings({ preferredBudgetModel: event.target.value })
              }}
              className="h-9 min-w-[220px] rounded-lg border border-primary-200 bg-primary-50 px-3 text-sm text-primary-900 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              <option value="">Auto-detect</option>
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </SettingsRow>

          <SettingsRow
            label="Preferred premium model"
            description="Default model for upgrade suggestions (leave empty for auto-detect)."
          >
            <select
              value={settings.preferredPremiumModel}
              onChange={function onPremiumModelChange(event) {
                updateSettings({ preferredPremiumModel: event.target.value })
              }}
              className="h-9 min-w-[220px] rounded-lg border border-primary-200 bg-primary-50 px-3 text-sm text-primary-900 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              <option value="">Auto-detect</option>
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </SettingsRow>

          <SettingsRow
            label="Only suggest cheaper models"
            description="Never suggest upgrades, only suggest cheaper alternatives."
          >
            <Switch
              checked={settings.onlySuggestCheaper}
              onCheckedChange={function onOnlySuggestCheaperChange(checked) {
                updateSettings({ onlySuggestCheaper: checked })
              }}
            />
          </SettingsRow>
        </SettingsSection>

        <ProfileSection />
        <ChatDisplaySection />
        <LoaderStyleSection />

        <footer className="flex items-center gap-2 rounded-2xl border border-primary-200 bg-primary-50/70 p-3 text-sm text-primary-600 backdrop-blur-sm">
          <HugeiconsIcon icon={Settings02Icon} size={20} strokeWidth={1.5} />
          <span className="text-pretty">Changes are saved automatically to local storage.</span>
        </footer>
      </main>
    </div>
  )
}

// ── Profile Section ─────────────────────────────────────────────────────

const PROFILE_IMAGE_MAX_DIMENSION = 128
const PROFILE_IMAGE_MAX_FILE_SIZE = 10 * 1024 * 1024

function ProfileSection() {
  const { settings: chatSettings, updateSettings: updateChatSettings } = useChatSettingsStore()
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileProcessing, setProfileProcessing] = useState(false)
  const displayName = getChatProfileDisplayName(chatSettings.displayName)

  async function handleAvatarUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setProfileError('Unsupported file type.')
      return
    }
    if (file.size > PROFILE_IMAGE_MAX_FILE_SIZE) {
      setProfileError('Image too large (max 10MB).')
      return
    }
    setProfileError(null)
    setProfileProcessing(true)
    try {
      const url = URL.createObjectURL(file)
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = () => reject(new Error('Failed to load image'))
        i.src = url
      })
      const max = PROFILE_IMAGE_MAX_DIMENSION
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      updateChatSettings({ avatarDataUrl: canvas.toDataURL(outputType, 0.82) })
    } catch {
      setProfileError('Failed to process image.')
    } finally {
      setProfileProcessing(false)
    }
  }

  return (
    <SettingsSection title="Profile" description="Your display name and avatar for chat." icon={UserIcon}>
      <div className="flex items-center gap-4">
        <UserAvatar size={56} src={chatSettings.avatarDataUrl} alt={displayName} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-primary-900">{displayName}</p>
          <p className="text-xs text-primary-500">Shown in the sidebar and chat messages.</p>
        </div>
      </div>
      <SettingsRow label="Display name" description="Leave blank for default.">
        <Input
          value={chatSettings.displayName}
          onChange={(e) => updateChatSettings({ displayName: e.target.value })}
          placeholder="User"
          className="h-9 min-w-[220px]"
        />
      </SettingsRow>
      <SettingsRow label="Profile picture" description="Resized to 128×128, stored locally.">
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            className="block w-full max-w-[220px] cursor-pointer text-xs text-primary-700 file:mr-2 file:rounded-md file:border file:border-primary-200 file:bg-primary-100 file:px-2.5 file:py-1.5 file:text-xs file:font-medium"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateChatSettings({ avatarDataUrl: null })}
            disabled={!chatSettings.avatarDataUrl || profileProcessing}
          >
            Remove
          </Button>
        </div>
      </SettingsRow>
      {profileError && <p className="text-xs text-red-600">{profileError}</p>}
    </SettingsSection>
  )
}

// ── Chat Display Section ────────────────────────────────────────────────

function ChatDisplaySection() {
  const { settings: chatSettings, updateSettings: updateChatSettings } = useChatSettingsStore()

  return (
    <SettingsSection title="Chat Display" description="Control what's visible in chat messages." icon={MessageMultiple01Icon}>
      <SettingsRow label="Show tool messages" description="Display tool call/result blocks in chat.">
        <Switch
          checked={chatSettings.showToolMessages}
          onCheckedChange={(checked) => updateChatSettings({ showToolMessages: checked })}
        />
      </SettingsRow>
      <SettingsRow label="Show reasoning blocks" description="Display model thinking/reasoning in chat.">
        <Switch
          checked={chatSettings.showReasoningBlocks}
          onCheckedChange={(checked) => updateChatSettings({ showReasoningBlocks: checked })}
        />
      </SettingsRow>
    </SettingsSection>
  )
}

// ── Loader Style Section ────────────────────────────────────────────────

type LoaderStyleOption = { value: LoaderStyle; label: string }

const LOADER_STYLES: LoaderStyleOption[] = [
  { value: 'dots', label: 'Dots' },
  { value: 'braille-claw', label: 'Claw' },
  { value: 'braille-orbit', label: 'Orbit' },
  { value: 'braille-breathe', label: 'Breathe' },
  { value: 'braille-pulse', label: 'Pulse' },
  { value: 'braille-wave', label: 'Wave' },
  { value: 'lobster', label: 'Lobster' },
  { value: 'logo', label: 'Logo' },
]

function getPreset(style: LoaderStyle): BrailleSpinnerPreset | null {
  const map: Record<string, BrailleSpinnerPreset> = {
    'braille-claw': 'claw', 'braille-orbit': 'orbit',
    'braille-breathe': 'breathe', 'braille-pulse': 'pulse', 'braille-wave': 'wave',
  }
  return map[style] ?? null
}

function LoaderPreview({ style }: { style: LoaderStyle }) {
  if (style === 'dots') return <ThreeDotsSpinner />
  if (style === 'lobster') return <span className="inline-block text-sm animate-pulse">🦞</span>
  if (style === 'logo') return <LogoLoader />
  const preset = getPreset(style)
  return preset ? <BrailleSpinner preset={preset} size={16} speed={120} className="text-primary-500" /> : <ThreeDotsSpinner />
}

function LoaderStyleSection() {
  const { settings: chatSettings, updateSettings: updateChatSettings } = useChatSettingsStore()

  return (
    <SettingsSection title="Loading Animation" description="Choose the animation while the assistant is streaming." icon={Settings02Icon}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LOADER_STYLES.map((option) => {
          const active = chatSettings.loaderStyle === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => updateChatSettings({ loaderStyle: option.value })}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-2 rounded-xl border px-2 py-2 transition-colors',
                active
                  ? 'border-primary-500 bg-primary-200/60 text-primary-900'
                  : 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100',
              )}
              aria-pressed={active}
            >
              <span className="flex h-5 items-center justify-center">
                <LoaderPreview style={option.value} />
              </span>
              <span className="text-[11px] font-medium text-center leading-4">{option.label}</span>
            </button>
          )
        })}
      </div>
    </SettingsSection>
  )
}
