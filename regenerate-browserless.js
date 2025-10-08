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
    
    // Parse cookies
    const cookies = JSON.parse(cookiesJson);
    
    // Convert cookies to Browserless format with validation
    const browserlessCookies = cookies.map(c => {
      // Normalize sameSite value
      let sameSite = 'Lax'; // Default
      if (c.sameSite) {
        const normalized = c.sameSite.toLowerCase();
        if (normalized === 'lax') sameSite = 'Lax';
        else if (normalized === 'strict') sameSite = 'Strict';
        else if (normalized === 'none') sameSite = 'None';
        else if (normalized === 'no_restriction') sameSite = 'None';
        else sameSite = 'Lax'; // Fallback
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
    
    console.log(`📊 Converted ${browserlessCookies.length} cookies\n`);
    
    const response = await axios.post(
      `https://production-sfo.browserless.io/content?token=${browserlessToken}`,
      {
        url: 'https://admin.shopify.com/store/trilogyopticdemo/themes',
        cookies: browserlessCookies,
        gotoOptions: {
          waitUntil: 'networkidle2',
          timeout: 60000
        }
      },
      {
        timeout: 90000,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      }
    );
    
    const pageHtml = response.data;
    
    console.log('📦 Page content received');
    console.log(`📏 Content length: ${pageHtml.length} characters\n`);
    
    // Check if we got blocked
    if (pageHtml.includes('Just a moment')) {
      console.log('❌ Still blocked by Cloudflare');
      throw new Error('Cloudflare blocking access');
    }
    
    // Check if redirected to login
    if (pageHtml.includes('accounts.shopify.com') || pageHtml.includes('login')) {
      console.log('❌ Redirected to login - cookies expired');
      throw new Error('Session expired - refresh cookies');
    }
    
    console.log('🔍 Searching for bypass link in HTML...');
    
    // Extract bypass link from HTML - try multiple patterns
    let bypassLink = null;
    
    // Pattern 1: Direct URL with _bt parameter
    const btLinkMatch = pageHtml.match(/https:\/\/trilogyoptic\.com\/\?[^"'\s]*_bt=[^"'\s]*/);
    if (btLinkMatch) {
      bypassLink = btLinkMatch[0];
    }
    
    // Pattern 2: href attribute
    if (!bypassLink) {
      const hrefMatch = pageHtml.match(/href="([^"]*trilogyoptic\.com[^"]*_bt=[^"]*)"/);
      if (hrefMatch) {
        bypassLink = hrefMatch[1];
      }
    }
    
    // Pattern 3: Any link with preview_theme_id and key
    if (!bypassLink) {
      const previewMatch = pageHtml.match(/https:\/\/trilogyoptic\.com\/\?[^"'\s]*preview_theme_id=[^"'\s]*/);
      if (previewMatch) {
        bypassLink = previewMatch[0];
      }
    }
    
    if (!bypassLink) {
      console.log('❌ No bypass link found in page HTML');
      
      // Save HTML for debugging
      fs.writeFileSync('page-debug.html', pageHtml);
      console.log('📄 Saved page HTML to page-debug.html for inspection\n');
      
      throw new Error('Bypass link not found in page');
    }
    
    // Decode HTML entities
    bypassLink = bypassLink.replace(/&amp;/g, '&');
    
    console.log('✅ Bypass link extracted!');
    console.log(`🔗 ${bypassLink.substring(0, 100)}...\n`);
    
    // Validate link
    if (!bypassLink.includes('trilogyoptic.com')) {
      throw new Error('Invalid bypass link - does not contain store URL');
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
      console.log('⚠️  Could not decode expiration (link might not have _bt parameter)\n');
    }
    
    updateHtmlFile(bypassLink);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
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
  console.log('✅ index.html updated successfully\n');
  console.log('✨ Done!\n');
}

regenerateLink();