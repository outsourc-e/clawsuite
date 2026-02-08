# Release Checklist

## Pre-release
- [ ] `npm run build` passes cleanly
- [ ] `npx vitest run` — all tests pass
- [ ] No `console.log` in production code
- [ ] No API keys, tokens, or secrets in any browser-facing code
- [ ] No hardcoded demo data visible in UI
- [ ] Version bumped in `package.json`
- [ ] CHANGELOG.md updated with new version entry
- [ ] All feature branches merged to `main`

## Release
- [ ] `git tag v<version>` on main
- [ ] `git push production main --tags`
- [ ] Verify build artifacts are correct size (no unexpected bloat)

## Post-release
- [ ] Verify tag appears on GitHub
- [ ] Smoke test: `npm run dev` → check each screen loads
- [ ] Check dashboard widgets render (no blank/error states)
- [ ] Verify model switcher works with at least one provider
- [ ] Check activity log shows Gateway events
- [ ] Confirm debug console loads and shows connection status
