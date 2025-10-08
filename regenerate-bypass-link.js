const puppeteer = require('puppeteer');
const fs = require('fs');

async function regenerateBypassLink() {
  console.log('🚀 Auto-regenerating Shopify bypass link...\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    // Load cookies from environment variable (set in GitHub Secrets)
    const cookiesString = process.env.SHOPIFY_COOKIES || fs.readFileSync('./shopify-cookies.json', 'utf-8');
    const cookies = JSON.parse(cookiesString);
    
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
    
    // Navigate to themes page
    console.log('🌐 Navigating to Shopify...');
    await page.goto('https://admin.shopify.com/store/trilogyopticdemo/themes', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Wait for page to fully load
    console.log('⏳ Waiting for page to load...');
    await page.waitForSelector('a[href*="_bt="]', { timeout: 30000 });
    
    // Give it a moment to ensure everything is rendered
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Extract bypass link
    console.log('🔍 Extracting bypass link...');
    const bypassLink = await page.evaluate(() => {
      // Try multiple selectors
      
      // Method 1: Find "View your store" button
      const viewStoreButton = Array.from(document.querySelectorAll('a'))
        .find(a => a.textContent.includes('View your store') || a.textContent.includes('View store'));
      if (viewStoreButton && viewStoreButton.href.includes('_bt=')) {
        return viewStoreButton.href;
      }
      
      // Method 2: Find any link with _bt parameter
      const btLink = document.querySelector('a[href*="_bt="]');
      if (btLink) {
        return btLink.href;
      }
      
      // Method 3: Search all links
      const allLinks = Array.from(document.querySelectorAll('a'));
      for (const link of allLinks) {
        if (link.href && link.href.includes('_bt=') && link.href.includes('trilogyoptic.com')) {
          return link.href;
        }
      }
      
      return null;
    });
    
    if (!bypassLink) {
      // Take a screenshot for debugging
      await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
      console.log('📸 Screenshot saved as debug-screenshot.png for debugging');
      throw new Error('Could not find bypass link on the page');
    }
    
    console.log('✅ Link extracted!');
    console.log('🔗 Link preview:', bypassLink.substring(0, 100) + '...\n');
    
    // Check expiration
    try {
      const urlParams = new URLSearchParams(new URL(bypassLink).search);
      const bt = urlParams.get('_bt');
      if (bt) {
        const decoded = JSON.parse(Buffer.from(bt.split('--')[0], 'base64').toString());
        const expiryDate = new Date(decoded._rails.exp);
        const now = new Date();
        const minutesLeft = Math.floor((expiryDate - now) / (1000 * 60));
        
        console.log('📅 New link expires:', expiryDate.toLocaleString('es-ES'));
        console.log(`⏰ Time remaining: ${minutesLeft} minutes\n`);
      }
    } catch (e) {
      console.log('⚠️  Could not decode expiration (non-critical)\n');
    }
    
    // Update index.html
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
    .container { max-width: 450px; }
    .logo {
      font-size: 80px;
      margin-bottom: 20px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    h1 { font-size: 32px; margin-bottom: 15px; }
    p { font-size: 16px; opacity: 0.9; margin-bottom: 30px; line-height: 1.6; }
    .spinner {
      border: 4px solid rgba(255,255,255,0.3);
      border-top: 4px solid white;
      border-radius: 50%;
      width: 60px;
      height: 60px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">👓</div>
    <h1>Trilogy Optic</h1>
    <p>Opening exclusive demo store...</p>
    <div class="spinner"></div>
    <p style="font-size: 14px; opacity: 0.7;">You'll be redirected automatically</p>
  </div>
  
  <script>
    // Backup redirect in case meta refresh doesn't work
    setTimeout(function() {
      window.location.href = '${bypassLink}';
    }, 100);
  </script>
</body>
</html>
<!-- Auto-generated: ${new Date().toISOString()} -->`;
    
    fs.writeFileSync('./index.html', html);
    console.log('✅ index.html updated successfully\n');
    
    await browser.close();
    console.log('✨ Regeneration complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack trace:', error.stack);
    await browser.close();
    process.exit(1);
  }
}

regenerateBypassLink();