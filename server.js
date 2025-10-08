const express = require('express');
const session = require('express-session');
const axios = require('axios');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 3600000
  }
}));

const STORE_URL = process.env.STORE_URL || 'https://trilogyoptic.com';
const PASSWORD = process.env.SHOPIFY_PASSWORD || 'trilogy';
const SECRET_TOKEN = process.env.SECRET_TOKEN || 'test123';
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN; // Get from browserless.io

let cookieCache = null;
let cacheExpiry = null;

async function getAuthenticatedCookies() {
  if (cookieCache && cacheExpiry && Date.now() < cacheExpiry) {
    console.log('✓ Using cached cookies');
    return cookieCache;
  }

  if (!BROWSERLESS_TOKEN) {
    throw new Error('BROWSERLESS_TOKEN not set');
  }

  try {
    console.log('🔐 Authenticating via Browserless...');
    
    const response = await axios.post(
        `https://production-sfo.browserless.io/function?token=${BROWSERLESS_TOKEN}`,
      {
        code: `
          module.exports = async ({ page }) => {
            await page.goto('${STORE_URL}/password', { waitUntil: 'networkidle2' });
            await page.waitForSelector('input[name="password"]');
            await page.type('input[name="password"]', '${PASSWORD}');
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle2' }),
              page.keyboard.press('Enter')
            ]);
            const cookies = await page.cookies();
            return cookies;
          }
        `
      },
      {
        timeout: 60000,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const cookies = response.data;
    
    if (!cookies || cookies.length === 0) {
      throw new Error('No cookies returned');
    }

    cookieCache = cookies;
    cacheExpiry = Date.now() + (30 * 60 * 1000);

    console.log('✅ Got', cookies.length, 'cookies from Browserless');
    return cookies;

  } catch (error) {
    console.error('❌ Browserless error:', error.message);
    throw error;
  }
}

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Trilogy Optic - Demo</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: system-ui;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background: white;
          padding: 50px 40px;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          text-align: center;
          max-width: 400px;
        }
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
        }
        button:hover { transform: translateY(-2px); }
      </style>
    </head>
    <body>
      <div class="container">
        <div style="font-size: 60px; margin-bottom: 20px;">👓</div>
        <h1>Trilogy Optic</h1>
        <p style="color: #666; margin: 20px 0;">Demo Store Access</p>
        <form action="/auth" method="POST">
          <input type="hidden" name="token" value="${SECRET_TOKEN}">
          <button type="submit">Enter Demo Store</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/auth', async (req, res) => {
  const { token } = req.body;
  
  if (token !== SECRET_TOKEN) {
    return res.status(401).send('Invalid token');
  }

  try {
    const cookies = await getAuthenticatedCookies();
    
    cookies.forEach(cookie => {
      res.cookie(cookie.name, cookie.value, {
        domain: '.trilogyoptic.com',
        path: cookie.path || '/',
        expires: cookie.expires ? new Date(cookie.expires * 1000) : undefined,
        httpOnly: cookie.httpOnly || false,
        secure: true,
        sameSite: 'lax'
      });
    });
    
    console.log('✅ Redirecting with cookies');
    res.redirect(STORE_URL);
    
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).send(`
      <div style="font-family: system-ui; padding: 40px; text-align: center;">
        <h2>❌ Authentication Failed</h2>
        <p>${error.message}</p>
        <a href="/">← Try again</a>
      </div>
    `);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});