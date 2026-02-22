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
    console.log('=== Testing ClawSuite Chat Page ===\n');
    
    // Test: Chat page
    console.log('Testing Chat page...');
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/Users/aurora/.openclaw/workspace/test-chat.png', fullPage: true });
    console.log('   Chat screenshot saved');
    
    // Try to type in the composer
    console.log('Testing chat input...');
    const composerInput = await page.$('textarea');
    if (composerInput) {
      await composerInput.fill('Hello, this is a test message');
      console.log('   Input field works');
      await page.screenshot({ path: '/Users/aurora/.openclaw/workspace/test-chat-typed.png', fullPage: true });
      console.log('   Chat with typed message screenshot saved');
    } else {
      console.log('   Could not find composer input');
    }
    
    // Print console messages
    console.log('\n=== Console Messages (Errors Only) ===');
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
