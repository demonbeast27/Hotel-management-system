/**
 * db.js — SQLite connection using @libsql/client (pure JS, no native build).
 *
 * @libsql/client uses async/await for all operations.
 * We export an initialised client + an `init()` function that creates
 * schema and seeds data on first run.
 */

const { createClient } = require('@libsql/client');
const path = require('path');

// Allow tests to use an in-memory DB via env var.
let dbUrl = `file:${path.join(__dirname, 'hotel.db')}`;
if (process.env.DB_PATH === ':memory:') {
  dbUrl = ':memory:';
} else if (process.env.VERCEL) {
  dbUrl = 'file:/tmp/hotel.db'; // Vercel has read-only fs except for /tmp
}

const db = createClient({ url: dbUrl });

/**
 * Create schema and seed rooms if the table is empty.
 * Must be called once at startup (awaited in server.js).
 */
async function init() {
  // Enable foreign keys (libsql supports PRAGMA)
  await db.execute('PRAGMA foreign_keys = ON');
  await db.execute('PRAGMA journal_mode = WAL');

  // ── Schema ────────────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rooms (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      room_no  TEXT    UNIQUE NOT NULL,
      type     TEXT    NOT NULL CHECK(type IN ('Single','Double','Deluxe','Suite')),
      price    REAL    NOT NULL CHECK(price > 0),
      status   TEXT    NOT NULL DEFAULT 'Available'
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS bookings (
      id         INTEGER  PRIMARY KEY AUTOINCREMENT,
      room_id    INTEGER  NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      guest_name TEXT     NOT NULL,
      check_in   DATE     NOT NULL,
      check_out  DATE     NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Seed data (only when rooms table is empty) ───────────────────────────
  const { rows } = await db.execute('SELECT COUNT(*) AS cnt FROM rooms');
  if (rows[0].cnt === 0) {
    const seedRooms = [
      ['101', 'Single',  2500],
      ['102', 'Single',  2500],
      ['201', 'Double',  4500],
      ['202', 'Double',  4500],
      ['301', 'Deluxe',  8000],
      ['401', 'Suite',  15000],
    ];
    for (const [room_no, type, price] of seedRooms) {
      await db.execute({
        sql:  'INSERT INTO rooms (room_no, type, price) VALUES (?, ?, ?)',
        args: [room_no, type, price],
      });
    }
    console.log('✅  Seeded 6 sample rooms into hotel.db');
  }
}

module.exports = { db, init };
