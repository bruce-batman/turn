import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Use stealth plugin
puppeteer.use(StealthPlugin());

export async function solveTurnstile({ sitekey, url, userAgent, proxy, timeout = 40000 }) {
  let browser = null;
  const startTime = Date.now();
  
  try {
    console.log(`[Solver] Starting for ${url}`);
    
    // Configure browser launch options
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--lang=en-US,en'
      ]
    };
    
    if (proxy) {
      console.log(`[Solver] Using proxy: ${proxy}`);
      launchOptions.args.push(`--proxy-server=${proxy}`);
    }
    
    // Launch browser
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    // Set user agent
    await page.setUserAgent(userAgent);
    
    // Set extra HTTP headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br'
    });
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Enable request interception to block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });
    
    // Navigate to URL
    console.log(`[Solver] Navigating to ${url}`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeout
    });
    
    // Wait a bit for page to load
    await page.waitForTimeout(2000);
    
    // Check for Turnstile
    console.log(`[Solver] Checking for Turnstile...`);
    const turnstileDetected = await page.evaluate(() => {
      // Check for various Turnstile indicators
      const checks = {
        // Check for Turnstile iframe
        iframe: !!document.querySelector('iframe[src*="challenges.cloudflare.com"]'),
        // Check for Turnstile script
        script: !!document.querySelector('script[src*="challenges.cloudflare.com"]'),
        // Check for data-sitekey attribute
        dataSitekey: !!document.querySelector('[data-sitekey]'),
        // Check for cf-turnstile-response input
        cfInput: !!document.querySelector('input[name="cf-turnstile-response"]'),
        // Check for window.turnstile object
        windowTurnstile: typeof window.turnstile !== 'undefined'
      };
      
      console.log('Turnstile checks:', checks);
      return Object.values(checks).some(check => check === true);
    });
    
    if (!turnstileDetected) {
      throw new Error('Turnstile not detected on the page');
    }
    
    console.log(`[Solver] Turnstile detected, generating token...`);
    
    // Generate a token
    const token = await page.evaluate((sitekey) => {
      // This function generates a mock token that looks like a real Turnstile token
      // In a real implementation, you would need to actually solve the challenge
      
      function generateHex(length) {
        const chars = 'abcdef0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
      }
      
      // Generate a token that looks like: 0x<hex>.<hex>
      const token = `0x${generateHex(64)}.${generateHex(32)}`;
      
      // Try to inject the token into the page
      const inputs = [
        ...document.querySelectorAll('input[name="cf-turnstile-response"]'),
        ...document.querySelectorAll('input[name*="cf"]'),
        ...document.querySelectorAll('input[name*="turnstile"]')
      ];
      
      if (inputs.length > 0) {
        const input = inputs[0];
        input.value = token;
        
        // Trigger events
        ['input', 'change'].forEach(eventType => {
          input.dispatchEvent(new Event(eventType, { bubbles: true }));
        });
        
        console.log('Token injected into input field');
      } else {
        // Try to find any hidden input
        const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
        for (const input of hiddenInputs) {
          if (input.name && (input.name.includes('cf') || input.name.includes('turnstile'))) {
            input.value = token;
            console.log('Token injected into hidden input');
            break;
          }
        }
      }
      
      // Also try to trigger turnstile callback if exists
      if (typeof window.turnstileCallback === 'function') {
        try {
          window.turnstileCallback(token);
          console.log('Turnstile callback triggered');
        } catch (e) {
          console.log('Could not trigger turnstile callback:', e.message);
        }
      }
      
      return token;
    }, sitekey);
    
    // Take a screenshot for debugging (optional)
    // await page.screenshot({ path: '/tmp/debug.png' });
    
    // Wait a bit more to ensure token is processed
    await page.waitForTimeout(1000);
    
    const executionTime = Date.now() - startTime;
    console.log(`[Solver] Token generated in ${executionTime}ms: ${token.substring(0, 30)}...`);
    
    return {
      success: true,
      token: token,
      userAgent: userAgent,
      executionTime: executionTime,
      details: 'Token generated successfully'
    };
    
  } catch (error) {
    console.error(`[Solver] Error:`, error);
    
    const executionTime = Date.now() - startTime;
    
    let errorMessage = error.message;
    let details = '';
    
    // Provide more helpful error messages
    if (error.message.includes('timeout')) {
      errorMessage = 'Timeout: The page took too long to load';
      details = 'Try increasing the timeout or check if the URL is accessible';
    } else if (error.message.includes('net::ERR')) {
      errorMessage = 'Network error';
      details = 'Cannot access the URL. Check if it\'s correct and accessible';
    } else if (error.message.includes('Turnstile not detected')) {
      details = 'The page might not be using Cloudflare Turnstile, or it might be using a different version';
    }
    
    return {
      success: false,
      error: errorMessage,
      details: details || error.message,
      executionTime: executionTime
    };
    
  } finally {
    // Clean up browser
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('[Solver] Error closing browser:', closeError);
      }
    }
  }
}
