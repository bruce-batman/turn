const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const axios = require('axios');

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

class TurnstileSolver {
  constructor(options = {}) {
    this.options = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'
      ],
      ...options
    };
  }

  async solve({ sitekey, url, userAgent, proxy, timeout = 30000 }) {
    const startTime = Date.now();
    let browser = null;

    try {
      // Configure browser with proxy if provided
      const launchOptions = { ...this.options };
      if (proxy) {
        launchOptions.args.push(`--proxy-server=${proxy}`);
      }

      // Launch browser
      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();

      // Set user agent
      await page.setUserAgent(userAgent);

      // Navigate to the target URL
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: timeout
      });

      // Wait for Turnstile to load
      await this.waitForTurnstile(page);

      // Execute bypass script
      const token = await this.executeBypass(page, sitekey);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        token,
        userAgent,
        executionTime,
        url
      };

    } catch (error) {
      console.error('Turnstile solving error:', error);
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async waitForTurnstile(page) {
    // Wait for Turnstile iframe or widget to load
    try {
      await page.waitForFunction(() => {
        return window.turnstile || 
               document.querySelector('iframe[src*="challenges.cloudflare.com"]') ||
               document.querySelector('div[data-sitekey]');
      }, { timeout: 10000 });
    } catch (error) {
      console.log('Turnstile not found immediately, continuing...');
    }
  }

  async executeBypass(page, sitekey) {
    // Inject bypass logic
    return await page.evaluate(async (sitekey) => {
      // Function to find Turnstile widget
      function findTurnstileWidget() {
        // Look for iframe
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          if (iframe.src && iframe.src.includes('challenges.cloudflare.com')) {
            return iframe;
          }
        }

        // Look for div with data-sitekey
        const divs = document.querySelectorAll('div[data-sitekey]');
        for (const div of divs) {
          return div;
        }

        // Check window.turnstile
        if (window.turnstile) {
          return window.turnstile;
        }

        return null;
      }

      // Check if Turnstile is already solved
      function checkForToken() {
        const tokenInputs = document.querySelectorAll('input[name="cf-turnstile-response"]');
        if (tokenInputs.length > 0 && tokenInputs[0].value) {
          return tokenInputs[0].value;
        }

        // Check localStorage
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key.includes('turnstile') || key.includes('cf_')) {
            const value = localStorage.getItem(key);
            if (value && value.length > 100) {
              return value;
            }
          }
        }

        return null;
      }

      // Try to intercept turnstile.render calls
      if (window.turnstile && window.turnstile.render) {
        const originalRender = window.turnstile.render;
        window.turnstile.render = function(element, options) {
          console.log('Turnstile render intercepted:', options);
          return originalRender.call(this, element, options);
        };
      }

      // Simulate solving process
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Create a mock token (in real implementation, this would be obtained through solving)
      const mockToken = '0x' + Array(64).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('') + '.' + 
      Array(32).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');

      // Set the token in the page
      const tokenInputs = document.querySelectorAll('input[name="cf-turnstile-response"]');
      if (tokenInputs.length > 0) {
        tokenInputs[0].value = mockToken;
        const event = new Event('input', { bubbles: true });
        tokenInputs[0].dispatchEvent(event);
      }

      // Also dispatch a turnstile callback if exists
      if (window.turnstileCallback) {
        window.turnstileCallback(mockToken);
      }

      return mockToken;

    }, sitekey);
  }

  async getTurnstileTokenDirect(sitekey, url) {
    try {
      // Alternative method using direct API approach
      const response = await axios.post('https://challenges.cloudflare.com/turnstile/v0/api.js', {
        // Cloudflare Turnstile API parameters
      }, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': url,
          'Origin': new URL(url).origin
        }
      });

      // Parse response for token
      const $ = cheerio.load(response.data);
      // Extract token logic here
      
      return null; // Placeholder
    } catch (error) {
      console.error('Direct API error:', error);
      return null;
    }
  }
}

// Export solver function
async function solveTurnstile({ sitekey, url, userAgent, proxy }) {
  const solver = new TurnstileSolver();
  return await solver.solve({ sitekey, url, userAgent, proxy });
}

module.exports = { TurnstileSolver, solveTurnstile };
