# OpenClaw Studio

Desktop control panel for [OpenClaw](https://github.com/openclaw/openclaw) AI agents.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

- 💬 **Real-time chat** with AI agents
- 🔄 **Model switcher** — switch models via Gateway RPC with undo, confirmations, and premium detection
- 📊 **Usage & cost dashboard** — real Gateway usage and cost data
- 📋 **Activity log** — real-time event stream from Gateway WebSocket
- 🔧 **Debug console** — Gateway diagnostics with pattern-based troubleshooter
- ⚙️ **Provider setup wizard** — guided onboarding for AI providers
- 📁 **File explorer** with Monaco code editor
- 🖥️ **Integrated terminal**
- 🔍 **Global search** (Cmd+K)
- 🎯 **Skills marketplace** (ClawdHub integration)
- ⏰ **Cron job manager**
- 📝 **Memory viewer**
- 🌐 **Browser automation** control panel
- ⌨️ **Keyboard shortcuts** (press `?` to see all)

## Getting Started

```bash
npm install
npm run dev
# Open http://localhost:5173
```

Requires [OpenClaw Gateway](https://github.com/openclaw/openclaw) running on `localhost:18789`.

## Architecture

- **React 19** + **TanStack Router** (file-based routing)
- **TanStack Start** (SSR framework)
- **Vite** (build tool)
- **Tailwind CSS 4** (styling)
- **Tauri 2** (desktop app, optional)
- Gateway communication via WebSocket RPC

```
src/
├── routes/        # TanStack Router routes + API routes
├── screens/       # Screen-level components
├── components/    # Shared UI components
├── server/        # Server-side Gateway integration
├── lib/           # Utilities, provider catalog
└── types/         # Shared TypeScript types
```

## Documentation

See [docs/INDEX.md](docs/INDEX.md) for the full documentation index.

## License

MIT © Eric ([outsourc-e](https://github.com/outsourc-e))
