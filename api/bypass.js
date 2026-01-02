const { solveTurnstile } = require('./lib/turnstile-solver');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Log request
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  console.log('Query:', req.query);
  console.log('Body:', req.body);

  try {
    // Get parameters from both query string and body
    const sitekey = req.query.sitekey || req.body?.sitekey;
    const url = req.query.url || req.body?.url;
    const userAgent = req.query.userAgent || req.body?.userAgent || 
                     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    const proxy = req.query.proxy || req.body?.proxy;

    // Validate required parameters
    if (!sitekey || !url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        details: {
          required: ['sitekey', 'url'],
          received: {
            sitekey: !!sitekey,
            url: !!url
          }
        },
        help: 'Use GET /api/bypass?sitekey=XXX&url=ENCODED_URL or POST with JSON body'
      });
    }

    // Validate URL
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format',
        received: url,
        example: 'https://example.com',
        tip: 'Make sure to include http:// or https://'
      });
    }

    // Validate sitekey
    if (!sitekey.startsWith('0x') && !sitekey.startsWith('1x')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sitekey format',
        received: sitekey,
        expected: 'Should start with 0x or 1x',
        example: '0x4AAAAAA...'
      });
    }

    console.log(`Processing request: ${parsedUrl.hostname} with sitekey ${sitekey.substring(0, 15)}...`);

    // Solve Turnstile
    const startTime = Date.now();
    const result = await solveTurnstile({
      sitekey,
      url,
      userAgent,
      proxy,
      timeout: 45000
    });

    const executionTime = Date.now() - startTime;

    if (result.success && result.token) {
      console.log(`Success in ${executionTime}ms`);
      
      res.json({
        success: true,
        token: result.token,
        userAgent: result.userAgent,
        executionTime: executionTime,
        timestamp: new Date().toISOString(),
        metadata: {
          sitekey_short: sitekey.substring(0, 10) + '...',
          url: parsedUrl.hostname,
          method: req.method
        }
      });
    } else {
      console.error('Failed:', result.error);
      
      res.status(500).json({
        success: false,
        error: result.error || 'Turnstile solving failed',
        details: result.details || 'Unknown error',
        executionTime: executionTime,
        suggestions: [
          'Verify the sitekey is correct',
          'Check if the URL is accessible',
          'Try a different user agent',
          'Ensure the site uses Cloudflare Turnstile'
        ]
      });
    }

  } catch (error) {
    console.error('Unhandled error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString(),
      request_id: Math.random().toString(36).substring(7)
    });
  }
};
