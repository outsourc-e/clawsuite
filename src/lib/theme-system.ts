export type AppTheme = 'ops-dark' | 'premium-dark' | 'paper-light'

export const THEMES: Array<{
  value: AppTheme
  label: string
  description: string
}> = [
  {
    value: 'ops-dark',
    label: 'Ops Dark',
    description: 'Datadog/Slack — dense, structural',
  },
  {
    value: 'premium-dark',
    label: 'Premium Dark',
    description: 'Nuxt premium — deep shadows, refined',
  },
  {
    value: 'paper-light',
    label: 'Paper Light',
    description: 'iOS-inspired — warm white, clean',
  },
]

function isAppTheme(value: string | null): value is AppTheme {
  return (
    value === 'ops-dark' ||
    value === 'premium-dark' ||
    value === 'paper-light'
  )
}

export function applyAppTheme(theme: AppTheme) {
  if (typeof document === 'undefined') return

  document.documentElement.setAttribute('data-theme', theme)

  // Sync .dark for Tailwind dark: variants; app theme takes precedence.
  const isDark = theme !== 'paper-light'
  document.documentElement.classList.toggle('dark', isDark)
}

export function getStoredTheme(): AppTheme {
  if (typeof window === 'undefined') return 'ops-dark'

  const stored = localStorage.getItem('clawsuite-app-theme')
  if (isAppTheme(stored)) return stored
  return 'ops-dark'
}

export function saveTheme(theme: AppTheme) {
  if (typeof window === 'undefined') return
  localStorage.setItem('clawsuite-app-theme', theme)
}
