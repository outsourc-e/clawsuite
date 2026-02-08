# P1: OpenAI Embeddings Quota Exceeded

**Priority:** P1  
**Status:** Open  
**Discovered:** 2026-02-08

## Problem

`memory_search` is disabled because the OpenAI embeddings API returns 429:
```
openai embeddings failed: 429 - You exceeded your current quota
```

This breaks semantic memory search across MEMORY.md and memory/*.md files.

## Impact

- Aurora cannot search memory files semantically
- Falls back to manual file reads (slower, less accurate)
- No impact on core chat or Gateway functionality

## Proposed Fix

### Option A: Disable by default, enable when quota available
- Set embeddings to opt-in in Gateway config
- Memory search gracefully degrades to keyword/FTS search
- Re-enable when OpenAI billing is resolved

### Option B: Switch to free/local embeddings
- Use Ollama with a local embedding model (e.g., nomic-embed-text)
- Zero API cost, works offline
- Requires Ollama running locally

### Option C: Use Google Antigravity embeddings
- Already configured with OAuth (free)
- Needs investigation on embedding model availability

## Recommended

**Option A (immediate):** Disable embeddings, use FTS fallback  
**Option B (medium-term):** Local Ollama embeddings for zero cost

## Action Items

- [ ] Check if OpenClaw supports embedding provider config
- [ ] Test FTS fallback quality
- [ ] Evaluate Ollama embedding models
