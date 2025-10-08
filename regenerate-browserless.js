const puppeteer = require('puppeteer');
const fs = require('fs');
require('dotenv').config();

async function regenerateLink() {
  console.log('🚀 Starting local Puppeteer automation...\n');
  
  const cookiesJson = process.env.SHOPIFY_COOKIES;
  
  if (!cookiesJson) {
    throw new Error('Missing SHOPIFY_COOKIES in .env');
  }
  
  const cookies = JSON.parse(cookiesJson);
  
  // Filter valid cookies
  const now = Date.now() / 1000;
  const validCookies = cookies
    .filter(c => !c.session && (!c.expirationDate || c.expirationDate >= now))
    .map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain.startsWith('.') ? c.domain : '.' + c.domain,
      path: c.path || '/',
      expires: c.expirationDate ? Math.floor(c.expirationDate) : undefined,
      httpOnly: c.httpOnly || false,
      secure: c.secure || false,
      sameSite: c.sameSite || 'Lax'
    }));
  
  console.log(`🍪 Loaded ${validCookies.length} cookies\n`);
  
  const browser = await puppeteer.launch({
    headless: process.env.CI === 'true' ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });
  
  try {
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set cookies
    await page.setCookie(...validCookies);
    console.log('✅ Cookies set\n');
    
    // CRITICAL: Set up listeners BEFORE navigation to catch the temporary URL
    let capturedLink = null;
    let capturedFromPopup = null;
    
    // Listen for new pages/tabs (popups)
    browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        console.log('🔔 New page/popup detected!');
        const newPage = await target.page();
        if (newPage) {
          const url = newPage.url();
          console.log('🔗 Popup URL:', url);
          
          if (url.includes('_bt=')) {
            capturedFromPopup = url;
            console.log('✅ CAPTURED LINK FROM POPUP!');
          }
        }
      }
    });
    
    // Listen for URL changes on the current page
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        const url = frame.url();
        console.log('🔄 URL changed to:', url);
        
        if (url.includes('_bt=') && !capturedLink) {
          capturedLink = url;
          console.log('✅ CAPTURED LINK FROM NAVIGATION!');
        }
      }
    });
    
    // Listen for request interception (catch the redirect)
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('_bt=') && !capturedLink) {
        capturedLink = url;
        console.log('✅ CAPTURED LINK FROM REQUEST:', url);
      }
      request.continue();
    });
    
    // Navigate to Shopify admin themes page
    console.log('🌐 Navigating to themes page...');
    await page.goto('https://admin.shopify.com/store/trilogyopticdemo/themes', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('📸 Taking screenshot 1...');
    await page.screenshot({ path: 'step1-before-click.png' });
    
    // Wait for the page to be interactive
    console.log('⏳ Waiting for page to be ready...');
    await page.waitForFunction(
      () => document.readyState === 'complete',
      { timeout: 30000 }
    );
    
    // Extra wait for React/dynamic content to load
    await page.waitForTimeout(5000);
    
    // Try to find the View store button
    console.log('🔍 Looking for "View your online store" button...');
    
    // Wait for page body
    await page.waitForSelector('body', { timeout: 30000 });
    
    // Take a debug screenshot
    await page.screenshot({ path: 'debug-page.png', fullPage: true });
    console.log('📸 Saved debug screenshot');
    
    // Get page content for debugging
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('📄 Page preview:', pageText.substring(0, 300));
    
    // Try to find button
    let buttonSelector = null;
    
    // Strategy 1: Wait for any button
    try {
      await page.waitForSelector('button', { timeout: 10000 });
      console.log('✅ Found some buttons on page');
    } catch (e) {
      console.log('⚠️  No buttons found at all');
    }
    
    // Strategy 2: Find the button by multiple methods
    buttonSelector = await page.evaluate(() => {
      // Look for the button in multiple ways
      const searches = [
        // By aria-label
        document.querySelector('button[aria-label*="View"]'),
        document.querySelector('a[aria-label*="View"]'),
        document.querySelector('button[aria-label*="view"]'),
        document.querySelector('a[aria-label*="view"]'),
      ];
      
      // By text content
      const allElements = Array.from(document.querySelectorAll('button, a'));
      const textSearch = allElements.find(el => {
        const text = (el.textContent || '').toLowerCase();
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        return (text.includes('view') && text.includes('store')) ||
               (label.includes('view') && label.includes('store')) ||
               text.includes('view your online store') ||
               label.includes('view your online store');
      });
      
      if (textSearch) searches.push(textSearch);
      
      // By data attributes
      searches.push(
        document.querySelector('[data-primary-action="VIEW_STORE"]'),
        document.querySelector('button[data-action*="view"]')
      );
      
      const button = searches.find(el => el);
      
      if (button) {
        button.setAttribute('data-found-button', 'true');
        console.log('Found button:', button.textContent || button.getAttribute('aria-label'));
        return '[data-found-button="true"]';
      }
      
      return null;
    });
    
    if (buttonSelector) {
      console.log(`✅ Found button with selector: ${buttonSelector}\n`);
      console.log('🎯 Now clicking and listening for the link...\n');
      
      // Click the button
      await page.click(buttonSelector);
      console.log('🖱️  Clicked button!');
      
      // Wait for the link to be captured
      await page.waitForTimeout(5000);
      
      console.log('📸 Taking screenshot 2...');
      await page.screenshot({ path: 'step2-after-click.png' });
      
      // Check what we captured
      const finalLink = capturedFromPopup || capturedLink;
      
      if (finalLink) {
        console.log('\n🎉 SUCCESS! Captured the bypass link!');
        console.log(`🔗 ${finalLink}\n`);
        updateHtmlFile(finalLink);
      } else {
        console.log('\n⚠️  No link captured by listeners. Trying manual extraction...\n');
        
        // Fallback: check page content
        const html = await page.content();
        fs.writeFileSync('page-content.html', html);
        
        const btMatch = html.match(/(https?:\/\/[^"'\s]*_bt=[^"'\s&]*)/i);
        if (btMatch) {
          console.log('🔍 Found in HTML via regex!');
          console.log(`🔗 ${btMatch[0]}\n`);
          updateHtmlFile(btMatch[0]);
        } else {
          console.log('❌ No _bt link found anywhere.');
          console.log('💾 Check page-content.html and screenshots manually.');
          throw new Error('Bypass link not found');
        }
      }
    } else {
      console.log('❌ Could not find the View store button');
      
      // Debug: List all buttons on the page
      const allButtons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button, a'))
          .slice(0, 20)
          .map(el => ({
            tag: el.tagName,
            text: el.textContent?.substring(0, 100),
            ariaLabel: el.getAttribute('aria-label'),
            classes: el.className,
            id: el.id
          }));
      });
      
      console.log('🔍 First 20 buttons/links on page:');
      console.log(JSON.stringify(allButtons, null, 2));
      
      await page.screenshot({ path: 'error-no-button.png', fullPage: true });
      
      const html = await page.content();
      fs.writeFileSync('page-content.html', html);
      console.log('💾 Saved HTML for inspection');
      
      throw new Error('Could not find View store button');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await browser.close();
  }
}

function updateHtmlFile(bypassLink) {
  // Clean the link
  bypassLink = bypassLink.trim();
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="0;url=${bypassLink}">
  <title>Trilogy Optic - Demo Store</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-align: center;
      padding: 20px;
    }
    .logo { font-size: 80px; margin-bottom: 20px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
    .spinner {
      border: 4px solid rgba(255,255,255,0.3);
      border-top: 4px solid white;
      border-radius: 50%;
      width: 60px;
      height: 60px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div>
    <div class="logo">👓</div>
    <h1>Trilogy Optic</h1>
    <div class="spinner"></div>
    <p>Opening demo store...</p>
  </div>
  <script>
    setTimeout(() => window.location.href = '${bypassLink}', 100);
  </script>
</body>
</html>
<!-- Updated: ${new Date().toISOString()} -->`;
  
  fs.writeFileSync('./index.html', html);
  console.log('✅ index.html updated successfully!');
  console.log('✨ Done!\n');
}

regenerateLink().catch(console.error);