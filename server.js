/**
 * server.js — Entry point.
 * Initialises DB, mounts static files, JSON middleware, API routes, error handler.
 *
 * Start: node server.js  (or `npm start`)
 */

const express        = require('express');
const path           = require('path');
const errorHandler   = require('./middleware/errorHandler');
const roomsRouter    = require('./routes/rooms');
const bookingsRouter = require('./routes/bookings');
const { init }       = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/rooms',    roomsRouter);
app.use('/api/bookings', bookingsRouter);

// ── Catch-all: serve index.html for non-API routes ─────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Centralised error handler (must be last!) ─────────────────────────────────
app.use(errorHandler);

// ── Start: init DB first, then listen ────────────────────────────────────────
async function start() {
  await init(); // create schema + seed
  app.listen(PORT, () => {
    console.log(`🏨  Hotel Booking System running → http://localhost:${PORT}`);
  });
}

// Only auto-start when run directly (not when required by tests)
if (require.main === module) {
  start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { app, start };
