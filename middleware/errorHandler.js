function errorHandler(err, req, res, next) {
  console.error('Global error handler:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Default error response
  const errorResponse = {
    success: false,
    error: 'Internal Server Error',
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || Math.random().toString(36).substring(2, 15)
  };

  // Add details in development
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.details = err.message;
    errorResponse.stack = err.stack;
  }

  // Send response
  res.status(500).json(errorResponse);
}

module.exports = errorHandler;
