# Browser Iframe Embedding Research

## Executive Summary

Embedding a fully interactive web browser via iframe with a local proxy is **fundamentally challenging** due to browser security models. The current setup has two critical issues:

1. **Missing sandbox attributes** prevent full interactivity
2. **URL rewriting is essential** but currently missing - relative URLs and assets won't route through the proxy

## 1. Sandbox Attributes for Full Interactivity

### Current Setup Analysis
```html
<iframe sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads">
```

### ❌ Missing Critical Attributes

Your current sandbox is **too restrictive**. Key missing attributes:

| Missing Attribute | Impact | Fixes |
|-------------------|---------|--------|
| `allow-top-navigation-by-user-activation` | Links with `target="_top"` or navigation don't work | Navigation within embedded sites |
| `allow-pointer-lock` | Cursor capture APIs blocked | Interactive games, drawing apps |
| `allow-presentation` | Presentation API blocked | Screen sharing features |
| `allow-popups-to-escape-sandbox` | Popups inherit sandbox restrictions | External links from popups broken |

### ✅ Recommended Sandbox Configuration

```html
<iframe 
  sandbox="
    allow-same-origin 
    allow-scripts 
    allow-forms 
    allow-popups 
    allow-popups-to-escape-sandbox
    allow-modals 
    allow-downloads
    allow-top-navigation-by-user-activation
    allow-pointer-lock
    allow-presentation
    allow-orientation-lock
  "
  src="http://localhost:9222/proxy?url=https://example.com"
></iframe>
```

**Important Notes:**
- `allow-same-origin` + `allow-scripts` together means the iframe can modify the parent if same-origin. Since you're proxying through localhost, this creates a security boundary.
- `allow-top-navigation` (without `-by-user-activation`) would let scripts navigate your top window without user interaction - **avoid this**.
- Plugins (`<embed>`, `<object>`) are **always blocked** in sandboxed iframes regardless of attributes.

## 2. Should You Remove Sandbox Entirely for Local-Only Proxy?

### ⚠️ Answer: NO, Keep Sandbox

Even for a local-only proxy, keep the sandbox because:

1. **User-triggered malicious sites**: User navigates to a compromised site → it executes in your origin (localhost)
2. **XSS through the proxy**: Injected scripts could access your proxy's origin
3. **Localhost is still an origin**: Without sandbox, embedded content can access localStorage, cookies, and DOM of your app
4. **Defense in depth**: Sandbox provides a security boundary even when serving through localhost

**Exception**: If you're building an electron app or controlled environment where the iframe is truly isolated and you control all loaded content, you could remove it. For a web app accessible in a browser, **keep the sandbox**.

## 3. Cross-Origin Iframe Click Event Issues

### Known Issues with Clicks in Proxied Iframes

Cross-origin iframes served through proxies have **documented issues**:

#### Issue 1: Pointer Events Inheritance
- When iframe has `pointer-events: none` in CSS, clicks pass through but **all** content becomes unclickable
- Cannot selectively allow clicks on specific elements inside the iframe from outside

#### Issue 2: Cross-Origin Event Blocking
- Browser security blocks most cross-origin event propagation
- Parent cannot directly listen to click events inside cross-origin iframe
- `postMessage` API is the **only** sanctioned communication channel

#### Issue 3: Sandbox Restrictions on Pointer Lock
- Without `allow-pointer-lock`, interactive mouse-driven apps fail silently
- Affects canvas apps, drawing tools, games, and map interactions

### Why Your Clicks May Be Buggy

Most likely causes:
1. ✅ **Missing `allow-pointer-lock`** - Add this first
2. ✅ **Missing `allow-popups-to-escape-sandbox`** - Some click handlers open popups
3. ❌ **No URL rewriting** - Clicks on relative links go to wrong destination (see Section 4)
4. ❌ **Event handler confusion** - JavaScript in embedded sites might rely on `window.parent` access which is blocked

## 4. URL Rewriting: **CRITICAL MISSING FEATURE**

### The Problem

Your proxy strips headers but **doesn't rewrite URLs**. When a page loads:

```html
<!-- Original page at https://example.com/page -->
<a href="/about">About</a>
<img src="assets/logo.png">
<script src="/bundle.js"></script>
<link rel="stylesheet" href="../styles.css">
```

These resolve to:
- `http://localhost:9222/about` ❌ (should be `http://localhost:9222/proxy?url=https://example.com/about`)
- `http://localhost:9222/assets/logo.png` ❌
- Browser tries to load from *your proxy's origin*, not through the proxy

### Solution 1: HTML Rewriting (Recommended)

Rewrite all URLs in HTML responses to route through the proxy:

