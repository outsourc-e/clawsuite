# Next.js Deployment Strategies: Vercel vs Cloudflare vs Self-Hosted

*Research compiled February 2026*

## Executive Summary

| Strategy | Monthly Cost | Best For | Trade-offs |
|----------|--------------|----------|------------|
| **Vercel** | $0-20+ (usage-based) | Best DX, native Next.js | Per-seat pricing, potential cost spikes |
| **Cloudflare** | $0-20 (generous free tier) | Global edge, budget-conscious | Runtime differences from Node.js |
| **Self-Hosted** | $5-20 (fixed) | Full control, predictable costs | Manual ops, no edge deployment |

---

## 1. Vercel (The Default Choice)

Vercel is the company behind Next.js, making it the most integrated hosting option.

### Pricing Breakdown

| Plan | Base Cost | Bandwidth | Function Invocations | Image Optimization |
|------|-----------|-----------|---------------------|-------------------|
| Hobby (Free) | $0 | 100GB/mo | 1M | 5,000/mo |
| Pro | $20/mo + usage | 1TB/mo | 1M | 5,000/mo |
| Enterprise | Custom | Custom | Custom | Custom |

**Overages (Pro):**
- Bandwidth: $40/100GB
- Serverless Functions: $0.18/GB-hour (after 1000 GB-hours)
- Edge Middleware: $0.65/million (after 1M)
- Image Optimization: $5/1000 images

**Per-seat pricing**: $20/developer/month (adds up for teams)

### Pros
- ✅ Zero-configuration deployment for Next.js
- ✅ Instant preview URLs for every PR
- ✅ First to support new Next.js features (PPR, Server Actions)
- ✅ Built-in analytics, Web Vitals monitoring
- ✅ Edge network with 100+ global locations
- ✅ Built-in Skew Protection (Pro/Enterprise)

### Cons
- ❌ Per-seat pricing adds up quickly for teams
- ❌ Usage-based pricing can spike unexpectedly
- ❌ Vendor lock-in for Vercel-specific features (KV, Blob, Edge Config)
- ❌ Function timeout limits (10s Hobby, 60s Pro)
- ❌ No SSH access or custom runtime control

### Real-World Cost Examples

| Traffic | Estimated Monthly Cost |
|---------|----------------------|
| 100K pageviews | $20-30 |
| 500K pageviews | $50-100 |
| 1M pageviews | $100-300 |
| 5M pageviews | $500-1,500+ |

---

## 2. Cloudflare Workers/Pages (Edge Performance)

Cloudflare runs your app at the edge across 300+ cities globally. Uses OpenNext adapter for Next.js compatibility.

### Pricing Breakdown

| Plan | Base Cost | Bandwidth | Worker Requests | Builds |
|------|-----------|-----------|-----------------|--------|
| Free | $0 | **Unlimited** | 100K/day | 500/mo |
| Pro | $20/mo | **Unlimited** | 10M/mo | 5,000/mo |
| Workers Paid | $5/mo | Unlimited | 10M/mo | - |

