const { chromium } = require('playwright');
const fs = require('fs');
const path = '/tmp/test-send.png';
const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z8MsAAAAASUVORK5CYII=';
fs.writeFileSync(path, Buffer.from(b64, 'base64'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  const reqs = [];
  const resps = [];

  page.on('console', msg => logs.push({ type: msg.type(), text: msg.text() }));

  page.on('request', req => {
    if (req.url().includes('/api/send')) {
      let body;
      try { body = req.postDataJSON(); } catch { body = req.postData(); }
      reqs.push({ url: req.url(), body });
    }
  });

  page.on('response', async res => {
    if (res.url().includes('/api/send')) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch {}
      resps.push({ url: res.url(), status: res.status(), bodyText });
    }
  });

  await page.goto('http://localhost:3000/new', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('textarea', { timeout: 20000 });

  const input = page.locator('input[type="file"][accept="image/*"]');
  await input.setInputFiles(path);
  await page.waitForTimeout(500);

  await page.fill('textarea', 'image send test');
  try {
    await page.keyboard.press('Meta+Enter');
  } catch {
    await page.keyboard.press('Control+Enter');
  }

  await page.waitForTimeout(4000);

  console.log('REQUESTS\n' + JSON.stringify(reqs, null, 2));
  console.log('RESPONSES\n' + JSON.stringify(resps, null, 2));
  console.log('CONSOLE_ERRORS\n' + JSON.stringify(logs.filter(l => l.type === 'error'), null, 2));

  await browser.close();
})();
