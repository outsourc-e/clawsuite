import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import appCss from '../styles.css?url'
import { SearchModal } from '@/components/search/search-modal'
import { TerminalShortcutListener } from '@/components/terminal-shortcut-listener'
import { GlobalShortcutListener } from '@/components/global-shortcut-listener'
import { WorkspaceShell } from '@/components/workspace-shell'
import { useTaskReminders } from '@/hooks/use-task-reminders'
import { UpdateNotifier } from '@/components/update-notifier'
import { Toaster } from '@/components/ui/toast'
import { OnboardingTour } from '@/components/onboarding/onboarding-tour'
import { KeyboardShortcutsModal } from '@/components/keyboard-shortcuts-modal'
import { GatewaySetupWizard } from '@/components/gateway-setup-wizard'
import { GatewayReconnectBanner } from '@/components/gateway-reconnect-banner'

const themeScript = `
(() => {
  window.process = window.process || { env: {}, platform: 'browser' };
  try {
    const stored = localStorage.getItem('openclaw-settings')
    const fallback = localStorage.getItem('chat-settings')
    let theme = 'light'
    let accent = 'orange'
    if (stored) {
      const parsed = JSON.parse(stored)
      const storedTheme = parsed?.state?.settings?.theme
      const storedAccent = parsed?.state?.settings?.accentColor
      if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
        theme = storedTheme
      }
      if (storedAccent === 'orange' || storedAccent === 'purple' || storedAccent === 'blue' || storedAccent === 'green') {
        accent = storedAccent
      }
    } else if (fallback) {
      const parsed = JSON.parse(fallback)
      const storedTheme = parsed?.state?.settings?.theme
      const storedAccent = parsed?.state?.settings?.accentColor
      if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
        theme = storedTheme
      }
      if (storedAccent === 'orange' || storedAccent === 'purple' || storedAccent === 'blue' || storedAccent === 'green') {
        accent = storedAccent
      }
    }
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      root.classList.remove('light', 'dark', 'system')
      root.classList.add(theme)
      root.setAttribute('data-accent', accent)
      if (theme === 'system' && media.matches) {
        root.classList.add('dark')
      }
    }
    apply()
    media.addEventListener('change', () => {
      if (theme === 'system') apply()
    })
  } catch {}
})()
`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'ClawSuite',
      },
      {
        name: 'description',
        content:
          'Supercharged chat interface for OpenClaw AI agents with file explorer, terminal, and usage tracking',
      },
      {
        property: 'og:image',
        content: '/cover.png',
      },
      {
        property: 'og:image:type',
        content: 'image/png',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:image',
        content: '/cover.png',
      },
      // PWA meta tags
      {
        name: 'theme-color',
        content: '#f97316',
      },
      {
        name: 'apple-mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'apple-mobile-web-app-status-bar-style',
        content: 'default',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg',
      },
      // PWA manifest and icons
      {
        rel: 'manifest',
        href: '/manifest.json',
      },
      {
        rel: 'apple-touch-icon',
        href: '/clawsuite-icon-192.png',
      },
    ],
  }),

  shellComponent: RootDocument,
  component: RootLayout,
  errorComponent: function RootError({ error }) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-primary-50">
        <h1 className="text-2xl font-semibold text-primary-900 mb-4">
          Something went wrong
        </h1>
        <pre className="p-4 bg-primary-100 rounded-lg text-sm text-primary-700 max-w-full overflow-auto mb-6">
          {error instanceof Error ? error.message : String(error)}
        </pre>
        <button
          onClick={() => (window.location.href = '/')}
          className="px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
        >
          Return Home
        </button>
      </div>
    )
  },
})

const queryClient = new QueryClient()

function TaskReminderRunner() {
  useTaskReminders()
  return null
}

function RootLayout() {
  // Register service worker (production only — dev mode causes fetch errors)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[PWA] Service Worker registered:', registration.scope)
        })
        .catch((error) => {
          console.error('[PWA] Service Worker registration failed:', error)
        })
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <GatewayReconnectBanner />
      <GlobalShortcutListener />
      <TerminalShortcutListener />
      <TaskReminderRunner />
      <UpdateNotifier />
      <Toaster />
      <WorkspaceShell />
      <SearchModal />
      <GatewaySetupWizard />
      <OnboardingTour />
      <KeyboardShortcutsModal />
    </QueryClientProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        <div className="root">{children}</div>
        <Scripts />
      </body>
    </html>
  )
}