```javascript
// In your Node.js proxy (port 9222)
const cheerio = require('cheerio');
const url = require('url');

function rewriteHtml(html, targetUrl, proxyBaseUrl) {
  const $ = cheerio.load(html);
  const baseUrl = new URL(targetUrl).origin;
  
  // Rewrite common URL attributes
  const urlAttrs = {
    'a': ['href'],
    'link': ['href'],
    'script': ['src'],
    'img': ['src'],
    'iframe': ['src'],
    'form': ['action'],
    'video': ['src', 'poster'],
    'audio': ['src'],
    'source': ['src', 'srcset'],
    'embed': ['src'],
    'object': ['data'],
  };
  
  Object.keys(urlAttrs).forEach(tag => {
    urlAttrs[tag].forEach(attr => {
      $(tag).each((i, el) => {
        const originalUrl = $(el).attr(attr);
        if (originalUrl && !originalUrl.startsWith('data:') && !originalUrl.startsWith('javascript:')) {
          // Convert relative to absolute
          let absoluteUrl;
          try {
            absoluteUrl = new URL(originalUrl, targetUrl).href;
          } catch (e) {
            return; // Skip invalid URLs
          }
          
          // Rewrite to go through proxy
          const proxiedUrl = `${proxyBaseUrl}/proxy?url=${encodeURIComponent(absoluteUrl)}`;
          $(el).attr(attr, proxiedUrl);
        }
      });
    });
  });
  
  // Handle inline styles with url()
  $('[style]').each((i, el) => {
    let style = $(el).attr('style');
    style = style.replace(/url\(['"]?([^'"()]+)['"]?\)/gi, (match, urlPath) => {
      if (!urlPath.startsWith('data:')) {
        const absoluteUrl = new URL(urlPath, targetUrl).href;
        return `url('${proxyBaseUrl}/proxy?url=${encodeURIComponent(absoluteUrl)}')`;
      }
      return match;
    });
    $(el).attr('style', style);
  });
  
  return $.html();
}

// In your proxy handler
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  const response = await fetch(targetUrl);
  
  // Remove frame-busting headers
  const headers = {};
  response.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey !== 'x-frame-options' && 
        lowerKey !== 'content-security-policy' &&
        lowerKey !== 'content-security-policy-report-only') {
      headers[key] = value;
    }
  });
  
  const contentType = headers['content-type'] || '';
  let body = await response.text();
  
  // Rewrite HTML
  if (contentType.includes('text/html')) {
    body = rewriteHtml(body, targetUrl, 'http://localhost:9222');
  }
  
  // Rewrite CSS
  if (contentType.includes('text/css')) {
    body = rewriteCss(body, targetUrl);
  }
  
  // Rewrite JavaScript (more complex, see below)
  if (contentType.includes('javascript') || contentType.includes('application/json')) {
    // Basic string replacement - not perfect but helps
    body = body.replace(
      /(['"])(https?:\/\/[^'"]+)(['"])/g, 
      (match, q1, url, q2) => {
        return `${q1}http://localhost:9222/proxy?url=${encodeURIComponent(url)}${q2}`;
      }
    );
  }
  
  res.set(headers);
  res.send(body);
});

function rewriteCss(css, baseUrl) {
  return css.replace(/url\(['"]?([^'"()]+)['"]?\)/gi, (match, urlPath) => {
    if (!urlPath.startsWith('data:') && !urlPath.startsWith('http')) {
      const absoluteUrl = new URL(urlPath, baseUrl).href;
      return `url('http://localhost:9222/proxy?url=${encodeURIComponent(absoluteUrl)}')`;
    }
    return match;
  });
}
```

### Solution 2: Inject Base Tag (Simpler, Less Reliable)

Inject a `<base>` tag to change URL resolution:

```javascript
function injectBaseTag(html, targetUrl) {
  const baseTag = `<base href="${targetUrl}">`;
  // Inject after <head> tag
  return html.replace(/<head>/i, `<head>${baseTag}`);
}
```

**Problem**: Base tag doesn't work for:
- JavaScript `fetch()` or `XMLHttpRequest` calls
- Dynamic DOM manipulation
- CSS `url()` in stylesheets loaded after base tag
- Service Workers

**Recommendation**: Use HTML rewriting (Solution 1), not just base tag.

## 5. Cookie Handling

### Current Issue

Stripping CORS headers isn't enough. Cookie issues:

1. **Cross-origin cookies blocked by default** (SameSite policy)
2. **Secure cookies** require HTTPS, your proxy is HTTP
3. **Domain mismatch** - cookies for `example.com` won't send to `localhost:9222`

### Solution: Cookie Proxying

```javascript
const tough = require('tough-cookie');
const cookieJar = new tough.CookieJar();

