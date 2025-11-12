const { chromium } = require('playwright');
const fs = require('fs');
require('dotenv').config();

async function regenerateLink() {
  console.log('🚀 Starting Playwright automation...\n');

  const cookiesJson = process.env.SHOPIFY_COOKIES;
  const isCI = process.env.CI === 'true';

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

  // Launch browser
  const browser = await chromium.launch({
    headless: isCI,
  });

  console.log(isCI ? '🤖 Running in GitHub Actions (headless)' : '💻 Running locally (headed)');
  console.log('ℹ️  Using authenticated cookies (no proxy)\n');

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

        console.log('🎯 Found preview-related response:', url);

        try {
          const contentType = response.headers()['content-type'];
          if (contentType?.includes('application/json')) {
            const responseBody = await response.text();
            console.log('📦 Response body preview:', responseBody.substring(0, 500));

            try {
              const json = JSON.parse(responseBody);
              const jsonStr = JSON.stringify(json);

              const btMatch = jsonStr.match(/(https?:\/\/[^"'\s\\]*_bt=[^"'\s\\&]*)/i);
              if (btMatch) {
                let foundUrl = btMatch[0].replace(/\\\//g, '/');
                capturedBypassUrl = foundUrl;
                console.log('✅ FOUND BYPASS URL IN API RESPONSE!');
                console.log('🔗', capturedBypassUrl);
              }

              const previewMatch = jsonStr.match(/(https?:\/\/[^"'\s\\]*preview_theme_id=[^"'\s\\&]*)/i);
              if (previewMatch && !capturedBypassUrl) {
                let foundUrl = previewMatch[0].replace(/\\\//g, '/');
                capturedBypassUrl = foundUrl;
                console.log('✅ FOUND PREVIEW URL IN API RESPONSE!');
                console.log('🔗', capturedBypassUrl);
              }
            } catch (e) {
              const btMatch = responseBody.match(/(https?:\/\/[^"'\s]*_bt=[^"'\s&]*)/i);
              if (btMatch) {
                capturedBypassUrl = btMatch[0];
                console.log('✅ FOUND BYPASS URL IN RESPONSE TEXT!');
                console.log('🔗', capturedBypassUrl);
              }
            }
          }
        } catch (error) {
          console.log('⚠️ Could not read response body:', error.message);
        }
      }
    });

    page.on('request', (request) => {
      const url = request.url();

      if (url.includes('_bt=') || url.includes('preview_theme_id')) {
        console.log('📍 Request with bypass params:', url);
        if (!capturedBypassUrl) {
          capturedBypassUrl = url;
          console.log('✅ CAPTURED FROM REQUEST!');
        }
      }
    });

    context.on('page', async (newPage) => {
      console.log('🔔 New popup/tab detected!');
      
      try {
        const url = newPage.url();
        console.log('🔗 Popup URL:', url);

        if ((url.includes('_bt=') || url.includes('preview_theme_id')) && !capturedBypassUrl) {
          capturedBypassUrl = url;
          console.log('✅ CAPTURED FROM POPUP URL!');
        }

        setTimeout(() => {
          newPage.close().catch(() => {});
        }, 2000);
      } catch (error) {
        console.log('⚠️ Error accessing popup:', error.message);
      }
    });

    console.log('🌐 Navigating to themes page...');
    await page.goto('https://admin.shopify.com/store/trilogyopticdemo/themes', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('✅ Page loaded!');
    await page.screenshot({ path: 'step1-before-click.png' });

    console.log('⏳ Waiting for page to be interactive...');
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    console.log('🔍 Looking for "View your online store" button...');

    // Try to expand Online Store section
    try {
      const onlineStoreButton = page.locator('button:has-text("Online Store"), a:has-text("Online Store")').first();
      if (await onlineStoreButton.count() > 0) {
        await onlineStoreButton.click({ force: true });
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      // Ignore if already expanded
    }

    await page.screenshot({ path: 'debug-page.png', fullPage: true });

    const button = page.locator('button[aria-label="View your online store"], a[aria-label="View your online store"]').first();
    
    if (await button.count() > 0) {
      console.log('✅ Found View button!');
      
      await button.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);
      
      console.log('🎯 Clicking button...');
      await button.click({ force: true });
      console.log('🖱️  Clicked!');

      await page.waitForTimeout(5000);
      await page.screenshot({ path: 'step2-after-click.png' });

      if (capturedBypassUrl) {
        console.log('\n🎉 SUCCESS! Captured bypass URL:', capturedBypassUrl);
        updateHtmlFile(capturedBypassUrl);
        return capturedBypassUrl;
      } else {
        throw new Error('Failed to capture bypass URL');
      }

    } else {
      console.log('❌ Could not find the View store button');
      await page.screenshot({ path: 'error-no-button.png', fullPage: true });
      const html = await page.content();
      fs.writeFileSync('page-content.html', html);
      throw new Error('Could not find View store button');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await browser.close();
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
  console.log('✅ index.html updated successfully!');
}

if (require.main === module) {
  regenerateLink()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}