import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

const TIPS = [
  { emoji: '⌨️', text: 'Press Cmd+K to search sessions, skills, and commands' },
  {
    emoji: '🔧',
    text: "Install skills from ClawHub to extend your agent's capabilities",
  },
  { emoji: '💬', text: 'Use /model to switch models mid-conversation' },
  {
    emoji: '⚡',
    text: 'Agents run in the background — check Agent Hub for status',
  },
  { emoji: '🎨', text: 'Customize your theme and accent color in Settings' },
  { emoji: '📋', text: 'Cmd+F opens inline search across all messages' },
  { emoji: '🔒', text: 'All data stays local — nothing leaves your machine' },
  { emoji: '🖥️', text: 'Open the terminal with Cmd+` for quick shell access' },
  { emoji: '🤖', text: 'Sub-agents handle heavy work while you keep chatting' },
  { emoji: '📊', text: 'Track usage and costs in the dashboard metrics' },
  {
    emoji: '🧠',
    text: 'Your agent has memory — it remembers context across sessions',
  },
  { emoji: '🚀', text: 'ClawSuite works with any OpenClaw gateway instance' },
  {
    emoji: '🎯',
    text: 'Pin important sessions to keep them at the top of your sidebar',
  },
  { emoji: '⏰', text: 'Set up cron jobs to automate recurring agent tasks' },
  { emoji: '🌙', text: 'Dark mode is the default — toggle in the top bar' },
]

export function ActivityTicker() {
  const navigate = useNavigate()
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * TIPS.length),
  )
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % TIPS.length)
        setFading(false)
      }, 400)
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  const tip = TIPS[index]

  return (
    <div
      className="mb-4 flex h-9 cursor-pointer items-center overflow-hidden rounded-xl border border-primary-200 bg-primary-50/80 px-4 shadow-sm transition-colors hover:bg-primary-100/80 dark:border-primary-800 dark:bg-primary-900/60 dark:hover:bg-primary-800/60"
      onClick={() => void navigate({ to: '/activity' })}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ')
          void navigate({ to: '/activity' })
      }}
    >
      <span
        className={`flex items-center gap-2 text-xs text-primary-600 transition-opacity duration-400 dark:text-primary-400 ${fading ? 'opacity-0' : 'opacity-100'}`}
      >
        <span>{tip.emoji}</span>
        <span>{tip.text}</span>
      </span>
    </div>
  )
}
