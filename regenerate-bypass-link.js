const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

async function regenerateBypassLink() {
  console.log('🚀 Auto-regenerating Shopify bypass link...\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
  });
  
  const page = await browser.newPage();
  
  // Set extra headers to look more like a real browser
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document'
  });
  
  try {
    // Load cookies
    const cookiesString = process.env.SHOPIFY_COOKIES || fs.readFileSync('./shopify-cookies.json', 'utf-8');
    const cookies = JSON.parse(cookiesString);
    
    console.log(`📊 Loaded ${cookies.length} cookies\n`);
    
    // Convert to Puppeteer format
    const puppeteerCookies = cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      expires: c.expirationDate || undefined,
      httpOnly: c.httpOnly || false,
      secure: c.secure || false,
      sameSite: c.sameSite || 'Lax'
    }));
    
    await page.setCookie(...puppeteerCookies);
    console.log('✅ Cookies loaded\n');
    
    // Navigate
    console.log('🌐 Navigating to Shopify themes page...');
    const response = await page.goto('https://admin.shopify.com/store/trilogyopticdemo/themes', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log(`📄 Page status: ${response.status()}`);
    console.log(`📍 Final URL: ${page.url()}`);
    
    const title = await page.title();
    console.log(`📝 Page title: ${title}\n`);
    
    // Check if still blocked
    if (title.includes('Just a moment') || response.status() === 403) {
      console.log('⚠️  Still blocked by Cloudflare bot protection\n');
      await page.screenshot({ path: 'blocked.png', fullPage: true });
      throw new Error('Cloudflare bot protection blocking access');
    }
    
    // Check for login redirect
    if (page.url().includes('login') || page.url().includes('accounts.shopify.com')) {
      console.log('❌ Redirected to login - cookies expired!\n');
      await page.screenshot({ path: 'login-redirect.png', fullPage: true });
      throw new Error('Session expired - please refresh cookies');
    }
    
    // Wait for content
    console.log('⏳ Waiting for page to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Take screenshot
    await page.screenshot({ path: 'themes-page.png', fullPage: true });
    console.log('📸 Screenshot saved\n');
    
    // Find links
    console.log('🔍 Searching for bypass link...');
    const allLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(a => ({
        text: a.textContent.trim().substring(0, 50),
        href: a.href
      }));
    });
    
    console.log(`📊 Found ${allLinks.length} links\n`);
    
    if (allLinks.length === 0) {
      console.log('❌ No links found - page might not have loaded\n');
      const html = await page.content();
      fs.writeFileSync('page-content.html', html);
      throw new Error('Page content did not load properly');
    }
    
    // Extract bypass link
    const bypassLink = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('a'));
      
      // Look for "View" buttons
      for (const btn of buttons) {
        const text = btn.textContent.toLowerCase();
        if ((text.includes('view') && text.includes('store')) || text.includes('preview')) {
          if (btn.href && btn.href.includes('_bt=')) {
            return btn.href;
          }
        }
      }
      
      // Look for any _bt link
      for (const btn of buttons) {
        if (btn.href && btn.href.includes('_bt=') && btn.href.includes('trilogyoptic.com')) {
          return btn.href;
        }
      }
      
      return null;
    });
    
    if (!bypassLink) {
      console.log('❌ Bypass link not found\n');
      console.log('Sample links:');
      allLinks.slice(0, 10).forEach(l => console.log(`  - ${l.text} → ${l.href.substring(0, 80)}`));
      throw new Error('Bypass link not found on page');
    }
    
    console.log('✅ Link found!');
    console.log(`🔗 ${bypassLink.substring(0, 100)}...\n`);
    
    // Update HTML
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
    console.log('✅ index.html updated\n');
    
    await browser.close();
    console.log('✨ Done!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await browser.close();
    process.exit(1);
  }
}

regenerateBypassLink();