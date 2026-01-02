const express = require('express');
const cors = require('cors');
const { solveTurnstile } = require('../lib/turnstile-solver');
const errorHandler = require('../middleware/errorHandler');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('Query:', req.query);
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Turnstile Bypass API',
    version: '1.0.0',
    endpoints: {
      bypass: 'GET/POST /api/bypass',
      health: 'GET /',
      docs: 'GET /docs'
    },
    usage: {
      get: '/api/bypass?sitekey=YOUR_SITEKEY&url=YOUR_URL',
      post: 'POST /api/bypass with JSON body: { "sitekey": "xxx", "url": "xxx" }'
    }
  });
});

// Docs endpoint
app.get('/docs', (req, res) => {
  res.json({
    documentation: {
      endpoint: '/api/bypass',
      methods: ['GET', 'POST'],
      parameters: {
        sitekey: {
          required: true,
          type: 'string',
          description: 'Cloudflare Turnstile sitekey'
        },
        url: {
          required: true,
          type: 'string',
          description: 'Target URL with Turnstile protection'
        },
        userAgent: {
          required: false,
          type: 'string',
          default: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        proxy: {
          required: false,
          type: 'string',
          description: 'Proxy URL (e.g., http://user:pass@host:port)'
        }
      },
      response: {
        success: 'boolean',
        token: 'string (if success)',
        error: 'string (if failed)',
        executionTime: 'number',
        timestamp: 'ISO string'
      }
    },
    examples: {
      curl_get: 'curl "https://your-api.vercel.app/api/bypass?sitekey=0x4AAAAAA...&url=https://example.com"',
      curl_post: 'curl -X POST https://your-api.vercel.app/api/bypass -H "Content-Type: application/json" -d \'{"sitekey":"0x4AAAAAA...","url":"https://example.com"}\'',
      javascript: `fetch('https://your-api.vercel.app/api/bypass', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    sitekey: '0x4AAAAAA...',
    url: 'https://example.com'
  })
})`
    }
  });
});

// Bypass endpoint - supports both GET and POST
app.all('/api/bypass', async (req, res, next) => {
  try {
    // Get parameters from both query string and body
    const sitekey = req.query.sitekey || req.body.sitekey;
    const url = req.query.url || req.body.url;
    const userAgent = req.query.userAgent || req.body.userAgent || 
                     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    const proxy = req.query.proxy || req.body.proxy;
    
    console.log('Received request:', { sitekey, url, userAgent, proxy, method: req.method });

    // Validate required parameters
    if (!sitekey || !url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        details: {
          required: ['sitekey', 'url'],
          received: { sitekey: !!sitekey, url: !!url }
        },
        usage: {
          get: '/api/bypass?sitekey=YOUR_SITEKEY&url=ENCODED_URL',
          post: 'POST /api/bypass with JSON body'
        }
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (urlError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format',
        details: `Provided URL: ${url}`,
        suggestion: 'URL must include protocol (http:// or https://)'
      });
    }

    // Validate sitekey format
    if (!sitekey.startsWith('0x') && !sitekey.startsWith('1x')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sitekey format',
        details: 'Sitekey should start with 0x or 1x',
        received: sitekey
      });
    }

    console.log(`Solving Turnstile for ${url} with sitekey: ${sitekey.substring(0, 20)}...`);

    // Start timing
    const startTime = Date.now();

    // Solve Turnstile
    const result = await solveTurnstile({
      sitekey,
      url,
      userAgent,
      proxy,
      timeout: 45000
    });

    const executionTime = Date.now() - startTime;

    if (result.success && result.token) {
      console.log(`Successfully solved Turnstile in ${executionTime}ms`);
      
      res.json({
        success: true,
        token: result.token,
        userAgent: result.userAgent,
        executionTime: executionTime,
        timestamp: new Date().toISOString(),
        metadata: {
          sitekey: sitekey.substring(0, 10) + '...',
          url: url.length > 50 ? url.substring(0, 50) + '...' : url,
          method: req.method
        }
      });
    } else {
      console.error('Failed to solve Turnstile:', result.error);
      
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to solve Turnstile',
        details: result.details || 'Unknown error occurred',
        executionTime: executionTime,
        suggestions: [
          'Check if the sitekey is correct',
          'Verify the URL is accessible',
          'Try using a different user agent',
          'Check if the site uses Turnstile'
        ]
      });
    }

  } catch (error) {
    console.error('Unhandled error in bypass endpoint:', error);
    next(error);
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    requested: req.originalUrl,
    availableEndpoints: ['/', '/docs', '/api/bypass']
  });
});

// Error handling middleware
app.use(errorHandler);

// Export for Vercel
module.exports = app;
