# Contributing to OpenClaw Studio

Thank you for your interest in contributing! This guide will help you get started.

## Local Development Setup

### Prerequisites

- Node.js 22+
- pnpm 10+
- [OpenClaw Gateway](https://github.com/openclaw/openclaw) running locally

### Getting Started

```bash
# Clone the repository
git clone https://github.com/outsourc-e/openclaw-studio.git
cd openclaw-studio

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Open http://localhost:5173 (or the port shown in terminal)
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm lint` | Run linter |
| `pnpm test` | Run tests |
| `pnpm typecheck` | Run TypeScript type checking |

## Pull Request Checklist

Before submitting a PR, please verify:

### Code Quality
- [ ] Code builds without errors (`pnpm build`)
- [ ] Linter passes (`pnpm lint`)
- [ ] Type check passes (`pnpm typecheck`)
- [ ] Existing tests pass (`pnpm test`)

### Security
- [ ] **No secrets, API keys, or tokens in code** (CI will fail if found)
- [ ] No hardcoded credentials or sensitive URLs
- [ ] User paths use folder names only (not full paths)
- [ ] Any new API calls handle auth tokens securely

### Documentation
- [ ] README updated if adding new features
- [ ] JSDoc comments for new functions/components
- [ ] CHANGELOG entry if user-facing change

### Testing
- [ ] New features have test coverage
- [ ] Manual testing completed
- [ ] Edge cases considered

## Coding Conventions

### TypeScript
- Prefer explicit types over `any`
- Use `type` for object shapes, `interface` for extendable contracts
- Export types from dedicated type files when shared

### React
- Use function components with hooks
- Prefer named exports
- Keep components focused and composable
- Use `useMemo`/`useCallback` for expensive operations

### Styling
- Use Tailwind CSS utility classes
- Follow existing design system patterns
- Keep responsive design in mind

### File Structure
```
src/
├── components/     # Shared UI components
├── hooks/          # Custom React hooks
├── lib/            # Utility functions
├── routes/         # TanStack Router routes
│   └── api/        # API endpoints
├── screens/        # Feature screens
├── server/         # Server-side code
└── types/          # TypeScript types
```

## Where to Add Documentation

| Type | Location |
|------|----------|
| Feature docs | `docs/` |
| API changes | `docs/api/` |
| Architecture decisions | `docs/architecture/` |
| Component stories | Component file (JSDoc) |

## Getting Help

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Use the Debug Console to export diagnostics for bug reports

## Key Rotation (If Secrets Are Leaked)

If you accidentally commit secrets:

1. **Immediately** rotate the leaked credentials at the provider
2. Remove the secret from git history (use `git filter-branch` or BFG)
3. Force push to all affected branches
4. Notify maintainers via security@openclaw.ai

The CI will fail on PRs with detected secrets, but always double-check manually.

---

Thank you for contributing! 🦞
