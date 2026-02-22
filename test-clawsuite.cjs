const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // Capture console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
  
  // Capture network failures
  const networkErrors = [];
  page.on('requestfailed', request => {
    networkErrors.push({ url: request.url(), failure: request.failure()?.errorText });
  });
  
  try {
    console.log('=== Testing ClawSuite Agent Hub ===\n');
    
    // Test 1: Dashboard page
    console.log('1. Testing Dashboard page...');
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/Users/aurora/.openclaw/workspace/test-dashboard.png', fullPage: true });
    console.log('   Dashboard screenshot saved');
    
    // Test 2: Settings page
    console.log('2. Testing Settings page...');
    await page.goto('http://localhost:3000/settings', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/Users/aurora/.openclaw/workspace/test-settings.png', fullPage: true });
    console.log('   Settings screenshot saved');
    
    // Test 3: Agents page
    console.log('3. Testing Agents page...');
    await page.goto('http://localhost:3000/agents', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/Users/aurora/.openclaw/workspace/test-agents.png', fullPage: true });
    console.log('   Agents screenshot saved');
    
    // Test 4: Tasks page
    console.log('4. Testing Tasks page...');
    await page.goto('http://localhost:3000/tasks', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/Users/aurora/.openclaw/workspace/test-tasks.png', fullPage: true });
    console.log('   Tasks screenshot saved');
    
    // Test 5: Sessions page
    console.log('5. Testing Sessions page...');
    await page.goto('http://localhost:3000/sessions', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/Users/aurora/.openclaw/workspace/test-sessions.png', fullPage: true });
    console.log('   Sessions screenshot saved');
    
    // Test 6: Files page
    console.log('6. Testing Files page...');
    await page.goto('http://localhost:3000/files', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/Users/aurora/.openclaw/workspace/test-files.png', fullPage: true });
    console.log('   Files screenshot saved');
    
    // Test 7: Terminal page
    console.log('7. Testing Terminal page...');
    await page.goto('http://localhost:3000/terminal', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/Users/aurora/.openclaw/workspace/test-terminal.png', fullPage: true });
    console.log('   Terminal screenshot saved');
    
    // Print console messages
    console.log('\n=== Console Messages ===');
    consoleMessages.forEach(msg => {
      if (msg.type === 'error') {
        console.log(`ERROR: ${msg.text}`);
      }
    });
    
    // Print network errors
    console.log('\n=== Network Errors ===');
    if (networkErrors.length === 0) {
      console.log('No network errors');
    } else {
      networkErrors.forEach(err => {
        console.log(`Failed: ${err.url} - ${err.failure}`);
      });
    }
    
    console.log('\n=== Test Complete ===');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
