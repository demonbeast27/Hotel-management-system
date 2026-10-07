/**
 * middleware/errorHandler.js
 * Centralised Express error-handler.  Must be registered LAST (after all routes).
 *
 * Rules:
 *  - Never expose a stack trace or internal message to the client.
 *  - Log the full error server-side for debugging.
 *  - Honour the statusCode attached to the error if present, otherwise 500.
 */

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Always log the real error server-side.
  console.error(`[ERROR] ${req.method} ${req.path}`, err.message || err);

  const status  = err.statusCode || err.status || 500;
  const message = status < 500
    ? err.message                    // client errors: safe to forward
    : 'An internal server error occurred.'; // server errors: hide details

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
