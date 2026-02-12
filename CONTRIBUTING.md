# Contributing to ClawSuite

Thank you for your interest in contributing to ClawSuite! This guide will help you get started with development and ensure smooth collaboration.

---

## 🚀 Development Setup

### Prerequisites

- **Node.js 22+** ([Download](https://nodejs.org/))
- **npm** or **pnpm** (npm comes with Node.js)
- **OpenClaw Gateway** running locally ([Setup Guide](https://openclaw.ai/docs/installation))
- **Git** for version control

### Getting Started

```bash
# Fork the repository on GitHub first, then clone your fork
git clone https://github.com/YOUR_USERNAME/clawsuite.git
cd clawsuite

# Install dependencies
npm install

# Start development server
npm run dev
# Server will start on http://localhost:3000
```

### Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build optimized production bundle |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint and check for issues |
| `npm run format` | Format code with Prettier |
| `npm run check` | Format + lint (auto-fix) |
| `npm test` | Run test suite |

---

## 🎨 Code Style & Conventions

### TypeScript

- **Strict mode**: All code must pass `strict: true` type checking
- **Explicit types**: Avoid `any` — use `unknown` or proper types
- **Type vs Interface**:
  - Use `type` for object shapes and unions
  - Use `interface` for extendable contracts
- **Export types**: Place shared types in `src/types/`

**Example:**
```typescript
// ✅ Good
type MessageContent = {
  role: 'user' | 'assistant';
  content: string;
};

// ❌ Avoid
const data: any = response.json();
```

### React & Components

- **Function components only**: No class components
- **Named exports**: `export function MyComponent() {}`
- **Hooks**: Use React 19 hooks (useState, useEffect, useMemo, etc.)
- **Composition**: Keep components small and composable
- **Performance**: Use `useMemo`/`useCallback` for expensive operations

**Example:**
```tsx
// ✅ Good
export function ChatMessage({ message }: { message: Message }) {
  const formattedTime = useMemo(() => formatTime(message.timestamp), [message.timestamp]);
  return <div>{formattedTime}</div>;
}

// ❌ Avoid default exports
export default ChatMessage;
```

### Styling with Tailwind

- **Tailwind-first**: Use utility classes for all styling
- **No custom CSS**: Avoid writing CSS files unless absolutely necessary
- **Responsive**: Use responsive prefixes (`md:`, `lg:`, etc.)
- **Consistent spacing**: Follow the existing design system

**Example:**
```tsx
// ✅ Good
<div className="flex items-center gap-2 rounded-lg border border-zinc-200 p-4">
  <span className="text-sm font-medium text-zinc-700">Hello</span>
</div>

// ❌ Avoid inline styles
<div style={{ display: 'flex', padding: '16px' }}>
```

### Architecture Decisions

#### ⛔ **No Portals or ScrollArea Components**

**Why?**: Portals and custom scroll containers cause:
- Layout shift and flickering
- Z-index stacking issues
- Accessibility problems (focus traps)
- Complexity in event handling

**Instead**:
- Use native overflow (`overflow-y-auto`, `overflow-x-hidden`)
- Use CSS positioning (`fixed`, `absolute`, `sticky`)
- Let the browser handle scroll behavior

**Example:**
```tsx
// ✅ Good: Native overflow
<div className="h-full overflow-y-auto">
  {messages.map(msg => <Message key={msg.id} {...msg} />)}
</div>

// ❌ Avoid: Portal or custom ScrollArea
<ScrollArea>
  <Portal>...</Portal>
</ScrollArea>
```

#### State Management

- **TanStack Query** for server state (API requests)
- **Zustand** for global client state (UI state, preferences)
- **React state** for local component state

**Example:**
```typescript
// Server state (TanStack Query)
const { data: sessions } = useQuery({
  queryKey: ['sessions'],
  queryFn: fetchSessions,
});

// Global state (Zustand)
const theme = useThemeStore(state => state.theme);

// Local state (React)
const [isOpen, setIsOpen] = useState(false);
```

---

## 🔄 Pull Request Process

### Before Submitting

Run the following checklist:

#### Code Quality
- [ ] Code builds without errors: `npm run build`
- [ ] Linter passes: `npm run lint`
- [ ] Types check: `tsc --noEmit`
- [ ] Tests pass: `npm test`
- [ ] Code formatted: `npm run format`

#### Security
- [ ] **No secrets, API keys, or tokens** in code
- [ ] No hardcoded credentials or sensitive URLs
- [ ] User paths use folder names only (not full system paths)
- [ ] Auth tokens handled securely (never logged or exposed)

#### Documentation
- [ ] README updated if adding new features
- [ ] JSDoc comments for new functions/components
- [ ] CHANGELOG entry if user-facing change
- [ ] Architecture docs updated if changing structure

#### Testing
- [ ] New features have test coverage
- [ ] Manual testing completed (run app and verify changes)
- [ ] Edge cases considered (empty states, errors, loading)

### PR Guidelines

1. **Create a feature branch**: `git checkout -b feature/your-feature-name`
2. **Write clear commits**: Use descriptive commit messages
   - `feat: Add global search keyboard shortcut`
   - `fix: Resolve terminal scroll overflow`
   - `docs: Update contributing guide`
3. **Keep PRs focused**: One feature/fix per PR
4. **Test thoroughly**: Include screenshots/videos for UI changes
5. **Request review**: Tag maintainers when ready

### PR Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactor

## Testing
- [ ] Tested locally
- [ ] Added/updated tests
- [ ] Verified on multiple browsers

## Screenshots (if applicable)
Add screenshots or videos showing the changes.
```

---

## 📚 Where to Add Documentation

| Type | Location | Description |
|------|----------|-------------|
| Feature docs | `docs/features/` | How features work |
| API changes | `docs/api/` | API endpoint documentation |
| Architecture | `docs/ARCHITECTURE.md` | System design decisions |
| Component docs | Component file (JSDoc) | Inline documentation |
| Release notes | `CHANGELOG.md` | User-facing changes |

**Example JSDoc:**
```typescript
/**
 * Sends a message to the AI agent and returns the response.
 * 
 * @param sessionId - Unique session identifier
 * @param content - Message content to send
 * @returns Promise resolving to the AI response
 * @throws {GatewayError} If gateway is unreachable
 */
export async function sendMessage(sessionId: string, content: string): Promise<Message> {
  // implementation
}
```

---

## 🏗️ Project Architecture

### File Structure

```
src/
├── routes/           # TanStack Router routes + API routes
│   ├── index.tsx     # Dashboard
│   ├── chat/         # Chat interface
│   └── api/          # Server-side API endpoints
├── screens/          # Screen-level components (feature logic)
├── components/       # Shared UI components (dumb components)
├── lib/              # Utilities, API clients, helpers
├── server/           # Server-side code (Gateway integration)
├── types/            # Shared TypeScript types
└── hooks/            # Custom React hooks
```

### Adding a New Feature

1. **Route**: Add route in `src/routes/` (e.g., `src/routes/my-feature.tsx`)
2. **Screen**: Create screen component in `src/screens/my-feature/`
3. **API**: Add server endpoint in `src/routes/api/my-feature.ts` if needed
4. **Components**: Add reusable UI components in `src/components/`
5. **Types**: Define types in `src/types/my-feature.ts`
6. **Tests**: Add tests in `src/screens/my-feature/__tests__/`

---

## 🐛 Reporting Bugs

### Bug Report Template

```markdown
**Description**
Clear description of the bug.

**Steps to Reproduce**
1. Go to '...'
2. Click on '...'
3. See error

**Expected Behavior**
What should happen.

**Actual Behavior**
What actually happens.

**Screenshots**
Add screenshots if applicable.

**Environment**
- OS: [e.g., macOS 14.0]
- Browser: [e.g., Chrome 120]
- Node.js: [e.g., 22.0.0]
- ClawSuite version: [e.g., 2.0.0]

**Debug Console Export**
Use the Debug Console to export diagnostics and attach the file.
```

---

## 🔐 Security

### If You Accidentally Commit Secrets

1. **Immediately rotate** the leaked credentials at the provider (OpenAI, Anthropic, etc.)
2. Remove the secret from git history:
   ```bash
   # Use BFG Repo Cleaner or git filter-branch
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch path/to/file" \
     --prune-empty --tag-name-filter cat -- --all
   ```
3. Force push to all affected branches
4. Notify maintainers: **security@openclaw.ai**

**Note**: CI will fail on PRs with detected secrets, but always double-check manually.

---

## 🆘 Getting Help

- **Issues**: Open an issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions
- **Discord**: Join the OpenClaw Discord (link in main repo)
- **Debug Console**: Export diagnostics from Settings → Debug

---

## 🎯 Good First Issues

Look for issues labeled `good first issue` or `help wanted` on GitHub. These are great starting points for new contributors!

---

## 📜 Code of Conduct

Be respectful, inclusive, and constructive. We're all here to build something great together. 🦞

---

**Thank you for contributing to ClawSuite!** Your efforts help make AI tooling more accessible and powerful for everyone.
