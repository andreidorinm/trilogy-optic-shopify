const axios = require('axios');
const fs = require('fs');

async function regenerateLink() {
  console.log('🚀 Regenerating bypass link via Browserless...\n');
  
  const browserlessToken = process.env.BROWSERLESS_TOKEN;
  const cookiesJson = process.env.SHOPIFY_COOKIES;
  
  if (!browserlessToken) {
    throw new Error('BROWSERLESS_TOKEN not set');
  }
  
  if (!cookiesJson) {
    throw new Error('SHOPIFY_COOKIES not set');
  }
  
  console.log('✅ Environment variables loaded\n');
  
  try {
    console.log('🌐 Calling Browserless API...');
    
    const response = await axios.post(
      `https://production-sfo.browserless.io/function?token=${browserlessToken}`,
      {
        code: `
          async ({ page }) => {
            const cookies = ${cookiesJson};
            
            console.log('Setting cookies...');
            const puppeteerCookies = cookies.map(c => ({
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path || '/',
              expires: c.expirationDate,
              httpOnly: c.httpOnly || false,
              secure: c.secure || false,
              sameSite: c.sameSite || 'Lax'
            }));
            
            await page.setCookie(...puppeteerCookies);
            console.log('Cookies set');
            
            console.log('Navigating to Shopify...');
            await page.goto('https://admin.shopify.com/store/trilogyopticdemo/themes', {
              waitUntil: 'networkidle2',
              timeout: 60000
            });
            
            console.log('Page loaded, waiting...');
            await page.waitForTimeout(5000);
            
            const title = await page.title();
            console.log('Page title:', title);
            
            if (title.includes('Just a moment')) {
              throw new Error('Still blocked by Cloudflare');
            }
            
            console.log('Looking for bypass link...');
            const links = await page.evaluate(() => {
              return Array.from(document.querySelectorAll('a')).map(a => ({
                text: a.textContent.trim(),
                href: a.href
              }));
            });
            
            console.log('Found', links.length, 'links');
            
            // Find the bypass link
            let bypassLink = null;
            for (const link of links) {
              if (link.href && link.href.includes('_bt=') && link.href.includes('trilogyoptic.com')) {
                bypassLink = link.href;
                break;
              }
            }
            
            if (!bypassLink) {
              // Try alternative method
              const viewButton = links.find(l => 
                l.text.toLowerCase().includes('view') && 
                l.text.toLowerCase().includes('store')
              );
              if (viewButton) {
                bypassLink = viewButton.href;
              }
            }
            
            return bypassLink;
          }
        `
      },
      {
        timeout: 120000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    const bypassLink = response.data;
    
    console.log('📦 Response received\n');
    
    if (!bypassLink) {
      console.log('❌ No bypass link returned');
      console.log('Response:', JSON.stringify(response.data, null, 2));
      throw new Error('Bypass link not found');
    }
    
    if (!bypassLink.includes('_bt=')) {
      console.log('❌ Invalid bypass link format');
      console.log('Received:', bypassLink);
      throw new Error('Invalid bypass link');
    }
    
    console.log('✅ Bypass link extracted!');
    console.log(`🔗 ${bypassLink.substring(0, 100)}...\n`);
    
    // Check expiration
    try {
      const urlParams = new URLSearchParams(new URL(bypassLink).search);
      const bt = urlParams.get('_bt');
      if (bt) {
        const decoded = JSON.parse(Buffer.from(bt.split('--')[0], 'base64').toString());
        const expiryDate = new Date(decoded._rails.exp);
        const minutesLeft = Math.floor((expiryDate - Date.now()) / (1000 * 60));
        console.log('📅 Expires:', expiryDate.toLocaleString('es-ES'));
        console.log(`⏰ Valid for: ${minutesLeft} minutes\n`);
      }
    } catch (e) {
      console.log('⚠️  Could not decode expiration\n');
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
    console.log('✅ index.html updated successfully\n');
    console.log('✨ Done!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

regenerateLink();