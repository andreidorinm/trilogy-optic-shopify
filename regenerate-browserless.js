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
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  try {
    const page = await browser.newPage();
    
    // Set cookies
    await page.setCookie(...validCookies);
    console.log('✅ Cookies set\n');
    
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
    
    // CRITICAL: Set up listeners BEFORE clicking to catch the temporary URL
    let capturedLink = null;
    let capturedFromPopup = null;
    
    // Listen for new pages/tabs (popups)
    browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        console.log('🔔 New page/popup detected!');
        const newPage = await target.page();
        const url = newPage.url();
        console.log('🔗 Popup URL:', url);
        
        if (url.includes('_bt=')) {
          capturedFromPopup = url;
          console.log('✅ CAPTURED LINK FROM POPUP!');
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
    
    // Try to find the View store button
    console.log('🔍 Looking for "View your online store" button...');
    
    let buttonSelector = null;
    
    // Strategy 1: Try aria-label
    try {
      await page.waitForSelector('button[aria-label*="View"]', { timeout: 5000 });
      buttonSelector = 'button[aria-label*="View"]';
      console.log('✅ Found button by aria-label');
    } catch (e) {
      console.log('⚠️  Button not found by aria-label, trying text content...');
    }
    
    // Strategy 2: Try by text content
    if (!buttonSelector) {
      buttonSelector = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const viewButton = buttons.find(btn => {
          const text = btn.textContent || btn.getAttribute('aria-label') || '';
          return text.toLowerCase().includes('view') && 
                 text.toLowerCase().includes('store');
        });
        
        if (viewButton) {
          viewButton.setAttribute('data-view-store', 'true');
          return '[data-view-store="true"]';
        }
        return null;
      });
    }
    
    if (buttonSelector) {
      console.log(`✅ Found button with selector: ${buttonSelector}\n`);
      console.log('🎯 Now clicking and listening for the link...\n');
      
      // Click the button
      await page.click(buttonSelector);
      console.log('🖱️  Clicked button!');
      
      // Wait a moment for the link to be captured
      await new Promise(resolve => setTimeout(resolve, 3000));
      
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
        }
      }
    } else {
      console.log('❌ Could not find the View store button');
      await page.screenshot({ path: 'error-no-button.png' });
      
      const html = await page.content();
      fs.writeFileSync('page-content.html', html);
      console.log('💾 Saved HTML for inspection');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
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