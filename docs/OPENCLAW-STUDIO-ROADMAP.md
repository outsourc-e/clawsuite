# OpenClaw Studio - Development Roadmap

**Created:** 2026-02-06 02:00 EST  
**Status:** Architecture Complete → Awaiting Approval → Prototype Phase

---

## 📚 Documentation Complete

All architecture and agent specs are ready:

1. **[OPENCLAW-STUDIO-ARCHITECTURE.md](./OPENCLAW-STUDIO-ARCHITECTURE.md)** - Complete system design
2. **[specs/SPEC-001-DASHBOARD-INFRASTRUCTURE.md](./specs/SPEC-001-DASHBOARD-INFRASTRUCTURE.md)** - Dashboard + widget grid
3. **[specs/SPEC-002-SKILLS-BROWSER.md](./specs/SPEC-002-SKILLS-BROWSER.md)** - Skills marketplace
4. **[specs/SPEC-003-TERMINAL-INTEGRATION.md](./specs/SPEC-003-TERMINAL-INTEGRATION.md)** - Terminal panel
5. **[specs/SPEC-004-AGENT-VIEW.md](./specs/SPEC-004-AGENT-VIEW.md)** - Agent monitoring sidebar
6. **[specs/SPEC-005-SEARCH.md](./specs/SPEC-005-SEARCH.md)** - Global search modal

---

## 🎯 Vision Summary

**From:** "Better ChatGPT UI"  
**To:** "VSCode for AI Agents"

### Key Features
- 🏠 **Customizable Dashboard** (replaces Mission Control as standalone)
- 💬 **Enhanced Chat** (existing + improvements)
- 🛠️ **Skills Marketplace** (browse, install, configure 3,000+ skills)
- 📁 **File Management** (existing Monaco editor)
- 🖥️ **Integrated Terminal** (bottom panel + full-screen)
- 🔍 **Global Search** (Cmd+K spotlight-style)
- 🤖 **Agent Monitoring** (right sidebar, real-time)

### Product Positioning
- **Target:** Developers tired of ChatGPT black box
- **USP:** Full transparency, local-first, agent orchestration
- **Launch Strategy:** X showcase → GitHub → buildingthefuture.io

---

## 🚀 Recommended Build Order

### Phase 1: Foundation (Week 1)
**Parallel Execution:** Spawn 3 Codex agents simultaneously

1. **dashboard-infra** (Agent 1)
   - Dashboard route + widget grid
   - 3 starter widgets (Tasks, Usage, Agents)
   - **Est:** 4-6 hours, ~$0 (free via CLI)

2. **skills-browser** (Agent 2)
   - Skills screen with tabs
   - Browse installed + ClawdHub
   - Install/uninstall functionality
   - **Est:** 4-5 hours, ~$0

3. **terminal-integration** (Agent 3)
   - Bottom panel integration
   - Terminal component already exists
   - **Est:** 3-4 hours, ~$0

**Deliverable:** Usable MVP with Dashboard, Skills, Terminal

---

### Phase 2: Enhancements (Week 2)
**Parallel Execution:** Spawn 2 more agents

4. **agent-view** (Agent 4)
   - Right sidebar
   - Real-time agent monitoring
   - **Est:** 2-3 hours, ~$0

5. **search-modal** (Agent 5)
   - Cmd+K search
   - Search across chats/files/agents/skills
   - **Est:** 3-4 hours, ~$0

**Deliverable:** Complete core features

---

### Phase 3: Widgets & Polish (Week 3-4)
**Sequential or Parallel**

6. **widget-library** (Agent 6)
   - Weather widget (skill integration)
   - Time & Date widget
   - Cost Tracker widget
   - Quick Notes widget
   - Quick Actions widget
   - **Est:** 6-8 hours total, ~$0

7. **bug-fixes-final** (Agents 7-8)
   - Complete remaining bugs (infinite-refresh, auto-rename)
   - Performance optimization
   - Mobile responsive testing
   - **Est:** 4-6 hours, ~$0

**Deliverable:** Production-ready OpenClaw Studio

---

## 💰 Cost Breakdown

### If Using Codex CLI (FREE via ChatGPT Pro) ✅ RECOMMENDED
- **Total Cost: $0.00**
- All agents use `codex exec --full-auto`
- Unlimited usage via ChatGPT Pro auth

### If Using API (NOT Recommended)
- Est. 1.2M total tokens across 8 agents
- Input: ~1.2M × $1.75/M = $2.10
- Output: ~240k × $14/M = $3.36
- **Total: ~$5.50**

**Recommendation:** Use FREE Codex CLI for all development

---

## 📋 What Needs Forking

### Mission Control → OpenClaw Studio
**Source:** `~/.openclaw/workspace/skills/mission-control/`

