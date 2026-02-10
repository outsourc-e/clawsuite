/**
 * Dashboard settings dialog — scrollable popup overlay.
 * Mirrors /settings page content without navigation.
 */
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CheckmarkCircle02Icon,
  CloudIcon,
  ComputerIcon,
  Moon01Icon,
  Notification03Icon,
  PaintBoardIcon,
  Settings02Icon,
  SourceCodeSquareIcon,
  Sun01Icon,
} from '@hugeicons/core-free-icons'
import { useState, useEffect } from 'react'
import type * as React from 'react'
import {
  DialogRoot,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import {
  applyTheme,
  useSettings,
} from '@/hooks/use-settings'
import type { AccentColor, SettingsThemeMode } from '@/hooks/use-settings'
import { cn } from '@/lib/utils'

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/* ── Shared sub-components ── */

function Section({
  title,
  description,
  icon,
  children,
}: {
  title: string
  description: string
  icon: React.ComponentProps<typeof HugeiconsIcon>['icon']
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-primary-200 bg-primary-100/40 p-3">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-primary-200 bg-primary-100/70">
          <HugeiconsIcon icon={icon} size={16} strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">{title}</h3>
          <p className="text-xs text-primary-500">{description}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Row({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink">{label}</p>
        {description ? <p className="text-[11px] text-primary-500">{description}</p> : null}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { settings, updateSettings } = useSettings()
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle')
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; label: string }>>([])

  useEffect(() => {
    if (!open) return
    async function fetchModels() {
      try {
        const res = await fetch('/api/models')
        if (!res.ok) return
        const data = await res.json()
        const models = Array.isArray(data.models) ? data.models : []
        setAvailableModels(models.map((m: any) => ({ id: m.id || '', label: m.id?.split('/').pop() || m.id || '' })))
      } catch { /* ignore */ }
    }
    void fetchModels()
  }, [open])

  async function handleTestConnection() {
    setConnectionStatus('testing')
    try {
      const res = await fetch('/api/ping')
      setConnectionStatus(res.ok ? 'connected' : 'failed')
    } catch {
      setConnectionStatus('failed')
    }
  }

  function accentBadge(color: AccentColor) {
    if (color === 'orange') return 'bg-orange-500'
    if (color === 'purple') return 'bg-purple-500'
    if (color === 'blue') return 'bg-blue-500'
    return 'bg-green-500'
  }

  function connDot() {
    if (connectionStatus === 'connected') return 'bg-green-500'
    if (connectionStatus === 'failed') return 'bg-red-500'
    if (connectionStatus === 'testing') return 'bg-orange-500'
    return 'bg-primary-500'
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(520px,92vw)] max-h-[80vh] overflow-hidden p-0">
        <div className="border-b border-primary-200 px-5 py-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-primary-500">
            Changes are saved automatically.
          </DialogDescription>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-3" style={{ maxHeight: 'calc(80vh - 72px)' }}>
          {/* Gateway */}
          <Section title="Gateway" description="Endpoint and connectivity." icon={CloudIcon}>
            <Row label="Gateway URL">
              <input
                type="url"
                placeholder="https://api.openclaw.ai"
                value={settings.gatewayUrl}
                onChange={(e) => updateSettings({ gatewayUrl: e.target.value })}
                className="h-8 w-full min-w-[180px] rounded-lg border border-primary-200 bg-primary-50 px-2.5 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:bg-primary-100"
              />
            </Row>
            <Row label="Status">
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                connectionStatus === 'connected' && 'border-green-500/35 bg-green-500/10 text-green-500',
                connectionStatus === 'failed' && 'border-red-500/35 bg-red-500/10 text-red-500',
                connectionStatus === 'testing' && 'border-orange-500/35 bg-orange-500/10 text-orange-500',
                connectionStatus === 'idle' && 'border-primary-300 bg-primary-100 text-primary-600',
              )}>
                <span className={cn('size-1.5 rounded-full', connDot())} />
                {connectionStatus === 'idle' ? 'Not tested' : connectionStatus === 'testing' ? 'Testing…' : connectionStatus === 'connected' ? 'Connected' : 'Failed'}
              </span>
              <Button variant="secondary" size="sm" onClick={() => void handleTestConnection()} disabled={connectionStatus === 'testing'} className="h-7 text-xs">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={1.5} />
                Test
              </Button>
            </Row>
          </Section>

          {/* Appearance */}
          <Section title="Appearance" description="Theme and accent color." icon={PaintBoardIcon}>
            <Row label="Theme">
              <Tabs value={settings.theme} onValueChange={(v) => { applyTheme(v as SettingsThemeMode); updateSettings({ theme: v as SettingsThemeMode }) }}>
                <TabsList variant="default" className="gap-0.5">
                  <TabsTab value="system"><HugeiconsIcon icon={ComputerIcon} size={14} strokeWidth={1.5} /></TabsTab>
                  <TabsTab value="light"><HugeiconsIcon icon={Sun01Icon} size={14} strokeWidth={1.5} /></TabsTab>
                  <TabsTab value="dark"><HugeiconsIcon icon={Moon01Icon} size={14} strokeWidth={1.5} /></TabsTab>
                </TabsList>
              </Tabs>
            </Row>
            <Row label="Accent color">
              <div className="flex gap-1.5">
                {(['orange', 'purple', 'blue', 'green'] as const).map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => updateSettings({ accentColor: color })}
                    className={cn(
                      'inline-flex size-6 items-center justify-center rounded-full border transition-colors',
                      settings.accentColor === color ? 'border-primary-500 bg-primary-200' : 'border-primary-200 hover:bg-primary-100',
                    )}
                    title={color}
                  >
                    <span className={cn('size-3 rounded-full', accentBadge(color))} />
                  </button>
                ))}
              </div>
            </Row>
          </Section>

          {/* Editor */}
          <Section title="Editor" description="Monaco editor defaults." icon={SourceCodeSquareIcon}>
            <Row label="Font size">
              <div className="flex items-center gap-2">
                <input type="range" min={12} max={20} value={settings.editorFontSize} onChange={(e) => updateSettings({ editorFontSize: Number(e.target.value) })} className="w-24 accent-primary-900" />
                <span className="w-8 text-right text-xs tabular-nums text-primary-600">{settings.editorFontSize}px</span>
              </div>
            </Row>
            <Row label="Word wrap"><Switch checked={settings.editorWordWrap} onCheckedChange={(c) => updateSettings({ editorWordWrap: c })} /></Row>
            <Row label="Minimap"><Switch checked={settings.editorMinimap} onCheckedChange={(c) => updateSettings({ editorMinimap: c })} /></Row>
          </Section>

          {/* Notifications */}
          <Section title="Notifications" description="Alerts and usage warnings." icon={Notification03Icon}>
            <Row label="Enable alerts"><Switch checked={settings.notificationsEnabled} onCheckedChange={(c) => updateSettings({ notificationsEnabled: c })} /></Row>
            <Row label="Usage threshold">
              <div className="flex items-center gap-2">
                <input type="range" min={50} max={100} value={settings.usageThreshold} onChange={(e) => updateSettings({ usageThreshold: Number(e.target.value) })} className="w-24 accent-primary-900" disabled={!settings.notificationsEnabled} />
                <span className="w-8 text-right text-xs tabular-nums text-primary-600">{settings.usageThreshold}%</span>
              </div>
            </Row>
          </Section>

          {/* Smart Suggestions */}
          <Section title="Smart Suggestions" description="Model routing optimization." icon={Settings02Icon}>
            <Row label="Enable"><Switch checked={settings.smartSuggestionsEnabled} onCheckedChange={(c) => updateSettings({ smartSuggestionsEnabled: c })} /></Row>
            <Row label="Budget model">
              <select value={settings.preferredBudgetModel} onChange={(e) => updateSettings({ preferredBudgetModel: e.target.value })} className="h-7 min-w-[140px] rounded-lg border border-primary-200 bg-primary-50 px-2 text-xs text-ink outline-none dark:bg-primary-100">
                <option value="">Auto-detect</option>
                {availableModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Row>
            <Row label="Premium model">
              <select value={settings.preferredPremiumModel} onChange={(e) => updateSettings({ preferredPremiumModel: e.target.value })} className="h-7 min-w-[140px] rounded-lg border border-primary-200 bg-primary-50 px-2 text-xs text-ink outline-none dark:bg-primary-100">
                <option value="">Auto-detect</option>
                {availableModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Row>
            <Row label="Only suggest cheaper"><Switch checked={settings.onlySuggestCheaper} onCheckedChange={(c) => updateSettings({ onlySuggestCheaper: c })} /></Row>
          </Section>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
