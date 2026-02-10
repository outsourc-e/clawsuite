import { Moon01Icon, Sun01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useChatSettingsStore } from '@/hooks/use-chat-settings'
import type { ThemeMode } from '@/hooks/use-chat-settings'

function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  root.classList.remove('light', 'dark', 'system')
  root.classList.add(theme)
  if (theme === 'system' && media.matches) {
    root.classList.add('dark')
  }
}

function resolvedIsDark(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

export function ThemeToggle() {
  const { settings, updateSettings } = useChatSettingsStore()
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && resolvedIsDark())

  function toggle() {
    const next: ThemeMode = isDark ? 'light' : 'dark'
    applyTheme(next)
    updateSettings({ theme: next })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-primary-200 bg-white/70 text-primary-600 transition-colors hover:border-primary-300 hover:bg-white hover:text-primary-800"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      <HugeiconsIcon icon={isDark ? Sun01Icon : Moon01Icon} size={16} strokeWidth={1.5} />
    </button>
  )
}
