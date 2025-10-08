const axios = require('axios');
const fs = require('fs');

async function regenerateLink() {
  console.log('🚀 Trying Browserless /chromium endpoint...\n');
  
  const browserlessToken = process.env.BROWSERLESS_TOKEN;
  const cookiesJson = process.env.SHOPIFY_COOKIES;
  
  if (!browserlessToken || !cookiesJson) {
    throw new Error('Missing environment variables');
  }
  
  console.log('✅ Environment variables loaded\n');
  
  try {
    const cookies = JSON.parse(cookiesJson);
    
    // Normalize cookies
    const browserlessCookies = cookies.map(c => {
      let sameSite = 'Lax';
      if (c.sameSite) {
        const normalized = c.sameSite.toLowerCase();
        if (['lax', 'strict', 'none'].includes(normalized)) {
          sameSite = normalized.charAt(0).toUpperCase() + normalized.slice(1);
        }
      }
      
      return {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        expires: c.expirationDate,
        httpOnly: c.httpOnly || false,
        secure: c.secure || false,
        sameSite: sameSite
      };
    });
    
    console.log('🌐 Calling Browserless /chromium endpoint...');
    
    const response = await axios.post(
      `https://production-sfo.browserless.io/chromium?token=${browserlessToken}`,
      {
        url: 'https://admin.shopify.com/store/trilogyopticdemo/themes',
        cookies: browserlessCookies,
        gotoOptions: {
          waitUntil: 'networkidle0',
          timeout: 90000
        },
        authenticate: null,
        viewport: {
          width: 1920,
          height: 1080
        },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        stealth: true,
        blockAds: false
      },
      {
        timeout: 120000,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      }
    );
    
    // Check response type
    console.log('📦 Response received');
    console.log('Response type:', typeof response.data);
    
    let pageHtml = '';
    
    if (typeof response.data === 'string') {
      pageHtml = response.data;
    } else if (response.data.data) {
      pageHtml = response.data.data;
    } else {
      pageHtml = JSON.stringify(response.data);
    }
    
    console.log(`📏 Content length: ${pageHtml.length} characters\n`);
    
    // Check for blocks
    if (pageHtml.includes('Just a moment')) {
      console.log('❌ Still blocked by Cloudflare\n');
      fs.writeFileSync('cloudflare-block.html', pageHtml);
      throw new Error('Cloudflare blocking - check cloudflare-block.html');
    }
    
    if (pageHtml.includes('login') || pageHtml.includes('accounts.shopify.com')) {
      console.log('❌ Redirected to login\n');
      throw new Error('Session expired - cookies need refresh');
    }
    
    // Extract link
    console.log('🔍 Extracting bypass link...');
    
    // Try multiple patterns
    const patterns = [
      /https:\/\/trilogyoptic\.com\/\?[^"'\s]*_bt=[^"'\s]*/,
      /href=["']([^"']*trilogyoptic\.com[^"']*_bt=[^"']*)["']/,
      /https:\/\/trilogyoptic\.com\/\?[^"'\s]*preview_theme_id=[^"'\s]*/,
      /(https:\/\/trilogyoptic\.com\/\?[^"'\s]*key=[^"'\s]*)/
    ];
    
    let bypassLink = null;
    
    for (const pattern of patterns) {
      const match = pageHtml.match(pattern);
      if (match) {
        bypassLink = match[1] || match[0];
        bypassLink = bypassLink.replace(/&amp;/g, '&');
        console.log(`✅ Found link with pattern ${patterns.indexOf(pattern) + 1}`);
        break;
      }
    }
    
    if (!bypassLink) {
      console.log('❌ No bypass link found\n');
      
      // Debug: Save HTML and show snippet
      fs.writeFileSync('page-debug.html', pageHtml);
      console.log('📄 Saved to page-debug.html\n');
      
      // Show a snippet of the HTML
      const snippet = pageHtml.substring(0, 500);
      console.log('HTML snippet:', snippet);
      
      throw new Error('Bypass link not found');
    }
    
    console.log('✅ Bypass link extracted!');
    console.log(`🔗 ${bypassLink}\n`);
    
    // Validate
    if (!bypassLink.includes('trilogyoptic.com')) {
      throw new Error('Invalid link format');
    }
    
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
      console.log('ℹ️  No expiration data in link\n');
    }
    
    // Update HTML
    updateHtmlFile(bypassLink);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data).substring(0, 200));
    }
    process.exit(1);
  }
}

function updateHtmlFile(bypassLink) {
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
  console.log('✅ index.html updated!\n');
  console.log('✨ Done!\n');
}

regenerateLink();