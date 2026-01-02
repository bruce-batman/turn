export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  res.status(200).json({
    status: 'online',
    service: 'Turnstile Bypass API',
    version: '1.0.0',
    endpoints: {
      health: {
        url: '/health',
        method: 'GET',
        description: 'Health check endpoint'
      },
      bypass: {
        url: '/api/bypass',
        methods: ['GET', 'POST'],
        description: 'Get Turnstile token',
        parameters: {
          sitekey: 'required',
          url: 'required',
          userAgent: 'optional',
          proxy: 'optional'
        },
        examples: {
          get: '/api/bypass?sitekey=0x4AAAAAA...&url=https://example.com',
          post: 'POST /api/bypass with JSON body'
        }
      }
    },
    usage: {
      curl_get: 'curl "https://YOUR_API.vercel.app/api/bypass?sitekey=XXX&url=ENCODED_URL"',
      curl_post: 'curl -X POST https://YOUR_API.vercel.app/api/bypass -H "Content-Type: application/json" -d \'{"sitekey":"XXX","url":"https://example.com"}\''
    }
  });
}
