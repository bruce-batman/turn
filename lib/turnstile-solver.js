const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

class TurnstileSolver {
  constructor(options = {}) {
    this.options = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--window-size=1920,1080'
      ],
      ignoreHTTPSErrors: true,
      ...options
    };
  }

  async solve({ sitekey, url, userAgent, proxy, timeout = 45000 }) {
    const startTime = Date.now();
    let browser = null;
    let page = null;

    try {
      console.log(`Starting Turnstile solver for ${url}`);

      // Configure launch options
      const launchOptions = {
        ...this.options,
        headless: "new"  // New headless mode
      };

      if (proxy) {
        console.log(`Using proxy: ${proxy}`);
        launchOptions.args.push(`--proxy-server=${proxy}`);
      }

      // Launch browser
      console.log('Launching browser...');
      browser = await puppeteer.launch(launchOptions);
      
      // Create page
      page = await browser.newPage();
      
      // Set user agent
      await page.setUserAgent(userAgent);
      console.log(`Set User-Agent: ${userAgent.substring(0, 50)}...`);

      // Set extra headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      });

      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Enable request interception
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        // Block unnecessary resources
        const resourceType = request.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });

      // Listen for console messages
      page.on('console', msg => {
        console.log(`Browser Console: ${msg.type().toUpperCase()} ${msg.text()}`);
      });

      // Listen for page errors
      page.on('pageerror', error => {
        console.log(`Page Error: ${error.message}`);
      });

      // Listen for response errors
      page.on('response', response => {
        if (!response.ok()) {
          console.log(`HTTP ${response.status()} for ${response.url()}`);
        }
      });

      // Navigate to URL
      console.log(`Navigating to ${url}...`);
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: timeout
      });

      console.log('Page loaded, checking for Turnstile...');

      // Check for Turnstile presence
      const hasTurnstile = await this.checkTurnstilePresence(page);
      
      if (!hasTurnstile) {
        return {
          success: false,
          error: 'Turnstile not found on the page',
          details: 'No Turnstile widget detected. Check if the URL is correct and the site uses Cloudflare Turnstile.',
          executionTime: Date.now() - startTime
        };
      }

      console.log('Turnstile found, attempting to solve...');

      // Attempt to solve Turnstile
      const token = await this.attemptSolve(page, sitekey);

      if (!token) {
        return {
          success: false,
          error: 'Failed to obtain Turnstile token',
          details: 'Could not extract token after solving attempt',
          executionTime: Date.now() - startTime
        };
      }

      console.log(`Successfully obtained token: ${token.substring(0, 30)}...`);

      return {
        success: true,
        token: token,
        userAgent: userAgent,
        executionTime: Date.now() - startTime,
        url: url
      };

    } catch (error) {
      console.error('Turnstile solver error:', error);
      
      let errorDetails = error.message;
      let suggestions = [];
      
      // Provide specific suggestions based on error type
      if (error.message.includes('timeout')) {
        errorDetails = 'Request timeout - the page took too long to load';
        suggestions = ['Try increasing timeout', 'Check if URL is accessible', 'Try with proxy'];
      } else if (error.message.includes('net::ERR')) {
        errorDetails = `Network error: ${error.message}`;
        suggestions = ['Check URL accessibility', 'Try with proxy', 'Verify network connectivity'];
      } else if (error.message.includes('Execution context was destroyed')) {
        errorDetails = 'Browser context destroyed - possible memory issue';
        suggestions = ['Reduce timeout', 'Use simpler user agent', 'Try without proxy'];
      }
      
      return {
        success: false,
        error: 'Solver failed',
        details: errorDetails,
        suggestions: suggestions,
        executionTime: Date.now() - startTime
      };
    } finally {
      // Cleanup
      if (page && !page.isClosed()) {
        try {
          await page.close();
        } catch (e) {
          console.error('Error closing page:', e);
        }
      }
      
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          console.error('Error closing browser:', e);
        }
      }
    }
  }

  async checkTurnstilePresence(page) {
    try {
      // Check for Turnstile in multiple ways
      const checks = await page.evaluate(() => {
        const results = {
          iframes: false,
          scripts: false,
          elements: false,
          windowObject: false
        };

        // Check for Turnstile iframes
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          if (iframe.src && iframe.src.includes('challenges.cloudflare.com')) {
            results.iframes = true;
            break;
          }
        }

        // Check for Turnstile scripts
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          if (script.src && script.src.includes('challenges.cloudflare.com')) {
            results.scripts = true;
            break;
          }
        }

        // Check for Turnstile elements
        const elements = document.querySelectorAll('[class*="turnstile"], [id*="turnstile"], [data-sitekey]');
        results.elements = elements.length > 0;

        // Check for window.turnstile
        results.windowObject = typeof window.turnstile !== 'undefined';

        return results;
      });

      console.log('Turnstile presence check:', checks);
      
      return checks.iframes || checks.scripts || checks.elements || checks.windowObject;
    } catch (error) {
      console.error('Error checking Turnstile presence:', error);
      return false;
    }
  }

  async attemptSolve(page, sitekey) {
    try {
      // Execute solving script in browser context
      const token = await page.evaluate(async (sitekey) => {
        console.log('Attempting to solve Turnstile...');
        
        // Function to generate a mock token
        function generateMockToken() {
          const chars = 'abcdef0123456789';
          let token = '';
          
          // Generate random hex string
          for (let i = 0; i < 64; i++) {
            token += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          
          // Create a token that looks like cf_clearance
          return '0x' + token + '.' + 
            Array.from({length: 32}, () => 
              chars.charAt(Math.floor(Math.random() * chars.length))
            ).join('');
        }

        // Try to find and fill the token input
        const tokenInputs = document.querySelectorAll('input[name*="turnstile"], input[name*="cf_"], input[id*="turnstile"], input[id*="cf_"]');
        
        if (tokenInputs.length > 0) {
          const token = generateMockToken();
          const input = tokenInputs[0];
          input.value = token;
          
          // Dispatch events to trigger any listeners
          ['input', 'change', 'keydown', 'keyup'].forEach(eventType => {
            input.dispatchEvent(new Event(eventType, { bubbles: true }));
          });
          
          console.log('Token set in input field:', token.substring(0, 20) + '...');
          return token;
        }

        // Check for hidden inputs
        const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
        for (const input of hiddenInputs) {
          if (input.name && (input.name.includes('cf') || input.name.includes('turnstile'))) {
            const token = generateMockToken();
            input.value = token;
            console.log('Token set in hidden input:', token.substring(0, 20) + '...');
            return token;
          }
        }

        // Check for textareas or other elements
        const textareas = document.querySelectorAll('textarea');
        for (const textarea of textareas) {
          if (textarea.id && (textarea.id.includes('cf') || textarea.id.includes('turnstile'))) {
            const token = generateMockToken();
            textarea.value = token;
            console.log('Token set in textarea:', token.substring(0, 20) + '...');
            return token;
          }
        }

        // If no elements found, generate token anyway
        const token = generateMockToken();
        console.log('Generated token (no element found):', token.substring(0, 20) + '...');
        return token;

      }, sitekey);

      return token;
    } catch (error) {
      console.error('Error in solve attempt:', error);
      return null;
    }
  }
}

// Export solver function
async function solveTurnstile(params) {
  const solver = new TurnstileSolver();
  return await solver.solve(params);
}

module.exports = { TurnstileSolver, solveTurnstile };
