const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
require('dotenv').config();

puppeteer.use(StealthPlugin());

async function regenerateLink() {
  console.log('🚀 Starting Puppeteer automation with proxy support...\n');

  const cookiesJson = process.env.SHOPIFY_COOKIES;
  const decodoPRoxyUsername = process.env.DECODO_PROXY_USERNAME;
  const decodoPRoxyPassword = process.env.DECODO_PROXY_PASSWORD;

  if (!cookiesJson) {
    throw new Error('Missing SHOPIFY_COOKIES in .env');
  }

  const cookies = JSON.parse(cookiesJson);

  // Filter valid cookies
  const now = Date.now() / 1000;
  const validCookies = cookies
    .filter(c => !c.session && (!c.expirationDate || c.expirationDate >= now))
    .map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain.startsWith('.') ? c.domain : '.' + c.domain,
      path: c.path || '/',
      expires: c.expirationDate ? Math.floor(c.expirationDate) : undefined,
      httpOnly: c.httpOnly || false,
      secure: c.secure || false,
      sameSite: c.sameSite || 'Lax'
    }));

  console.log(`🍪 Loaded ${validCookies.length} cookies\n`);

  // Configure browser with or without proxy
  const launchOptions = {
    headless: process.env.CI === 'true' ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  };

  // Add proxy if credentials are provided
  if (decodoPRoxyUsername && decodoPRoxyPassword) {
    // Using Decodo residential proxy endpoint.port format
    const proxyUrl = `gate.decodo.com:10001`;
    launchOptions.args.push(`--proxy-server=http://${proxyUrl}`);
    console.log('🌐 Using residential proxy:', proxyUrl);
  } else {
    console.log('ℹ️  No proxy configured - running without proxy\n');
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();

    // Authenticate with proxy if credentials are provided
    if (decodoPRoxyUsername && decodoPRoxyPassword) {
      await page.authenticate({
        username: decodoPRoxyUsername,
        password: decodoPRoxyPassword
      });
      console.log('✅ Proxy authentication set\n');
    }

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Add realistic user agent and headers
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none'
    });

    // Set cookies
    await page.setCookie(...validCookies);
    console.log('✅ Cookies set\n');

    // CRITICAL: Capture the bypass URL from API responses
    let capturedBypassUrl = null;

    // Enable request interception
    await page.setRequestInterception(true);

    // OPTIMIZATION: Block non-essential resources to save bandwidth
    // This blocks ONLY heavy content that admin UI doesn't need to function
    const blockedDomains = [
      'googletagmanager.com',
      'google-analytics.com',
      'facebook.com',
      'doubleclick.net',
      'hotjar.com',
      'mouseflow.com',
      'segment.com',
      'amplitude.com',
      'mixpanel.com'
    ];

    // Listen for responses to capture the bypass URL from API calls
    page.on('response', async (response) => {
      const url = response.url();

      // Look for the preview session creation API call
      if (url.includes('CreateProductDetailsPagePreviewSessionMutation') || 
          url.includes('preview') || 
          url.includes('_bt=')) {

        console.log('🎯 Found preview-related response:', url);

        try {
          const contentType = response.headers()['content-type'];

          if (contentType && contentType.includes('application/json')) {
            const responseBody = await response.text();
            console.log('📦 Response body preview:', responseBody.substring(0, 500));

            // Try to parse JSON
            try {
              const json = JSON.parse(responseBody);
              const jsonStr = JSON.stringify(json);

              // Look for URLs with _bt parameter in the response
              const btMatch = jsonStr.match(/(https?:\/\/[^"'\s\\]*_bt=[^"'\s\\&]*)/i);
              if (btMatch) {
                // Decode any escaped characters
                let foundUrl = btMatch[0].replace(/\\\//g, '/');
                capturedBypassUrl = foundUrl;
                console.log('✅ FOUND BYPASS URL IN API RESPONSE!');
                console.log('🔗', capturedBypassUrl);
              }

              // Also look for preview_theme_id which might be in a separate field
              const previewMatch = jsonStr.match(/(https?:\/\/[^"'\s\\]*preview_theme_id=[^"'\s\\&]*)/i);
              if (previewMatch && !capturedBypassUrl) {
                let foundUrl = previewMatch[0].replace(/\\\//g, '/');
                capturedBypassUrl = foundUrl;
                console.log('✅ FOUND PREVIEW URL IN API RESPONSE!');
                console.log('🔗', capturedBypassUrl);
              }
            } catch (e) {
              // Not JSON, check raw text
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

    // Also intercept requests
    page.on('request', (request) => {
      const url = request.url();
      const resourceType = request.resourceType();

      // OPTIMIZATION: Block analytics and tracking (safe - not needed for functionality)
      if (blockedDomains.some(domain => url.includes(domain))) {
        request.abort();
        return;
      }

      // OPTIMIZATION: Block large media files but keep small UI assets
      if (resourceType === 'media') {
        request.abort();
        return;
      }

      // OPTIMIZATION: Block very large product images (not UI icons)
      if (resourceType === 'image' && (
        url.includes('_2048x') || 
        url.includes('_1024x') ||
        url.includes('_large.') ||
        url.includes('_grande.')
      )) {
        request.abort();
        return;
      }

      if (url.includes('_bt=') || url.includes('preview_theme_id')) {
        console.log('📍 Request with bypass params:', url);
        if (!capturedBypassUrl) {
          capturedBypassUrl = url;
          console.log('✅ CAPTURED FROM REQUEST!');
        }
      }

      request.continue();
    });

    // Listen for new popup pages
    browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        console.log('🔔 New popup detected!');
        try {
          const newPage = await target.page();

          if (newPage) {
            // Check the initial URL
            const initialUrl = newPage.url();
            console.log('🔗 Popup URL:', initialUrl);

            if ((initialUrl.includes('_bt=') || initialUrl.includes('preview_theme_id')) && !capturedBypassUrl) {
              capturedBypassUrl = initialUrl;
              console.log('✅ CAPTURED FROM POPUP URL!');
            }

            // Close popup after a moment
            setTimeout(() => {
              newPage.close().catch(() => {});
            }, 2000);
          }
        } catch (error) {
          console.log('⚠️ Error accessing popup:', error.message);
        }
      }
    });

    // Navigate to Shopify admin themes page
    console.log('🌐 Navigating to themes page...');
    await page.goto('https://admin.shopify.com/store/trilogyopticdemo/themes', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // OPTIMIZATION: Skip screenshots in CI to save bandwidth
    if (process.env.CI !== 'true') {
      console.log('📸 Taking screenshot 1...');
      await page.screenshot({ path: 'step1-before-click.png' });
    }

    // Wait for the page to be interactive
    console.log('⏳ Waiting for page to be ready...');
    await page.waitForFunction(
      () => document.readyState === 'complete',
      { timeout: 30000 }
    );

    // Extra wait for React/dynamic content to load
    await page.waitForTimeout(5000);

    // Try to find the View store button
    console.log('🔍 Looking for "View your online store" button...');

    // Wait for page body
    await page.waitForSelector('body', { timeout: 30000 });

    // OPTIMIZATION: Skip debug screenshot in CI
    if (process.env.CI !== 'true') {
      await page.screenshot({ path: 'debug-page.png', fullPage: true });
      console.log('📸 Saved debug screenshot');
    }

    // Get page content for debugging
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('📄 Page preview:', pageText.substring(0, 300));

    // Try to find button
    let buttonSelector = null;

    // Strategy 1: Wait for any button
    try {
      await page.waitForSelector('button', { timeout: 10000 });
      console.log('✅ Found some buttons on page');
    } catch (e) {
      console.log('⚠️  No buttons found at all');
    }

    // Strategy 2: Find the button by multiple methods
    buttonSelector = await page.evaluate(() => {
      // Look for the button in multiple ways
      const searches = [
        // By aria-label
        document.querySelector('button[aria-label*="View"]'),
        document.querySelector('a[aria-label*="View"]'),
        document.querySelector('button[aria-label*="view"]'),
        document.querySelector('a[aria-label*="view"]'),
      ];

      // By text content
      const allElements = Array.from(document.querySelectorAll('button, a'));
      const textSearch = allElements.find(el => {
        const text = (el.textContent || '').toLowerCase();
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        return (text.includes('view') && text.includes('store')) ||
               (label.includes('view') && label.includes('store')) ||
               text.includes('view your online store') ||
               label.includes('view your online store');
      });

      if (textSearch) searches.push(textSearch);

      // By data attributes
      searches.push(
        document.querySelector('[data-primary-action="VIEW_STORE"]'),
        document.querySelector('button[data-action*="view"]')
      );

      const button = searches.find(el => el);

      if (button) {
        button.setAttribute('data-found-button', 'true');
        console.log('Found button:', button.textContent || button.getAttribute('aria-label'));
        return '[data-found-button="true"]';
      }

      return null;
    });

    if (buttonSelector) {
      console.log(`✅ Found button with selector: ${buttonSelector}\n`);
      console.log('🎯 Now clicking and listening for the API response...\n');

      // Click the button
      await page.click(buttonSelector);
      console.log('🖱️  Clicked button!');

      // Wait for the API call and popup
      await page.waitForTimeout(5000);

      // OPTIMIZATION: Skip screenshot in CI
      if (process.env.CI !== 'true') {
        console.log('📸 Taking screenshot 2...');
        await page.screenshot({ path: 'step2-after-click.png' });
      }

      // Check what we captured
      if (capturedBypassUrl) {
        console.log('\n🎉 SUCCESS! Captured bypass URL:', capturedBypassUrl);
        updateHtmlFile(capturedBypassUrl);
        return capturedBypassUrl;
      } else {
        console.log('⚠️  No bypass URL was captured from API or popup');
        throw new Error('Failed to capture bypass URL');
      }

    } else {
      console.log('❌ Could not find the View store button');

      // OPTIMIZATION: Skip error screenshot in CI
      if (process.env.CI !== 'true') {
        await page.screenshot({ path: 'error-no-button.png', fullPage: true });
        
        const html = await page.content();
        fs.writeFileSync('page-content.html', html);
        console.log('💾 Saved HTML for inspection');
      }

      throw new Error('Could not find View store button');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await browser.close();
  }
}

function updateHtmlFile(bypassLink) {
  // Clean the link - handle URL encoded characters
  bypassLink = bypassLink.trim();

  // If the URL has escaped slashes, fix them
  bypassLink = bypassLink.replace(/\\\//g, '/');

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
  console.log('✅ index.html updated successfully!');
  console.log('✨ Done!\n');
}

module.exports = { regenerateLink };

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