**Key advantage**: Unlimited bandwidth on all plans (vs. Vercel's $40/100GB overage)

### Pros
- ✅ Unlimited bandwidth on all plans
- ✅ Sub-50ms latency globally (300+ edge locations)
- ✅ Generous free tier (100K requests/day)
- ✅ Excellent DDoS protection included
- ✅ Integrated ecosystem (R2 storage, D1 database, KV)
- ✅ Tiny cold starts with V8 isolates

### Cons
- ❌ Requires OpenNext adapter (extra build step)
- ❌ Workers runtime differs from Node.js (some APIs unavailable)
- ❌ npm package compatibility issues possible
- ❌ Some Next.js patterns need adaptation
- ❌ Debugging can be more complex

### Compatibility Notes

As of January 2026, `@opennextjs/cloudflare` adapter supports:
- Next.js 14+
- Node.js runtime (not just Edge)
- Most core Next.js features

**May require workarounds**: Nodemailer, file system operations, certain crypto methods

### Deployment

```bash
npm create cloudflare@latest -- my-next-app --framework=next --platform=workers
```

---

## 3. Self-Hosted VPS (Maximum Control)

Run Next.js on a VPS from providers like Hetzner, DigitalOcean, or Contabo. Use Coolify (open source) for Vercel-like DX.

### Pricing Comparison (VPS Providers)

| Provider | Entry VPS | CPU/RAM | Bandwidth |
|----------|-----------|---------|-----------|
| Hetzner | €4.49/mo (~$5) | 2 vCPU / 4GB | 20TB |
| DigitalOcean | $6/mo | 1 vCPU / 1GB | 1TB |
| Contabo | €4.99/mo (~$5.50) | 4 vCPU / 8GB | 32TB |
| Railway | $5/mo + usage | Usage-based | Usage-based |

### Cost Comparison at Scale

| Monthly Traffic | Vercel Pro | Self-Hosted VPS | Savings |
|-----------------|------------|-----------------|---------|
| 100K pageviews | $20-30 | ~$5 | ~75% |
| 500K pageviews | $50-100 | ~$5 | ~90% |
| 1M pageviews | $100-300 | ~$9 | ~95% |
| 5M pageviews | $500-1,500 | ~$18 | >95% |

### Pros
- ✅ **Fixed, predictable costs** (no usage surprises)
- ✅ Full control over infrastructure
- ✅ No vendor lock-in (standard Node.js)
- ✅ Run multiple apps on one server
- ✅ Any npm package works
- ✅ WebSockets, background jobs, custom runtimes
- ✅ With Coolify: git push deploy, preview URLs, auto SSL

### Cons
- ❌ You manage security updates and patches
- ❌ No automatic scaling
- ❌ Single point of failure (without redundancy setup)
- ❌ No edge deployment
- ❌ Debugging is on you (no support team)
- ❌ Requires Linux knowledge

### Recommended Stack

```
VPS (Hetzner/DO) + Node.js + PM2 + Caddy + Coolify
```

**Coolify** provides:
- Git push deploy
- Preview URLs for PRs
- Automatic SSL
- Monitoring
- One-click databases

### Deployment Example

```bash
# Install Coolify on your VPS
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

---

## Feature Comparison Matrix

| Feature | Vercel | Cloudflare | Self-Hosted |
|---------|--------|------------|-------------|
| App Router | ✅ Full | ✅ Full | ✅ Full |
| Server Components | ✅ Full | ✅ Full | ✅ Full |
| ISR | ✅ Native | ✅ Via adapter | ✅ Full |
| Edge Functions | ✅ Native | ✅ Workers | ❌ No |
| Middleware | ✅ Edge | ✅ Edge | ✅ Node |
| Image Optimization | ✅ Native | ⚠️ Manual/CDN | ✅ Native |
| Preview Deploys | ✅ Auto | ✅ Auto | ⚠️ With Coolify |
| Built-in DB | ✅ Postgres | ✅ D1/R2 | ✅ Any |
| WebSockets | ⚠️ Limited | ✅ Yes | ✅ Yes |
| Cold Starts | ⚠️ Possible | ✅ Minimal | ✅ None |

---

## Recommendations by Use Case

### 🚀 Beginners & MVPs
**→ Vercel Free Tier**
- Zero friction, just works
- Great for validating ideas
- Upgrade when you scale

### 💰 Cost-Conscious / Growing SaaS
**→ Self-Hosted with Coolify on Hetzner**
- $5-10/month handles significant traffic
- Predictable costs, no surprises
- 10-20% of Vercel's cost at scale

### 🌍 Global Edge Performance
**→ Cloudflare Workers via OpenNext**
- 300+ edge locations
- Sub-50ms latency worldwide
- Great free tier

### 🏢 Enterprise / AWS Mandate
**→ AWS with OpenNext + SST**
- Maximum control
- VPC/compliance requirements
- Existing AWS infrastructure

### ⚡ Real-Time / WebSocket Apps
**→ Fly.io or Self-Hosted**
- No serverless cold starts
- Persistent connections
- Global VMs at edge

---

## Migration Checklist (Vercel → Alternative)

1. [ ] Remove Vercel-specific packages (`@vercel/og`, `@vercel/analytics`, edge config)
2. [ ] Update `next.config.js` for image optimization
3. [ ] Test locally: `npm run build && npm run start`
4. [ ] Set up CI/CD (GitHub Actions recommended)
5. [ ] Configure SSL/reverse proxy
6. [ ] Update DNS records
7. [ ] Set up monitoring/uptime checks
8. [ ] Monitor 404s and Search Console post-launch

---

## Bottom Line

| If you want... | Choose... | Estimated Monthly Cost |
|----------------|-----------|----------------------|
| Easiest setup | Vercel | $0-20+ |
| Best edge performance + low cost | Cloudflare | $0-20 |
| Maximum savings at scale | Self-Hosted | $5-20 (fixed) |
| Best of managed + predictable | Railway | $10-30 |

**For ClawSuite**: Given it's a web app likely to grow, starting with **Vercel** for simplicity makes sense, but consider **self-hosted on Hetzner with Coolify** or **Cloudflare** if costs become a concern at scale. A $6/mo VPS can handle what Vercel would charge $100+/mo for.
