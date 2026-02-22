const { chromium } = require('playwright');

function now(){return new Date().toISOString()}

(async()=>{
  const results = {
    startedAt: now(),
    baseUrl: 'http://localhost:3000',
    checks: [],
    findings: [],
    consoleErrors: [],
    requestFailures: [],
    apiCalls: {},
    apiErrors: [],
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  function recordCheck(name, ok, details='') {
    results.checks.push({ name, ok, details });
    if (!ok) results.findings.push({ name, details });
  }

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      results.consoleErrors.push(msg.text());
    }
  });

  page.on('requestfailed', (req) => {
    results.requestFailures.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText || 'unknown',
    });
  });

  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    const path = new URL(url).pathname;
    results.apiCalls[path] = (results.apiCalls[path] || 0) + 1;
    if (res.status() >= 400) {
      let body = '';
      try { body = await res.text(); } catch {}
      results.apiErrors.push({ path, status: res.status(), body: body.slice(0, 300) });
    }
  });

  async function goto(path){
    await page.goto(`http://localhost:3000${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(800);
  }

  async function ensureSidebarOpen(){
    const dashboardLink = page.getByRole('link', { name: 'Dashboard' });
    if (await dashboardLink.count()) return;
    const openButton = page.getByRole('button', { name: /Open Sidebar|Close Sidebar/i });
    if (await openButton.count()) {
      await openButton.first().click();
      await page.waitForTimeout(400);
    }
  }

  try {
    await goto('/dashboard');
    await ensureSidebarOpen();
    recordCheck('app_load_dashboard', true, 'Loaded /dashboard');

    const navTargets = [
      ['Dashboard', '/dashboard'],
      ['Terminal', '/terminal'],
      ['Tasks', '/tasks'],
      ['Skills', '/skills'],
      ['Cron Jobs', '/cron'],
      ['Logs', '/activity'],
      ['Debug', '/debug'],
      ['Files', '/files'],
      ['Memory', '/memory'],
      ['Channels', '/channels'],
      ['Sessions', '/sessions'],
      ['Usage', '/usage'],
      ['Agents', '/agents'],
      ['Nodes', '/nodes'],
    ];

    for (const [label, path] of navTargets) {
      await ensureSidebarOpen();
      const link = page.getByRole('link', { name: label }).first();
      if ((await link.count()) === 0) {
        recordCheck(`nav_${label}`, false, `Missing sidebar link: ${label}`);
        continue;
      }
      await link.click();
      await page.waitForTimeout(900);
      const ok = page.url().includes(path);
      recordCheck(`nav_${label}`, ok, `Expected ${path}, got ${page.url()}`);
    }

    await goto('/tasks');
    await page.getByRole('button', { name: 'New Task' }).click();
    const taskTitle = `QA Task ${Date.now()}`;
    await page.getByPlaceholder('Task title…').fill(taskTitle);
    await page.getByRole('button', { name: 'Add Task' }).click();
    await page.waitForTimeout(500);
    const taskCard = page.locator('article').filter({ hasText: taskTitle }).first();
    const taskCreated = (await taskCard.count()) > 0;
    recordCheck('form_tasks_add', taskCreated, taskCreated ? 'Task added' : 'Task card not found after add');

    if (taskCreated) {
      await taskCard.click();
      await page.getByRole('button', { name: 'Edit' }).click();
      const editedTitle = `${taskTitle} Edited`;
      const editInput = page.locator('input[type="text"]').first();
      await editInput.fill(editedTitle);
      await page.getByRole('button', { name: 'Save' }).click();
      await page.getByRole('button', { name: 'Close' }).click();
      await page.waitForTimeout(400);
      const editedCard = page.locator('article').filter({ hasText: editedTitle }).first();
      const editedOk = (await editedCard.count()) > 0;
      recordCheck('form_tasks_edit', editedOk, editedOk ? 'Task edited' : 'Edited title not found');
    }

    await goto('/dashboard');
    await ensureSidebarOpen();
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Advanced' }).click();
    const gatewayInput = page.getByLabel('Gateway URL');
    await gatewayInput.fill('not-a-url');
    await page.waitForTimeout(300);
    const invalidMsg = page.getByText('Invalid URL format');
    const invalidShown = (await invalidMsg.count()) > 0;
    recordCheck('form_settings_invalid_url', invalidShown, invalidShown ? 'Validation shown' : 'Validation not shown');

    await gatewayInput.fill('http://localhost:3000');
    await page.waitForTimeout(300);
    const invalidGone = (await invalidMsg.count()) === 0;
    recordCheck('form_settings_valid_url', invalidGone, invalidGone ? 'Validation cleared' : 'Validation still visible');

    const testBtn = page.getByRole('button', { name: 'Test' }).first();
    await testBtn.click();
    await page.waitForTimeout(1200);
    const connectedBadge = page.getByText('Connected').first();
    const connected = (await connectedBadge.count()) > 0;
    recordCheck('form_settings_test_connection', connected, connected ? 'Connection status connected' : 'Connected status not visible');

    const closeBtn = page.getByRole('button', { name: 'Close' }).first();
    if ((await closeBtn.count()) > 0) await closeBtn.click();

    await goto('/agent-swarm');
    const spawnBtn = page.getByRole('button', { name: 'Spawn' }).first();
    const spawnExists = (await spawnBtn.count()) > 0;
    if (!spawnExists) {
      recordCheck('spawn_button_present', false, 'No Spawn button found on /agent-swarm');
    } else {
      await spawnBtn.click();
      await page.waitForTimeout(1800);
      const spawnApiHit = (results.apiCalls['/api/sessions'] || 0) > 0;
      recordCheck('spawn_api_called', spawnApiHit, `POST /api/sessions calls: ${results.apiCalls['/api/sessions'] || 0}`);
    }

    const steerBtn = page.getByRole('button', { name: 'Steer' }).first();
    if ((await steerBtn.count()) > 0) {
      await steerBtn.click();
      await page.waitForTimeout(500);
      const spawnFirstNotice = page.getByText('Spawn agent first');
      const noticeShown = (await spawnFirstNotice.count()) > 0;
      recordCheck('error_handling_spawn_first_notice', noticeShown, noticeShown ? 'Notice shown for invalid steer' : 'No spawn-first notice observed');
    }

    await goto('/chat/main');
    const textarea = page.locator('textarea').last();
    await textarea.click();
    await textarea.fill(`QA streaming probe ${Date.now()}`);
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.waitForTimeout(3500);

    const sendStreamCalled = (results.apiCalls['/api/send-stream'] || 0) > 0;
    const chatEventsCalled = (results.apiCalls['/api/chat-events'] || 0) > 0;
    recordCheck('stream_send_stream_called', sendStreamCalled, `/api/send-stream calls: ${results.apiCalls['/api/send-stream'] || 0}`);
    recordCheck('stream_chat_events_called', chatEventsCalled, `/api/chat-events calls: ${results.apiCalls['/api/chat-events'] || 0}`);

    const sendError = await page.evaluate(async () => {
      const res = await fetch('/api/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    });
    const sendErrorOk = sendError.status === 400 && sendError.body && sendError.body.error === 'message required';
    recordCheck('error_handling_api_send_400', sendErrorOk, JSON.stringify(sendError));

  } catch (err) {
    recordCheck('qa_runner_exception', false, err instanceof Error ? err.stack || err.message : String(err));
  } finally {
    results.endedAt = now();
    await page.screenshot({ path: '/tmp/full-qa-final.png', fullPage: true }).catch(()=>{});
    await browser.close();
  }

  require('fs').writeFileSync('/tmp/full-qa-results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ summary: {
    checks: results.checks.length,
    failed: results.checks.filter(c=>!c.ok).length,
    apiErrors: results.apiErrors.length,
    consoleErrors: results.consoleErrors.length,
    requestFailures: results.requestFailures.length
  }}, null, 2));
})();
