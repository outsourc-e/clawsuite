# Lint Fix Task

Fix ALL 45 remaining ESLint errors in the webclaw-ui project. Run `npx eslint src/ --quiet` to see them.

## Error Categories

### 1. `@typescript-eslint/no-unnecessary-condition` (most errors)
These are in files where TypeScript says values are always truthy/falsy/non-nullish but the code has defensive checks. 

**Fix strategy:** Most of these are runtime safety guards that TypeScript can't fully reason about (e.g., data from API responses, optional chaining on potentially null values at runtime). The correct fix is usually to add a type assertion or adjust the type to be `| undefined` / `| null` where appropriate. Do NOT just delete the safety checks — they protect against runtime edge cases. Instead:
- If the value truly can't be null at runtime → remove the check
- If it's a defensive guard against API data → widen the type with `| undefined` or `| null`
- If it's just TypeScript being overly strict → add `// eslint-disable-next-line` with a brief comment

### 2. `no-useless-escape` in search-modal.tsx line 148
Remove unnecessary backslash escapes in the regex/string.

### 3. `no-unsafe-finally` in use-agent-view.ts line 582
Don't use `return` inside a `finally` block. Move the return outside.

### 4. File list with errors:
- `src/components/prompt-kit/scroll-button.tsx` (1 error)
- `src/components/search/search-modal.tsx` (8 errors)
- `src/components/terminal/terminal-panel.tsx` (11 errors)
- `src/components/terminal/terminal-workspace.tsx` (5 errors)
- `src/hooks/use-agent-view.ts` (1 error)
- `src/routes/api/session-title.ts` (1 error)
- `src/routes/api/skills.ts` (1 error)
- `src/routes/api/stream.ts` (1 error)
- `src/screens/chat/chat-screen.tsx` (6 errors)
- `src/screens/chat/hooks/use-chat-history.ts` (3 errors)
- `src/screens/chat/hooks/use-chat-sessions.ts` (1 error)
- `src/screens/chat/hooks/use-streaming-message.ts` (1 error)
- `src/screens/chat/session-title-store.ts` (2 errors)
- `src/screens/chat/session-tombstones.ts` (1 error)
- `src/server/gateway-stream.ts` (2 errors)

## Verification
After fixing, run:
1. `npx eslint src/ --quiet` → should show 0 errors
2. `npm run build` → should succeed
