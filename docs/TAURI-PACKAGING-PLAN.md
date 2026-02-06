# Tauri Desktop App Packaging Plan

## Overview
Package OpenClaw Studio as a native desktop app using Tauri v2.
- **Mac:** `.dmg` installer (~5-10MB)
- **Windows:** `.exe` / `.msi` (~5-10MB)  
- **Linux:** `.AppImage` / `.deb` (~5-10MB)

## Why Tauri (not Electron)
- ~10x smaller bundle (5-10MB vs 100MB+)
- Lower memory usage (Rust backend vs Node.js)
- Uses system webview (WebKit on Mac, WebView2 on Windows)
- Better security model (Rust permissions system)
- Auto-updater built in

## Architecture
```
┌─────────────────────────────────┐
│        Tauri Shell (Rust)       │
│   - System tray                 │
│   - Window management           │
│   - Gateway process management  │
│   - File system access          │
│   - Auto-updater                │
├─────────────────────────────────┤
│     OpenClaw Studio (Web UI)    │
│   - React + TanStack Router     │
│   - Tailwind + Framer Motion    │
│   - Connects to localhost:18789 │
│     (OpenClaw Gateway)          │
└─────────────────────────────────┘
```

## Setup Steps

### 1. Install Tauri CLI
```bash
npm install -D @tauri-apps/cli@latest
npx tauri init
```

### 2. Configure `tauri.conf.json`
```json
{
  "productName": "OpenClaw Studio",
  "identifier": "io.buildingthefuture.openclaw-studio",
  "version": "0.1.0",
  "build": {
    "devUrl": "http://localhost:3000",
    "frontendDist": "../dist/client"
  },
  "app": {
    "windows": [
      {
        "title": "OpenClaw Studio",
        "width": 1440,
        "height": 900,
        "minWidth": 800,
        "minHeight": 600,
        "decorations": true,
        "transparent": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:*"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "nsis", "appimage"],
    "icon": ["icons/icon.png"],
    "macOS": {
      "minimumSystemVersion": "10.15"
    }
  }
}
```

### 3. Build Commands
```bash
# Development
npx tauri dev

# Production build
npm run build           # Build web UI
npx tauri build         # Package native app

# Output locations
# Mac: src-tauri/target/release/bundle/dmg/
# Win: src-tauri/target/release/bundle/nsis/
# Linux: src-tauri/target/release/bundle/appimage/
```

### 4. Distribution
- GitHub Releases with auto-update endpoint
- Or manual download from buildingthefuture.io/download

## Prerequisites
- Rust toolchain (`rustup`)
- Xcode Command Line Tools (Mac)
- System webview (built-in on Mac/Win)

## Considerations
- OpenClaw Studio currently uses server-side TanStack Start routes (api/)
- Need to either:
  a) Bundle a lightweight Express/Hono server in Tauri sidecar
  b) Convert API routes to Tauri IPC commands (Rust ↔ JS bridge)
  c) Proxy all API calls directly to Gateway (simplest)
- Option C is recommended: the web UI already calls Gateway via /api/* routes which proxy to ws://127.0.0.1:18789

## Timeline
- Day 1: Tauri init + basic window + dev mode working
- Day 2: Production build + .dmg generation
- Day 3: Auto-updater + GitHub Releases
- Day 4: Polish (app icon, splash screen, system tray)
