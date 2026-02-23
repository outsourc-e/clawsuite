export type ThemeId = 'paper-light' | 'ops-dark' | 'premium-dark'

export const THEMES: Array<{
  id: ThemeId
  label: string
  description: string
  icon: string
}> = [
  { id: 'paper-light', label: 'Paper Light', description: 'Warm white, gentle shadows', icon: '☀️' },
  { id: 'ops-dark', label: 'Ops Dark', description: 'Dense structural dark', icon: '🖥️' },
  { id: 'premium-dark', label: 'Premium Dark', description: 'Deep shadows, soft glow', icon: '✨' },
]

const STORAGE_KEY = 'clawsuite-theme'

export function getStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return 'paper-light'
  return (localStorage.getItem(STORAGE_KEY) as ThemeId) || 'paper-light'
}

export function applyTheme(theme: ThemeId): void {
  const html = document.documentElement
  html.setAttribute('data-theme', theme)

  // Also toggle dark class for Tailwind dark: variant
  if (theme.includes('dark')) {
    html.classList.add('dark')
    html.classList.remove('light')
  } else {
    html.classList.add('light')
    html.classList.remove('dark')
  }

  localStorage.setItem(STORAGE_KEY, theme)
}

export function initTheme(): void {
  applyTheme(getStoredTheme())
}