app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  const parsedUrl = new URL(targetUrl);
  
  // Send cookies to target
  const cookieHeader = await cookieJar.getCookieString(targetUrl);
  const fetchHeaders = {
    'Cookie': cookieHeader,
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0...'
  };
  
  const response = await fetch(targetUrl, { headers: fetchHeaders });
  
  // Store cookies from response
  const setCookieHeaders = response.headers.raw()['set-cookie'] || [];
  setCookieHeaders.forEach(cookie => {
    cookieJar.setCookieSync(cookie, targetUrl);
  });
  
  // Rewrite Set-Cookie for client (optional)
  res.set('Set-Cookie', setCookieHeaders.map(c => 
    c.replace(/Domain=[^;]+;?/gi, '')
     .replace(/Secure;?/gi, '')
     .replace(/SameSite=[^;]+;?/gi, 'SameSite=None')
  ));
  
  // ... rest of proxy logic
});
```

**Considerations**:
- Store cookies server-side in the proxy
- Session management: use client session ID to isolate cookie jars per user
- HTTPS-only cookies won't work unless you run proxy on HTTPS with self-signed cert

## 6. How Production Tools Handle This

### Browserless / BrowserBase Approach

**They DON'T use iframes**. Instead:

1. **Remote browser sessions**: Run Chromium/Firefox in cloud
2. **CDP/WebDriver protocol**: Control via Chrome DevTools Protocol
3. **VNC/Screen streaming**: Stream rendered pixels as video/images
4. **API-first**: Expose browser actions as REST/WebSocket APIs

Example (Browserless):
```javascript
// Client-side: no iframe, just API calls
const response = await fetch('https://chrome.browserless.io/screenshot', {
  method: 'POST',
  body: JSON.stringify({
    url: 'https://example.com',
    waitFor: 5000
  })
});
const screenshot = await response.blob();
```

**Why this works better**:
- No cross-origin restrictions
- No frame-busting headers matter
- Full browser automation (clicks, scrolling, form fills)
- Can inject arbitrary JavaScript
- Return screenshots/PDFs/HTML/interactions

### Cobrowse Approach

Cobrowse (co-browsing tools like Surfly, CoBrowse.io):

1. **Proxy + DOM mirroring**: Heavy JavaScript injection
2. **Shadow DOM replication**: Mirror remote DOM changes to local iframe
3. **Event forwarding**: Capture client interactions, send to server, replay on remote browser
4. **WebRTC for streaming**: Low-latency pixel streaming for real-time sync

**Key technique**: Inject massive JavaScript that intercepts **all** DOM mutations, events, and network requests.

```javascript
// Simplified cobrowse injection
(function() {
  const observer = new MutationObserver(mutations => {
    sendToServer({ type: 'dom-mutation', mutations });
  });
  observer.observe(document, { subtree: true, childList: true, attributes: true });
  
  document.addEventListener('click', e => {
    sendToServer({ type: 'click', x: e.clientX, y: e.clientY });
  }, true);
})();
```

## 7. Playwright Proxy vs MITM Proxy vs Your Current Approach

### Comparison Table

| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| **Your Node.js HTTP proxy** | Simple, lightweight, easy to modify responses | No HTTPS interception without certs, limited protocol support | Internal tools, HTTP sites, development |
| **Playwright built-in proxy** | Integrated with browser automation, can modify requests/responses | Requires running full browser instance, heavier | Automated testing, scraping with interaction |
| **MITM Proxy (mitmproxy)** | Full HTTPS/HTTP2/WebSocket support, powerful scripting | Requires cert installation, setup complexity | Security testing, debugging, production proxying |

### Recommended: Hybrid Approach with Playwright

Instead of iframe embedding, use **Playwright with screen streaming**:

```javascript
// Server: Run Playwright browser
const { chromium } = require('playwright');

const browser = await chromium.launch({ 
  proxy: { server: 'http://localhost:9222' } // Your existing proxy
});
const context = await browser.newContext();
const page = await context.newPage();

// Navigate and take screenshots on-demand
await page.goto('https://example.com');
const screenshot = await page.screenshot({ fullPage: false });

// Or stream via CDP
const client = await page.context().newCDPSession(page);
await client.send('Page.startScreencast', {
  format: 'jpeg',
  quality: 80
});

client.on('Page.screencastFrame', ({ data }) => {
  // Send frame to frontend via WebSocket
  wss.clients.forEach(client => {
    client.send(JSON.stringify({ type: 'frame', data }));
  });
});
```

**Frontend**: Display frames in canvas, send interactions back via WebSocket

```javascript
// Client-side
const ws = new WebSocket('ws://localhost:8080');
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  if (type === 'frame') {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = 'data:image/jpeg;base64,' + data;
  }
};

