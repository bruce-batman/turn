const express = require('express');
const cors = require('cors');
const { solveTurnstile } = require('../lib/turnstile-solver');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Turnstile Bypass API',
    endpoints: {
      bypass: 'POST /api/bypass',
      health: 'GET /'
    }
  });
});

// Bypass endpoint
app.post('/api/bypass', async (req, res) => {
  try {
    const { sitekey, url, userAgent, proxy } = req.body;

    // Validate required parameters
    if (!sitekey || !url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: sitekey and url are required'
      });
    }

    console.log(`Solving Turnstile for ${url} with sitekey: ${sitekey}`);

    // Solve Turnstile
    const result = await solveTurnstile({
      sitekey,
      url,
      userAgent: userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      proxy
    });

    if (result.success && result.token) {
      res.json({
        success: true,
        token: result.token,
        userAgent: result.userAgent,
        executionTime: result.executionTime,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to solve Turnstile'
      });
    }

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Vercel serverless function handler
module.exports = app;
