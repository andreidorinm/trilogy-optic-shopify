const axios = require('axios');
const fs = require('fs');

async function regenerateLink() {
  console.log('🚀 Using Browserless BrowserQL (GraphQL) - Best anti-detection...\n');
  
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
    
    console.log('🌐 Calling Browserless BrowserQL endpoint...');
    
    const response = await axios.post(
      `https://production-sfo.browserless.io/chromium/bql?token=${browserlessToken}`,
      {
        query: `
          mutation GetPageContent($url: String!, $cookies: [CookieInput!]!) {
            setCookies: cookies(cookies: $cookies) {
              cookies {
                name
                value
              }
            }
            goto(
              url: $url
              waitUntil: networkIdle
              timeout: 60000
            ) {
              status
              url
            }
            waitForTimeout(time: 8000) {
              time
            }
            html {
              html
              time
            }
          }
        `,
        variables: {
          url: 'https://admin.shopify.com/store/trilogyopticdemo/themes',
          cookies: browserlessCookies
        }
      },
      {
        timeout: 120000,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      }
    );
    
    console.log('📦 Response received\n');
    
    // Check for errors
    if (response.data.errors) {
      console.error('❌ GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
      throw new Error('GraphQL query failed');
    }
    
    const result = response.data.data;
    const pageHtml = result.html?.html || '';
    const status = result.goto?.status;
    
    console.log(`📄 Page status: ${status}`);
    console.log(`🌐 Final URL: ${result.goto?.url || 'unknown'}`);
    console.log(`📏 Content length: ${pageHtml.length} characters\n`);
    
    if (!pageHtml || pageHtml.length === 0) {
      console.log('❌ No HTML content received\n');
      console.log('Response structure:', JSON.stringify(result, null, 2).substring(0, 500));
      throw new Error('Empty HTML content - possible cookie or navigation issue');
    }
    
    // Check for Cloudflare block
    if (pageHtml.includes('Just a moment')) {
      console.log('❌ Still blocked by Cloudflare\n');
      fs.writeFileSync('cloudflare-block.html', pageHtml);
      throw new Error('Cloudflare blocking - saved to cloudflare-block.html');
    }
    
    // Check for actual login page (not just mentions of login)
    const isLoginPage = pageHtml.includes('accounts.shopify.com/store-login') ||
                        (pageHtml.includes('<title>') && pageHtml.match(/<title>[^<]*Log in[^<]*<\/title>/i)) ||
                        pageHtml.includes('name="account[email]"');
    
    if (isLoginPage) {
      console.log('❌ Redirected to actual login page - cookies expired\n');
      fs.writeFileSync('login-page.html', pageHtml);
      throw new Error('Session expired - refresh cookies (saved to login-page.html)');
    }
    
    // Extract bypass link
    console.log('🔍 Extracting bypass link from HTML...');
    
    const patterns = [
      /https:\/\/trilogyoptic\.com\/\?[^"'\s]*_bt=[^"'\s]*/,
      /href=["']([^"']*trilogyoptic\.com[^"']*_bt=[^"']*)["']/,
      /https:\/\/trilogyoptic\.com\/\?[^"'\s]*preview_theme_id=[^"'\s]*/,
      /(https:\/\/trilogyoptic\.com\/\?[^"'\s]*key=[^"'\s]*preview_theme_id=[^"'\s]*)/,
      /href=["']([^"']*trilogyoptic\.com[^"']*)["']/  // Catch any trilogyoptic.com link
    ];
    
    let bypassLink = null;
    
    for (let i = 0; i < patterns.length; i++) {
      const match = pageHtml.match(patterns[i]);
      if (match) {
        bypassLink = match[1] || match[0];
        // Decode HTML entities
        bypassLink = bypassLink
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#x27;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
        console.log(`✅ Found link with pattern ${i + 1}\n`);
        break;
      }
    }
    
    if (!bypassLink) {
      console.log('❌ No bypass link found in HTML\n');
      
      // Save for debugging
      fs.writeFileSync('page-debug.html', pageHtml);
      console.log('📄 Saved HTML to page-debug.html\n');
      
      // Try to find any trilogyoptic.com links
      console.log('🔍 Searching for any trilogyoptic.com links...');
      const allTrilogyLinks = pageHtml.match(/https?:\/\/[^"'\s]*trilogyoptic\.com[^"'\s]*/gi);
      if (allTrilogyLinks && allTrilogyLinks.length > 0) {
        console.log(`Found ${allTrilogyLinks.length} trilogyoptic.com link(s):`);
        allTrilogyLinks.slice(0, 5).forEach((link, i) => {
          console.log(`  ${i + 1}. ${link.substring(0, 120)}...`);
        });
        console.log('');
      } else {
        console.log('  No trilogyoptic.com links found at all!\n');
      }
      
      // Show snippet
      console.log('HTML snippet (first 500 chars):');
      console.log(pageHtml.substring(0, 500));
      console.log('...\n');
      
      throw new Error('Bypass link not found');
    }
    
    console.log('✅ Bypass link extracted!');
    console.log(`🔗 ${bypassLink.substring(0, 100)}...\n`);
    
    // Validate link
    if (!bypassLink.includes('trilogyoptic.com')) {
      throw new Error('Invalid link - missing store domain');
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
      console.log('ℹ️  No _bt expiration data\n');
    }
    
    // Update HTML file
    updateHtmlFile(bypassLink);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2).substring(0, 500));
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
  console.log('✅ index.html updated successfully!\n');
  console.log('✨ Done!\n');
}

regenerateLink();