# OpenClaw Studio

**"OpenClaw’s all-in-one command center."** - Desktop interface for OpenClaw Gateway

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/outsourc-e/openclaw-studio)](https://github.com/outsourc-e/openclaw-studio/releases)

## Features

- 💬 **Real-time chat** with AI agents
- 📁 **File explorer** with Monaco code editor
- 🖥️ **Integrated terminal** (Cmd+\` or dedicated route)
- 🔍 **Global search** (Cmd+K) - 6 search scopes
- 📊 **Session monitoring** with real-time agent view
- 🎯 **Skills marketplace** (2,070+ skills from ClawdHub)
- ⚙️ **Cron job manager** for scheduled tasks
- 📝 **Memory viewer** for agent context
- 🌐 **Browser automation** control panel
- 📈 **Usage tracking** and cost monitoring
- ⌨️ **Keyboard shortcuts** (press `?` to see all)
- 🟢 **Gateway status** indicator

## Installation

### macOS

**Download:** [OpenClaw Studio v1.0.0 (.zip)](https://github.com/outsourc-e/openclaw-studio/releases/download/v1.0.0/OpenClaw.Studio_1.0.0_universal.app.zip) (9.6 MB, recommended)

Alternative: [.dmg installer](https://github.com/outsourc-e/openclaw-studio/releases/download/v1.0.0/OpenClaw.Studio_1.0.0_universal.dmg) (45 MB)

**Install:**
1. Download the `.zip` file
2. Extract by double-clicking
3. Drag `OpenClaw Studio.app` to Applications folder
4. **First launch:** Right-click → Open (to bypass Gatekeeper)
5. After first launch, you can open normally from Applications

**Universal Binary:** Works natively on both Apple Silicon (M1/M2/M3) and Intel Macs.

### Linux & Windows

*Coming soon - use development build for now.*

## Requirements

- **OpenClaw Gateway** must be running on `localhost:18789`
- macOS 11+ (Big Sur or later)
- 100MB free disk space

## Screenshots

![Dashboard](docs/screenshots/dashboard.png)
*Real-time dashboard with Gateway connection status*

![Chat Interface](docs/screenshots/chat.png)
*Multi-session chat with agent monitoring*

![Terminal](docs/screenshots/terminal.png)
*Integrated terminal with full xterm support*

## Development

### Prerequisites

- Node.js 22+
- Rust 1.80+ (for Tauri)
- macOS (for building .dmg/.app)

### Setup

```bash
# Clone the repo
git clone https://github.com/outsourc-e/openclaw-studio.git
cd openclaw-studio

# Install dependencies
npm install

# Run dev server (web only, no desktop app)
npm run dev

# Build Tauri desktop app
npm install @tauri-apps/cli
npx tauri build --target universal-apple-darwin
```

### Project Structure

```
openclaw-studio/
├── src/
│   ├── routes/          # TanStack Router routes
│   ├── components/      # React components
│   ├── screens/         # Screen-level components
│   ├── hooks/           # Custom React hooks
│   └── server/          # Server-side code (Gateway API)
├── src-tauri/           # Tauri Rust backend
├── docs/                # Documentation
└── public/              # Static assets
```

## Architecture

Built with:
- **React 19** - UI framework
- **TanStack Router** - File-based routing
- **TanStack Start** - SSR/SSG framework
- **Tauri 2.10** - Desktop app framework
- **Vite** - Build tool
- **Tailwind CSS 4** - Styling
- **Monaco Editor** - Code editing
- **xterm.js** - Terminal emulation
- **Framer Motion** - Animations

See [ARCHITECTURE.md](docs/OPENCLAW-STUDIO-ARCHITECTURE.md) for detailed system design.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open global search |
| `Ctrl+\`` | Toggle terminal panel |
| `Cmd+B` | Toggle sidebar |
| `?` | Show keyboard shortcuts modal |
| `Esc` | Close modals/overlays |

## Roadmap

### Phase 3: Production Desktop App ✅
- [x] Build system (Tauri)
- [x] Universal binary (Apple Silicon + Intel)
- [x] .dmg and .zip distributions
- [ ] GitHub Actions CI/CD
- [ ] Auto-update system

### Phase 4: Workflow Builder (Q1 2026)
- [ ] Visual workflow editor (drag-drop nodes)
- [ ] Multi-agent orchestration dashboard
- [ ] Plugin system for custom tools
- [ ] Real-time collaboration features

See [PHASE-3-ACTION-PLAN.md](docs/PHASE-3-ACTION-PLAN.md) for full roadmap.

## Contributing

This is a personal project by [@outsourc_e](https://x.com/outsourc_e). Issues and PRs welcome!

## License

MIT © Eric ([outsourc-e](https://github.com/outsourc-e))

Built with ❤️ in Miami

---

**Part of the Building the Future ecosystem:**
- 🌐 [buildingthefuture.io](https://buildingthefuture.io)
- 🐦 [@outsourc_e](https://x.com/outsourc_e)
