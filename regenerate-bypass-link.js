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
    // Load cookies from environment variable
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
    
    // Navigate to themes page
    console.log('🌐 Navigating to Shopify themes page...');
    const response = await page.goto('https://admin.shopify.com/store/trilogyopticdemo/themes', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log(`📄 Page status: ${response.status()}`);
    console.log(`📍 Final URL: ${page.url()}\n`);
    
    // Check if we got redirected to login
    if (page.url().includes('login') || page.url().includes('accounts.shopify.com')) {
      console.log('❌ Redirected to login page - cookies might be expired!');
      console.log('🔄 Please re-export your cookies from Chrome\n');
      
      await page.screenshot({ path: 'login-page.png', fullPage: true });
      console.log('📸 Screenshot saved as login-page.png\n');
      
      throw new Error('Session expired - cookies need to be refreshed');
    }
    
    // Wait for page to load
    console.log('⏳ Waiting for page content to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'themes-page.png', fullPage: true });
    console.log('📸 Screenshot saved as themes-page.png\n');
    
    // Debug: Log page title
    const title = await page.title();
    console.log(`📝 Page title: ${title}\n`);
    
    // Debug: Check what links are on the page
    console.log('🔍 Searching for links on the page...');
    const allLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.map(a => ({
        text: a.textContent.trim().substring(0, 50),
        href: a.href.substring(0, 100)
      })).filter(l => l.text || l.href);
    });
    
    console.log(`📊 Found ${allLinks.length} links on page\n`);
    
    // Show first 10 links for debugging
    console.log('First 10 links:');
    allLinks.slice(0, 10).forEach((link, i) => {
      console.log(`  ${i + 1}. "${link.text}" → ${link.href}`);
    });
    console.log('');
    
    // Look for links containing _bt or preview
    const relevantLinks = allLinks.filter(l => 
      l.href.includes('_bt=') || 
      l.text.toLowerCase().includes('view') ||
      l.text.toLowerCase().includes('preview') ||
      l.href.includes('preview_theme_id')
    );
    
    console.log(`🎯 Found ${relevantLinks.length} potentially relevant links:`);
    relevantLinks.forEach((link, i) => {
      console.log(`  ${i + 1}. "${link.text}" → ${link.href}`);
    });
    console.log('');
    
    // Try to find the bypass link
    console.log('🔍 Attempting to extract bypass link...');
    const bypassLink = await page.evaluate(() => {
      // Method 1: Look for "View" buttons
      const viewButtons = Array.from(document.querySelectorAll('a'))
        .filter(a => {
          const text = a.textContent.toLowerCase();
          return (text.includes('view') && text.includes('store')) || 
                 text.includes('preview');
        });
      
      for (const button of viewButtons) {
        if (button.href && button.href.includes('_bt=')) {
          return button.href;
        }
      }
      
      // Method 2: Any link with _bt parameter
      const btLinks = Array.from(document.querySelectorAll('a[href*="_bt="]'));
      if (btLinks.length > 0) {
        return btLinks[0].href;
      }
      
      // Method 3: Search all hrefs
      const allAs = Array.from(document.querySelectorAll('a'));
      for (const a of allAs) {
        if (a.href && a.href.includes('trilogyoptic.com') && a.href.includes('_bt=')) {
          return a.href;
        }
      }
      
      return null;
    });
    
    if (!bypassLink) {
      console.log('❌ Could not find bypass link automatically\n');
      console.log('💡 Please check themes-page.png to see what\'s on the page\n');
      
      // Save page HTML for inspection
      const html = await page.content();
      fs.writeFileSync('page-content.html', html);
      console.log('📄 Page HTML saved as page-content.html\n');
      
      throw new Error('Bypass link not found - check screenshots and HTML dump');
    }
    
    console.log('✅ Link extracted successfully!');
    console.log(`🔗 Full link: ${bypassLink}\n`);
    
    // Validate the link
    if (!bypassLink.includes('trilogyoptic.com') || !bypassLink.includes('_bt=')) {
      throw new Error('Invalid bypass link format');
    }
    
    // Check expiration
    try {
      const urlParams = new URLSearchParams(new URL(bypassLink).search);
      const bt = urlParams.get('_bt');
      if (bt) {
        const decoded = JSON.parse(Buffer.from(bt.split('--')[0], 'base64').toString());
        const expiryDate = new Date(decoded._rails.exp);
        const now = new Date();
        const minutesLeft = Math.floor((expiryDate - now) / (1000 * 60));
        
        console.log('📅 Link expires:', expiryDate.toLocaleString('es-ES'));
        console.log(`⏰ Time remaining: ${minutesLeft} minutes\n`);
      }
    } catch (e) {
      console.log('⚠️  Could not decode expiration date\n');
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
    console.error('\n📋 Full error:', error);
    await browser.close();
    process.exit(1);
  }
}

regenerateBypassLink();