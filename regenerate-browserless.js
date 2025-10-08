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
    
    // Add proxy parameters if needed (uncomment to enable residential proxy)
    const useProxy = false; // Set to true if bot detection is an issue
    const proxyParams = useProxy ? '&proxy=residential&proxyCountry=us' : '';
    
    const response = await axios.post(
      `https://production-sfo.browserless.io/chromium/bql?token=${browserlessToken}${proxyParams}`,
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
            waitForTimeout(time: 5000) {
              time
            }
            scroll: evaluate(
              content: """
                (()=>{
                  window.scrollTo(0, document.body.scrollHeight / 2);
                  return true;
                })()
              """
            ) {
              value
            }
            waitForTimeout2: waitForTimeout(time: 2000) {
              time
            }
            extractLink: evaluate(
              content: """
                (()=>{
                  return new Promise((resolve) => {
                    let attempts = 0;
                    const maxAttempts = 80;
                    
                    const checkForLink = () => {
                      attempts++;
                      
                      const links = document.querySelectorAll('a[href*=\"trilogyoptic.com\"]');
                      
                      if (links.length > 0) {
                        console.log('Found link after ' + attempts + ' attempts');
                        resolve(links[0].href);
                      } else if (attempts >= maxAttempts) {
                        console.log('No link found after ' + maxAttempts + ' attempts');
                        const allLinks = document.querySelectorAll('a');
                        console.log('Total links on page: ' + allLinks.length);
                        resolve(null);
                      } else {
                        setTimeout(checkForLink, 500);
                      }
                    };
                    
                    checkForLink();
                  });
                })()
              """
            ) {
              value
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
    const bypassLink = result.extractLink?.value;
    const status = result.goto?.status;
    const finalUrl = result.goto?.url;
    
    console.log(`📄 Page status: ${status}`);
    console.log(`🌐 Final URL: ${finalUrl}\n`);
    
    if (!bypassLink || bypassLink === 'null') {
      console.log('❌ No bypass link found after waiting 30 seconds\n');
      console.log('The page loaded but the link never appeared.');
      console.log('This could mean:');
      console.log('  1. The theme is not published/available');
      console.log('  2. The cookies need refreshing');
      console.log('  3. The page structure changed\n');
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