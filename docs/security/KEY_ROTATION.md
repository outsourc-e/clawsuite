# Key Rotation Guide

If API keys or secrets are accidentally leaked (committed to git, shared publicly, etc.), follow this guide to rotate them immediately.

## Immediate Steps

1. **Stop using the leaked key** - revoke or disable it at the provider
2. **Generate a new key** at the provider's dashboard
3. **Update your local config** with the new key
4. **Verify the new key works** before cleaning up

## Provider-Specific Rotation

### Anthropic (Claude)
1. Go to https://console.anthropic.com/settings/keys
2. Delete the compromised key
3. Create a new key
4. Update in `~/.openclaw/openclaw.json` under `models.providers.anthropic.api`

### OpenAI
1. Go to https://platform.openai.com/api-keys
2. Delete the compromised key
3. Create a new key
4. Update in `~/.openclaw/openclaw.json` under `models.providers.openai.api`

### OpenRouter
1. Go to https://openrouter.ai/keys
2. Delete the compromised key
3. Create a new key
4. Update in config

### GitHub
1. Go to https://github.com/settings/tokens
2. Delete the compromised token
3. Create a new token with minimum required scopes
4. Update in your environment/config

## Removing from Git History

If the secret was committed to git:

```bash
# Option 1: BFG Repo Cleaner (recommended for large repos)
# Install BFG: brew install bfg
bfg --replace-text secrets.txt your-repo.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force

# Option 2: git filter-branch (built-in)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch path/to/secret/file" \
  --prune-empty --tag-name-filter cat -- --all
git push --force
```

## Prevention Checklist

- [ ] Enable GitHub's secret scanning in repository settings
- [ ] Use `.env` files (gitignored) for local secrets
- [ ] Never commit `.env` files to git
- [ ] Review PRs carefully for accidental secret exposure
- [ ] Use the diagnostics export feature (auto-redacted) for bug reports

## CI Protection

This repository has CI guardrails that:
- Scan for common secret patterns on every PR
- Fail the build if potential secrets are detected
- Use Gitleaks for comprehensive scanning

If CI fails with a secrets warning, **do not merge** until the issue is resolved.

## Contact

For security concerns, contact: security@openclaw.ai
