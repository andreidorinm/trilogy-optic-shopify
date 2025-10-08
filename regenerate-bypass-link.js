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
      timeout: 30000
    });
    
    await page.waitForTimeout(3000);
    
    // Extract bypass link
    console.log('🔍 Extracting bypass link...');
    const bypassLink = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('a'))
        .find(a => a.textContent.includes('View your store'));
      if (button) return button.href;
      
      const polarisButton = document.querySelector('a[href*="_bt="]');
      return polarisButton ? polarisButton.href : null;
    });
    
    if (!bypassLink) {
      throw new Error('Could not find bypass link');
    }
    
    console.log('✅ Link extracted:', bypassLink.substring(0, 80) + '...\n');
    
    // Check expiration
    const urlParams = new URLSearchParams(new URL(bypassLink).search);
    const bt = urlParams.get('_bt');
    if (bt) {
      const decoded = JSON.parse(Buffer.from(bt.split('--')[0], 'base64').toString());
      const expiryDate = new Date(decoded._rails.exp);
      console.log('📅 New link expires:', expiryDate.toLocaleString('es-ES'));
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
    body {
      font-family: system-ui;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-align: center;
    }
    .logo { font-size: 80px; animation: pulse 2s infinite; }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    .spinner {
      border: 4px solid rgba(255,255,255,0.3);
      border-top: 4px solid white;
      border-radius: 50%;
      width: 50px;
      height: 50px;
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
<!-- Last updated: ${new Date().toISOString()} -->`;
    
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