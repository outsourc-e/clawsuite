# Security Policy

## Reporting Vulnerabilities

If you discover a security issue, please email eric@buildingthefuture.io.
Do NOT open a public GitHub issue for security vulnerabilities.

## Architecture

OpenClaw Studio runs as a local desktop application. All communication with the OpenClaw Gateway happens through a server-side WebSocket proxy (`src/server/gateway.ts`). No secrets are exposed to the browser.

```
Browser UI → /api/* routes → Server-side Gateway Client → OpenClaw Gateway (loopback only)
```

## Secrets

- Gateway tokens are read from environment variables (`CLAWDBOT_GATEWAY_TOKEN`) or auto-discovered from `~/.openclaw/openclaw.json`
- No secrets are hardcoded in source code
- `.env` files are gitignored and never committed

## Scope

- **Terminal** provides full shell access — only run Studio on trusted machines
- **File Explorer** is scoped to `~/.openclaw/workspace/` with path traversal protection
- **Skills** from ClawdHub registry should be reviewed before enabling — some may request filesystem, network, or browser access
- **Gateway** binds to loopback (127.0.0.1) by default — not accessible from the network

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅        |
