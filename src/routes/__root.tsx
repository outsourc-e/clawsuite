import {
  HeadContent,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import appCss from '../styles.css?url'
import { SearchModal } from '@/components/search/search-modal'
import { TerminalShortcutListener } from '@/components/terminal-shortcut-listener'
import { GlobalShortcutListener } from '@/components/global-shortcut-listener'
import { WorkspaceShell } from '@/components/workspace-shell'
import { useTaskReminders } from '@/hooks/use-task-reminders'
import { UpdateNotifier } from '@/components/update-notifier'

const themeScript = `
(() => {
  try {
    const stored = localStorage.getItem('openclaw-settings')
    const fallback = localStorage.getItem('chat-settings')
    let theme = 'dark'
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
        content: 'Supercharged chat interface for OpenClaw AI agents with file explorer, terminal, and usage tracking',
      },
      {
        property: 'og:image',
        content: '/cover.webp',
      },
      {
        property: 'og:image:type',
        content: 'image/webp',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:image',
        content: '/cover.webp',
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
    ],
  }),

  shellComponent: RootDocument,
  component: RootLayout,
})

const queryClient = new QueryClient()

function TaskReminderRunner() {
  useTaskReminders()
  return null
}

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalShortcutListener />
      <TerminalShortcutListener />
      <TaskReminderRunner />
      <UpdateNotifier />
      <WorkspaceShell />
      <SearchModal />
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
