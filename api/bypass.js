import { solveTurnstile } from '../lib/solver.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Only allow GET and POST methods
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET or POST.'
    });
    return;
  }
  
  try {
    // Get parameters based on method
    let sitekey, url, userAgent, proxy;
    
    if (req.method === 'GET') {
      sitekey = req.query.sitekey;
      url = req.query.url;
      userAgent = req.query.userAgent;
      proxy = req.query.proxy;
    } else {
      sitekey = req.body?.sitekey;
      url = req.body?.url;
      userAgent = req.body?.userAgent;
      proxy = req.body?.proxy;
    }
    
    console.log(`[${new Date().toISOString()}] Request received:`, {
      method: req.method,
      sitekey: sitekey ? `${sitekey.substring(0, 15)}...` : 'missing',
      url: url || 'missing',
      hasUserAgent: !!userAgent,
      hasProxy: !!proxy
    });
    
    // Validate required parameters
    if (!sitekey || !url) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        details: {
          sitekey: !sitekey ? 'Missing' : 'Provided',
          url: !url ? 'Missing' : 'Provided'
        },
        help: {
          get: 'Add ?sitekey=XXX&url=ENCODED_URL to URL',
          post: 'Send JSON body: {"sitekey":"XXX","url":"https://..."}'
        }
      });
      return;
    }
    
    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Invalid URL format',
        received: url,
        example: 'https://example.com'
      });
      return;
    }
    
    // Validate sitekey format
    if (!sitekey.startsWith('0x') && !sitekey.startsWith('1x')) {
      res.status(400).json({
        success: false,
        error: 'Invalid sitekey format',
        received: sitekey,
        expected: 'Should start with 0x or 1x'
      });
      return;
    }
    
    console.log(`Processing request for ${url}...`);
    
    // Set default user agent if not provided
    const finalUserAgent = userAgent || 
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    // Call the solver
    const startTime = Date.now();
    const result = await solveTurnstile({
      sitekey,
      url,
      userAgent: finalUserAgent,
      proxy,
      timeout: 40000
    });
    
    const executionTime = Date.now() - startTime;
    
    if (result.success && result.token) {
      console.log(`Success! Execution time: ${executionTime}ms`);
      
      res.status(200).json({
        success: true,
        token: result.token,
        userAgent: finalUserAgent,
        executionTime: executionTime,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`Failed: ${result.error}`);
      
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to solve Turnstile',
        details: result.details,
        executionTime: executionTime
      });
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
