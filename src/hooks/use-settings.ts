import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyAccentColor } from '@/lib/accent-colors'
import {
  applyAppTheme,
  saveTheme,
  type AppTheme,
} from '@/lib/theme-system'

export type SettingsThemeMode = 'system' | 'light' | 'dark'
export type AccentColor = 'orange' | 'purple' | 'blue' | 'green'

export type StudioSettings = {
  gatewayUrl: string
  gatewayToken: string
  theme: SettingsThemeMode
  appTheme: AppTheme
  accentColor: AccentColor
  editorFontSize: number
  editorWordWrap: boolean
  editorMinimap: boolean
  notificationsEnabled: boolean
  usageThreshold: number
  smartSuggestionsEnabled: boolean
  preferredBudgetModel: string
  preferredPremiumModel: string
  onlySuggestCheaper: boolean
}

type SettingsState = {
  settings: StudioSettings
  updateSettings: (updates: Partial<StudioSettings>) => void
}

export const defaultStudioSettings: StudioSettings = {
  gatewayUrl: '',
  gatewayToken: '',
  theme: 'system',
  appTheme: 'ops-dark',
  accentColor: 'orange',
  editorFontSize: 13,
  editorWordWrap: true,
  editorMinimap: false,
  notificationsEnabled: true,
  usageThreshold: 80,
  smartSuggestionsEnabled: false,
  preferredBudgetModel: '',
  preferredPremiumModel: '',
  onlySuggestCheaper: false,
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    function createSettingsStore(set, get) {
      return {
        settings: defaultStudioSettings,
        updateSettings: function updateSettings(updates) {
          const previousSettings = get().settings
          const nextSettings = {
            ...previousSettings,
            ...updates,
          }

          if (
            updates.appTheme &&
            nextSettings.appTheme !== previousSettings.appTheme
          ) {
            applyAppTheme(nextSettings.appTheme)
            saveTheme(nextSettings.appTheme)
            // Sync legacy theme mode so .dark class is always consistent
            nextSettings.theme = nextSettings.appTheme === 'paper-light' ? 'light' : 'dark'
            applyTheme(nextSettings.theme)
          }

          set({ settings: nextSettings })
        },
      }
    },
    {
      name: 'openclaw-settings',
      skipHydration: true,
    },
  ),
)

export function useSettings() {
  const settings = useSettingsStore(function selectSettings(state) {
    return state.settings
  })
  const updateSettings = useSettingsStore(function selectUpdateSettings(state) {
    return state.updateSettings
  })

  return {
    settings,
    updateSettings,
  }
}

export function resolveTheme(theme: SettingsThemeMode): 'light' | 'dark' {
  if (theme === 'light') return 'light'
  if (theme === 'dark') return 'dark'

  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function applyTheme(theme: SettingsThemeMode) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const media = window.matchMedia('(prefers-color-scheme: dark)')

  root.classList.remove('light', 'dark', 'system')
  root.classList.add(theme)

  if (theme === 'system' && media.matches) {
    root.classList.add('dark')
  }
}

function applySettingsAppearance(settings: StudioSettings) {
  applyTheme(settings.theme)
  applyAccentColor(settings.accentColor)
  applyAppTheme(settings.appTheme)
}

let didInitializeSettingsAppearance = false

export function initializeSettingsAppearance() {
  if (didInitializeSettingsAppearance) return
  if (typeof window === 'undefined') return

  didInitializeSettingsAppearance = true

  // Rehydrate persisted settings from localStorage (skipHydration: true requires manual call)
  void useSettingsStore.persist.rehydrate()

  applySettingsAppearance(useSettingsStore.getState().settings)

  useSettingsStore.subscribe(
    function handleSettingsChange(state, previousState) {
      const nextSettings = state.settings
      const previousSettings = previousState.settings

      if (nextSettings.theme !== previousSettings.theme) {
        applyTheme(nextSettings.theme)
      }

      if (nextSettings.accentColor !== previousSettings.accentColor) {
        applyAccentColor(nextSettings.accentColor)
      }

      if (
        nextSettings.appTheme !== previousSettings.appTheme ||
        nextSettings.theme !== previousSettings.theme
      ) {
        applyAppTheme(nextSettings.appTheme)
      }
    },
  )
}