**What to Fork:**
- `data/tasks.json` structure (Kanban data)
- Task card components (visual design)
- Webhook integration (optional, for GitHub Pages sync)

**What NOT to Fork:**
- Standalone HTML file (we're building React UI)
- GitHub Pages deployment (Studio is self-hosted)

**Integration Strategy:**
- Dashboard widget pulls from same `tasks.json` file
- Keep Mission Control skill for users who want standalone view
- Add "Open in Mission Control" link from widget

---

## 🔍 ClawdHub Integration

**Available Skills:** 3,000+ (1,715+ curated)

**Top Categories:**
- AI & LLMs: 159 skills
- DevOps & Cloud: 144 skills
- Search & Research: 148 skills
- Productivity & Tasks: 93 skills
- Coding Agents & IDEs: 55 skills

**Integration Plan:**
1. **Parse GitHub repo:** https://github.com/openclaw/skills
2. **Scrape skill metadata** from SKILL.md files
3. **Cache locally** to avoid rate limits
4. **Optional:** Use official ClawdHub API (if available)

---

## ❓ Open Questions

### Priorities
1. **Widget selection for Phase 1?**  
   - Current plan: Tasks, Usage, Active Agents
   - Should we add Weather, Time, or others immediately?

2. **Skills browser scope?**  
   - Embedded ClawdHub search vs. just link to clawhub.com?
   - One-click install or manual CLI instructions?

3. **Terminal UI placement?**  
   - Bottom panel only (VSCode-style) ✅ Recommended
   - Dedicated route also?
   - Both?

4. **Agent view visibility?**  
   - Auto-show on wide screens (1440px+)?
   - Hidden by default, manual toggle?

5. **X Feed widget?**  
   - Worth OAuth complexity?
   - Or skip for v1?

### Launch Strategy
1. **When to deploy landing page?**  
   - After Phase 1 complete?
   - Wait for full feature set?

2. **X (Twitter) announcement timing?**  
   - Soft launch (teaser) now?
   - Full launch after Phase 3?

3. **GitHub repo?**  
   - Public or private initially?
   - Same repo or new one?

---

## 🎬 Next Steps (Awaiting Approval)

### Option A: Start Immediately (All 5 Core Features)
```bash
# Spawn 5 agents in parallel
codex exec --full-auto "Read SPEC-001-DASHBOARD-INFRASTRUCTURE.md and implement"
codex exec --full-auto "Read SPEC-002-SKILLS-BROWSER.md and implement"
codex exec --full-auto "Read SPEC-003-TERMINAL-INTEGRATION.md and implement"
codex exec --full-auto "Read SPEC-004-AGENT-VIEW.md and implement"
codex exec --full-auto "Read SPEC-005-SEARCH.md and implement"
```

**Estimated Completion:** 1-2 days (with parallel execution)  
**Cost:** FREE (Codex CLI)

### Option B: Staged Rollout (3 agents → test → 2 more agents)
```bash
# Phase 1: Core features
codex exec --full-auto "Read SPEC-001-DASHBOARD-INFRASTRUCTURE.md and implement"
codex exec --full-auto "Read SPEC-002-SKILLS-BROWSER.md and implement"
codex exec --full-auto "Read SPEC-003-TERMINAL-INTEGRATION.md and implement"

# Test + Review

# Phase 2: Enhancements
codex exec --full-auto "Read SPEC-004-AGENT-VIEW.md and implement"
codex exec --full-auto "Read SPEC-005-SEARCH.md and implement"
```

**Estimated Completion:** 2-3 days (with review breaks)  
**Cost:** FREE

### Option C: One-by-One (Safest, Slowest)
Build and test each feature sequentially.

**Estimated Completion:** 5-7 days  
**Cost:** FREE

---

## 📊 Success Metrics (3 Months Post-Launch)

### User Acquisition
- [ ] GitHub stars: 500+
- [ ] Discord members: 200+
- [ ] Weekly active users: 100+
- [ ] X followers: 1,000+

### Engagement
- [ ] Avg session time: 30+ min
- [ ] Dashboard widgets enabled: 4+ per user
- [ ] Skills installed: 5+ per user
- [ ] Active agents spawned: 10+ per week per user

### Technical
- [ ] Page load: <2s
- [ ] Terminal latency: <50ms
- [ ] Search response: <200ms
- [ ] Widget refresh: <1s

---

## 🏁 Ready to Execute

All specs are complete and ready for Codex agents. Just need:
1. ✅ User approval on priorities
2. ✅ Answers to questions above
3. ✅ Go/no-go decision

Then we spawn the agents and build in parallel! 🚀

---

**End of Roadmap**
