const express = require('express');
const session = require('express-session');
const axios = require('axios');
const puppeteer = require('puppeteer');
const app = express();

app.set('trust proxy', 1); // Trust Railway/Render proxy

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 3600000,
    domain: process.env.COOKIE_DOMAIN || undefined // Will be set to .trilogyoptic.com
  }
}));

const STORE_URL = process.env.STORE_URL || 'https://trilogyoptic.com';
const PASSWORD = process.env.SHOPIFY_PASSWORD || 'trilogy';
const SECRET_TOKEN = process.env.SECRET_TOKEN || 'test123';

let browserInstance = null;
let authenticatedCookies = null;
let cookieExpiry = null;

async function getBrowser() {
    if (!browserInstance) {
      browserInstance = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-dev-tools',
          '--no-first-run',
          '--no-zygote',
          '--single-process'
        ]
      });
    }
    return browserInstance;
  }

async function getAuthenticatedCookies() {
  if (authenticatedCookies && cookieExpiry && Date.now() < cookieExpiry) {
    console.log('✓ Using cached cookies');
    return authenticatedCookies;
  }

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    console.log('🔐 Authenticating with Shopify...');
    await page.goto(`${STORE_URL}/password`, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('input[name="password"]', { timeout: 5000 });
    await page.type('input[name="password"]', PASSWORD);
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
      page.keyboard.press('Enter')
    ]);

    const cookies = await page.cookies();
    await page.close();

    authenticatedCookies = cookies;
    cookieExpiry = Date.now() + (30 * 60 * 1000);

    console.log('✅ Authenticated with Shopify');
    return authenticatedCookies;
  } catch (error) {
    await page.close();
    throw error;
  }
}

// Landing page with auto-auth
app.get('/', async (req, res) => {
  // If already authenticated, redirect to main store
  if (req.session.authenticated) {
    return res.redirect(STORE_URL);
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Trilogy Optic - Demo Access</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
        }
        .container {
          background: white;
          padding: 50px 40px;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          text-align: center;
          max-width: 400px;
          width: 100%;
        }
        h1 { color: #333; margin-bottom: 10px; font-size: 28px; }
        p { color: #666; margin-bottom: 30px; line-height: 1.6; }
        button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 16px 40px;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
        }
        .logo { font-size: 60px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">👓</div>
        <h1>Trilogy Optic</h1>
        <p>Welcome! Click below to access the demo store.</p>
        <form action="/auth" method="POST">
          <input type="hidden" name="token" value="${SECRET_TOKEN}">
          <button type="submit">Enter Demo Store</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// Authentication endpoint
app.post('/auth', async (req, res) => {
  const { token } = req.body;

  if (token !== SECRET_TOKEN) {
    return res.status(401).send('Invalid token');
  }

  try {
    // Get authenticated cookies from Puppeteer
    const cookies = await getAuthenticatedCookies();
    
    // Set cookies in the response (these will work because we're on a subdomain)
    cookies.forEach(cookie => {
      res.cookie(cookie.name, cookie.value, {
        domain: '.trilogyoptic.com', // Notice the dot - this makes it work for all subdomains
        path: cookie.path || '/',
        expires: cookie.expires ? new Date(cookie.expires * 1000) : undefined,
        httpOnly: cookie.httpOnly || false,
        secure: true, // HTTPS only
        sameSite: 'lax'
      });
    });
    
    // Mark session as authenticated
    req.session.authenticated = true;
    
    // Redirect to main Shopify store
    console.log('✅ Redirecting to store with cookies set');
    res.redirect(STORE_URL);
    
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).send(`
      <div style="font-family: system-ui; padding: 40px; text-align: center;">
        <h2>❌ Authentication Failed</h2>
        <p>Could not authenticate with the store.</p>
        <a href="/">← Try again</a>
      </div>
    `);
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    authenticated: !!authenticatedCookies,
    cookiesValid: cookieExpiry && Date.now() < cookieExpiry
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Demo Access Server Running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

process.on('SIGTERM', async () => {
  if (browserInstance) await browserInstance.close();
  process.exit(0);
});