canvas.onclick = (e) => {
  ws.send(JSON.stringify({
    type: 'click',
    x: e.offsetX,
    y: e.offsetY
  }));
};
```

## 8. Final Recommendations

### For Your Current Proxy Approach

**Immediate fixes** (to make iframe approach work better):

1. ✅ **Add missing sandbox attributes**:
   ```html
   sandbox="allow-same-origin allow-scripts allow-forms allow-popups 
            allow-popups-to-escape-sandbox allow-modals allow-downloads 
            allow-top-navigation-by-user-activation allow-pointer-lock"
   ```

2. ✅ **Implement URL rewriting** (use cheerio-based solution in Section 4)

3. ✅ **Add cookie proxying** (use tough-cookie solution in Section 5)

4. ✅ **Handle CSS URL rewriting** (see `rewriteCss` function)

5. ⚠️ **Consider JavaScript rewriting** (complex, may break sites)

### Known Limitations You'll Still Face

Even with all fixes:

- **JavaScript dynamic loading**: Sites using complex JS frameworks (React, Vue) may load chunks dynamically that bypass rewriting
- **WebSockets**: Won't be proxied through HTTP proxy
- **Service Workers**: Will bypass your proxy entirely
- **CORS preflight**: Some API calls will still fail
- **Video/audio streaming**: May not work through proxy
- **WebRTC**: Direct peer connections can't be proxied

### Better Alternative: Playwright + Screen Streaming

If you need **truly interactive** browsing:

1. Use Playwright to run a real browser server-side
2. Stream screenshots/video to frontend
3. Send mouse/keyboard events back via WebSocket
4. Provides full control without cross-origin issues

**When to use each**:

| Use iframe proxy when: | Use Playwright streaming when: |
|------------------------|--------------------------------|
| Mostly static content | Highly interactive sites |
| Simple navigation | Complex web apps (Google Docs, Figma) |
| Few dynamic resources | Heavy JavaScript frameworks |
| Internal tools | Production co-browsing |
| Quick prototype | Scalable solution needed |

## Code Repositories & Tools

### Open Source Proxies with URL Rewriting

1. **php-proxy** - https://github.com/Athlon1600/php-proxy
   - Full URL rewriting, cookie handling
   - Battle-tested for iframe embedding

2. **Alloy Proxy** - https://github.com/titaniumnetwork-dev/alloyproxy
   - Modern Node.js proxy with full rewriting
   - Designed for unrestricted browsing

3. **Ultraviolet** - https://github.com/titaniumnetwork-dev/Ultraviolet
   - Service worker-based proxy (avoids some iframe issues)

### Production Tools Architecture

- **Browserless.io**: Chromium as a service (Docker + CDP)
- **BrowserBase**: Managed browser infrastructure
- **Playwright**: Can be self-hosted for similar capability

## Security Warnings

⚠️ **Important**: Running an open proxy is dangerous:

1. **Restrict access**: Use authentication, IP whitelist, or VPN
2. **Don't allow arbitrary URLs**: Whitelist domains or require auth tokens
3. **Rate limiting**: Prevent abuse/DoS
4. **Logging**: Log all proxied requests for security auditing
5. **No SSRF**: Validate URLs to prevent internal network scanning

```javascript
// Example: URL validation
function isUrlAllowed(url) {
  const parsed = new URL(url);
  
  // Block internal IPs
  if (['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)) {
    return false;
  }
  if (parsed.hostname.startsWith('192.168.') || 
      parsed.hostname.startsWith('10.') ||
      parsed.hostname.startsWith('172.16.')) {
    return false;
  }
  
  // Whitelist approach (recommended)
  const allowedDomains = ['example.com', 'api.example.com'];
  return allowedDomains.includes(parsed.hostname);
}
```

---

## Summary: What To Do Next

1. **Quick win**: Add missing sandbox attributes (5 minute fix)
2. **Critical**: Implement HTML URL rewriting with cheerio (1-2 hours)
3. **Important**: Add CSS URL rewriting (30 minutes)
4. **Nice to have**: Cookie proxying with tough-cookie (1 hour)
5. **Evaluate**: Is iframe approach sufficient, or do you need Playwright streaming?

Test with progressively complex sites:
- Static HTML (Wikipedia) → should work with fixes
- Medium complexity (news sites) → will work mostly
- Heavy JS apps (Gmail, Google Docs) → will likely fail, need Playwright

The iframe+proxy approach is a **80% solution** for many use cases but has fundamental limitations. For a production-grade interactive browser, consider the Playwright streaming architecture.
