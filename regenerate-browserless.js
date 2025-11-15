const { chromium } = require('playwright');
const fs = require('fs');
require('dotenv').config();

async function navigateWithRetry(page, url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`🌐 Attempt ${i + 1}/${maxRetries}: Navigating to Shopify...`);
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 180000 // Increased to 180 seconds (3 minutes) for very slow proxies
      });
      console.log('✅ Page loaded successfully');
      return; // Success!
    } catch (error) {
      if (i === maxRetries - 1) {
        console.error(`❌ All ${maxRetries} attempts failed`);
        throw error; // Last attempt failed, throw error
      }
      console.log(`⚠️  Attempt ${i + 1} failed: ${error.message}`);
      console.log(`⏳ Waiting 10 seconds before retry...`);
      await page.waitForTimeout(10000); // Wait 10s before retry (increased from 5s)
    }
  }
}

async function regenerateLink(useProxyOverride = null) {
  console.log('🚀 Starting Playwright automation...\n');

  const cookiesJson = process.env.SHOPIFY_COOKIES;
  const isCI = process.env.CI === 'true';
  
  // IPRoyal Static ISP configuration
  const iproyalHost = process.env.IPROYAL_ISP_HOST;
  const iproyalPort = process.env.IPROYAL_ISP_PORT;
  const iproyalUsername = process.env.IPROYAL_ISP_USERNAME;
  const iproyalPassword = process.env.IPROYAL_ISP_PASSWORD;
  
  // Allow override: if useProxyOverride is explicitly false, don't use proxy
  // If null/undefined, use proxy only in CI with credentials
  const hasProxyCredentials = iproyalHost && iproyalPort && iproyalUsername && iproyalPassword;
  const useProxy = useProxyOverride !== null ? useProxyOverride : (isCI && hasProxyCredentials);

  if (!cookiesJson) {
    throw new Error('Missing SHOPIFY_COOKIES in .env');
  }

  const cookies = JSON.parse(cookiesJson);

  // Filter and fix valid cookies
  const now = Date.now() / 1000;
  const validCookies = cookies
    .filter(c => !c.session && (!c.expirationDate || c.expirationDate >= now))
    .map(c => {
      let sameSite = 'Lax';
      if (c.sameSite === 'no_restriction' || c.sameSite === 'None') {
        sameSite = 'None';
      } else if (c.sameSite === 'strict' || c.sameSite === 'Strict') {
        sameSite = 'Strict';
      } else if (c.sameSite === 'lax' || c.sameSite === 'Lax') {
        sameSite = 'Lax';
      }

      return {
        name: c.name,
        value: c.value,
        domain: c.domain.startsWith('.') ? c.domain : '.' + c.domain,
        path: c.path || '/',
        expires: c.expirationDate ? Math.floor(c.expirationDate) : -1,
        httpOnly: c.httpOnly || false,
        secure: c.secure || false,
        sameSite: sameSite
      };
    });

  console.log(`🍪 Loaded ${validCookies.length} cookies\n`);

  // Launch browser with optional proxy
  const launchOptions = {
    headless: isCI,
    args: [],
    // Use Playwright's native proxy config (works better on GitHub Actions)
    ...(useProxy ? {
      proxy: {
        server: `http://${iproyalHost}:${iproyalPort}`,
        username: iproyalUsername,
        password: iproyalPassword
      }
    } : {})
  };

  if (useProxy) {
    console.log(`🌐 Using IPRoyal Static ISP Proxy`);
    console.log(`   Host: ${iproyalHost}`);
    console.log(`   Port: ${iproyalPort}`);
    console.log(`   Location: Spain 🇪🇸`);
  }

  console.log(isCI ? '🤖 Running in GitHub Actions (headless)' : '💻 Running locally (headed)');
  console.log(useProxy ? '✅ Proxy enabled' : 'ℹ️  No proxy (direct connection)');
  console.log('');

  const browser = await chromium.launch(launchOptions);

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      }
    });

    await context.addCookies(validCookies);
    console.log('✅ Cookies set\n');

    const page = await context.newPage();

    let capturedBypassUrl = null;

    // Listen for API responses
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('CreateProductDetailsPagePreviewSessionMutation') || 
          url.includes('preview') || 
          url.includes('_bt=')) {
        console.log('🎯 Found preview-related response');
        try {
          const contentType = response.headers()['content-type'];
          if (contentType?.includes('application/json')) {
            const responseBody = await response.text();
            const json = JSON.parse(responseBody);
            const jsonStr = JSON.stringify(json);
            const btMatch = jsonStr.match(/(https?:\/\/[^"'\s\\]*_bt=[^"'\s\\&]*)/i);
            if (btMatch) {
              capturedBypassUrl = btMatch[0].replace(/\\\//g, '/');
              console.log('✅ FOUND BYPASS URL!');
            }
          }
        } catch (e) {}
      }
    });

    page.on('request', (request) => {
      const url = request.url();
      if ((url.includes('_bt=') || url.includes('preview_theme_id')) && !capturedBypassUrl) {
        capturedBypassUrl = url;
        console.log('✅ CAPTURED FROM REQUEST!');
      }
    });

    context.on('page', async (newPage) => {
      try {
        const url = newPage.url();
        if ((url.includes('_bt=') || url.includes('preview_theme_id')) && !capturedBypassUrl) {
          capturedBypassUrl = url;
          console.log('✅ CAPTURED FROM POPUP!');
        }
        setTimeout(() => newPage.close().catch(() => {}), 2000);
      } catch (e) {}
    });

    // Use retry logic for navigation
    await navigateWithRetry(page, 'https://admin.shopify.com/store/trilogyopticdemo/themes');

    console.log('⏳ Waiting for page to fully load...');
    await page.waitForLoadState('load', { timeout: 60000 });
    await page.waitForTimeout(5000);
    
    console.log('📸 Taking debug screenshot...');
    await page.screenshot({ path: 'debug-page.png', fullPage: true });

    // Try to expand Online Store
    console.log('🔧 Attempting to expand Online Store section...');
    try {
      const onlineStore = page.locator('text="Online Store"').first();
      if (await onlineStore.count() > 0) {
        await onlineStore.click({ force: true, timeout: 10000 });
        await page.waitForTimeout(2000);
        console.log('✅ Expanded Online Store section');
      }
    } catch (e) {
      console.log('ℹ️  Online Store section might already be expanded');
    }

    // Find and click View button
    console.log('🔍 Looking for View button...');
    const button = page.locator('button[aria-label*="View"], a[aria-label*="View"]').first();
    
    if (await button.count() > 0) {
      console.log('✅ Found View button');
      
      try {
        await button.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(500);
      } catch (e) {
        console.log('⚠️  Could not scroll to button, attempting click anyway...');
      }
      
      console.log('🖱️  Clicking button...');
      await button.click({ force: true, timeout: 10000 });
      console.log('✅ Button clicked!');
      
      console.log('⏳ Waiting for response...');
      await page.waitForTimeout(5000);

      if (capturedBypassUrl) {
        console.log('\n🎉 SUCCESS!');
        console.log('🔗 Captured URL:', capturedBypassUrl);
        updateHtmlFile(capturedBypassUrl);
        return capturedBypassUrl;
      } else {
        console.log('⚠️  No bypass URL captured after clicking');
        throw new Error('Failed to capture bypass URL');
      }
    } else {
      console.log('❌ Could not find View button');
      throw new Error('View button not found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await browser.close();
    console.log('🔒 Browser closed');
  }
}

function updateHtmlFile(bypassLink) {
  bypassLink = bypassLink.trim().replace(/\\\//g, '/');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="0;url=${bypassLink}">
  <title>Trilogy Optic</title>
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
    <p>Bine ai venit!</p>
  </div>
  <script>
    setTimeout(() => window.location.href = '${bypassLink}', 100);
  </script>
</body>
</html>
<!-- Updated: ${new Date().toISOString()} -->`;

  fs.writeFileSync('./index.html', html);
  console.log('✅ Updated index.html');
}

if (require.main === module) {
  // Try with proxy first (if in CI and credentials exist)
  regenerateLink()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('\n❌ Script failed with proxy:', error.message);
      
      // If we were using proxy and it failed, try without proxy as fallback
      const isCI = process.env.CI === 'true';
      const hasProxyCredentials = process.env.IPROYAL_ISP_HOST && 
                                   process.env.IPROYAL_ISP_PORT && 
                                   process.env.IPROYAL_ISP_USERNAME && 
                                   process.env.IPROYAL_ISP_PASSWORD;
      
      if (isCI && hasProxyCredentials) {
        console.log('\n🔄 Proxy failed. Trying WITHOUT proxy as fallback...\n');
        try {
          await regenerateLink(false); // Explicitly disable proxy
          console.log('\n✅ Script completed successfully WITHOUT proxy');
          process.exit(0);
        } catch (fallbackError) {
          console.error('\n❌ Fallback also failed:', fallbackError.message);
          process.exit(1);
        }
      } else {
        process.exit(1);
      }
    });
}