/**
 * routes/rooms.js
 * REST endpoints for hotel rooms — async/await with @libsql/client.
 *
 * POST   /api/rooms                       — Add a new room
 * GET    /api/rooms                       — List all rooms
 * GET    /api/rooms/search?type=&check_in=&check_out=
 *                                        — Rooms of given type with NO
 *                                          overlapping booking in the date range
 */

const express = require('express');
const { db }  = require('../db');
const { validateRoom, isValidDate } = require('../middleware/validate');

const router = express.Router();

const VALID_TYPES = ['Single', 'Double', 'Deluxe', 'Suite'];

// ── POST /api/rooms ───────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { room_no, type, price } = req.body ?? {};

    const err = validateRoom({ room_no, type, price });
    if (err) {
      const e = new Error(err.error);
      e.statusCode = 400;
      return next(e);
    }

    const cleanRoomNo = String(room_no).trim().toUpperCase();
    const cleanPrice  = Number(price);

    let result;
    try {
      result = await db.execute({
        sql:  'INSERT INTO rooms (room_no, type, price) VALUES (?, ?, ?)',
        args: [cleanRoomNo, type, cleanPrice],
      });
    } catch (dbErr) {
      // SQLITE_CONSTRAINT_UNIQUE is surfaced as message containing "UNIQUE"
      if (dbErr.message && dbErr.message.includes('UNIQUE')) {
        const e = new Error(`Room number '${cleanRoomNo}' already exists.`);
        e.statusCode = 409;
        return next(e);
      }
      throw dbErr;
    }

    const { rows } = await db.execute({
      sql:  'SELECT * FROM rooms WHERE id = ?',
      args: [Number(result.lastInsertRowid)],
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/rooms ────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.execute('SELECT * FROM rooms ORDER BY room_no');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/rooms/search ─────────────────────────────────────────────────────
/**
 * Returns rooms of the requested type that have NO overlapping booking in
 * [check_in, check_out).
 *
 * Overlap condition (half-open interval):
 *   existing.check_in  < requested.check_out  AND
 *   existing.check_out > requested.check_in
 *
 * Same-day checkout/check-in is NOT an overlap (allowed).
 */
router.get('/search', async (req, res, next) => {
  try {
    const { type, check_in, check_out } = req.query;

    if (!type || !check_in || !check_out) {
      const e = new Error('type, check_in, and check_out query params are required.');
      e.statusCode = 400;
      return next(e);
    }
    if (!VALID_TYPES.includes(type)) {
      const e = new Error(`type must be one of: ${VALID_TYPES.join(', ')}.`);
      e.statusCode = 400;
      return next(e);
    }
    if (!isValidDate(check_in) || !isValidDate(check_out)) {
      const e = new Error('check_in and check_out must be valid YYYY-MM-DD dates.');
      e.statusCode = 400;
      return next(e);
    }
    if (check_out <= check_in) {
      const e = new Error('check_out must be strictly after check_in.');
      e.statusCode = 400;
      return next(e);
    }

    /**
     * LEFT JOIN rooms with any OVERLAPPING booking.
     * A room is available if the LEFT JOIN produces no match (b.id IS NULL).
     *
     * Overlap: existing.check_in < new.check_out AND existing.check_out > new.check_in
     */
    const { rows } = await db.execute({
      sql: `
        SELECT r.*
        FROM   rooms r
        LEFT JOIN bookings b
               ON  b.room_id   = r.id
               AND b.check_in  < ?
               AND b.check_out > ?
        WHERE  r.type = ?
        AND    b.id IS NULL
        ORDER  BY r.room_no
      `,
      args: [check_out, check_in, type],
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
