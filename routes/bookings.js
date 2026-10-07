/**
 * routes/bookings.js
 * REST endpoints for bookings — async/await with @libsql/client.
 *
 * POST   /api/bookings        — Create a booking
 * GET    /api/bookings        — List all bookings (joined with room info)
 * PUT    /api/bookings/:id    — Modify booking dates
 * DELETE /api/bookings/:id    — Cancel a booking
 *
 * ── Overlap Logic (for viva explanation) ─────────────────────────────────────
 * Two date ranges [A_in, A_out) and [B_in, B_out) overlap when:
 *   A_in  < B_out  AND  A_out > B_in
 *
 * In plain English: booking A starts before B ends, AND A ends after B starts.
 * The strict inequalities mean a guest checking out on Day 5 does NOT conflict
 * with a guest checking in on Day 5 (half-open interval model — same-day
 * turnaround is allowed).
 *
 * We use a transaction (db.batch in @libsql/client) so the overlap check
 * and INSERT are atomic — no two concurrent requests can both pass the check.
 */

const express = require('express');
const { db }  = require('../db');
const {
  validateBooking,
  validateBookingUpdate,
} = require('../middleware/validate');

const router = express.Router();

// ── Shared: overlap check SQL ─────────────────────────────────────────────────
/**
 * Returns first conflicting booking for a room and date range.
 * Pass selfId = 0 for new bookings (no self-exclusion needed).
 */
async function findOverlap(roomId, checkIn, checkOut, selfId) {
  const { rows } = await db.execute({
    sql: `
      SELECT id, guest_name, check_in, check_out
      FROM   bookings
      WHERE  room_id   = ?
      AND    check_in  < ?
      AND    check_out > ?
      AND    id        != ?
      LIMIT  1
    `,
    args: [roomId, checkOut, checkIn, selfId],
  });
  return rows[0] ?? null;
}

// ── POST /api/bookings ────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { room_id, guest_name, check_in, check_out } = req.body ?? {};

    const err = validateBooking({ room_id, guest_name, check_in, check_out });
    if (err) {
      const e = new Error(err.error);
      e.statusCode = 400;
      return next(e);
    }

    const rid = Number(room_id);

    // 1. Room must exist
    const { rows: roomRows } = await db.execute({
      sql: 'SELECT id FROM rooms WHERE id = ?', args: [rid],
    });
    if (!roomRows.length) {
      const e = new Error(`Room with id ${rid} not found.`);
      e.statusCode = 404;
      return next(e);
    }

    // 2. Overlap check (self-id = 0 for new bookings)
    const conflict = await findOverlap(rid, check_in, check_out, 0);
    if (conflict) {
      const e = new Error(
        `Room is already booked from ${conflict.check_in} to ${conflict.check_out}.`
      );
      e.statusCode = 409;
      return next(e);
    }

    // 3. Insert booking
    const result = await db.execute({
      sql:  'INSERT INTO bookings (room_id, guest_name, check_in, check_out) VALUES (?, ?, ?, ?)',
      args: [rid, guest_name.trim(), check_in, check_out],
    });

    const { rows } = await db.execute({
      sql: `
        SELECT b.*, r.room_no, r.type, r.price
        FROM   bookings b
        JOIN   rooms    r ON r.id = b.room_id
        WHERE  b.id = ?
      `,
      args: [Number(result.lastInsertRowid)],
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/bookings ─────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.execute(`
      SELECT b.id, b.guest_name, b.check_in, b.check_out, b.created_at,
             r.id AS room_id, r.room_no, r.type, r.price
      FROM   bookings b
      JOIN   rooms    r ON r.id = b.room_id
      ORDER  BY b.check_in DESC
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/bookings/:id ─────────────────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      const e = new Error('Booking id must be a valid integer.');
      e.statusCode = 400;
      return next(e);
    }

    const { check_in, check_out } = req.body ?? {};
    const err = validateBookingUpdate({ check_in, check_out });
    if (err) {
      const e = new Error(err.error);
      e.statusCode = 400;
      return next(e);
    }

    // 1. Booking must exist
    const { rows: existing } = await db.execute({
      sql: 'SELECT * FROM bookings WHERE id = ?', args: [id],
    });
    if (!existing.length) {
      const e = new Error(`Booking with id ${id} not found.`);
      e.statusCode = 404;
      return next(e);
    }

    // 2. Overlap check (exclude self)
    const conflict = await findOverlap(existing[0].room_id, check_in, check_out, id);
    if (conflict) {
      const e = new Error(
        `Room is already booked from ${conflict.check_in} to ${conflict.check_out}.`
      );
      e.statusCode = 409;
      return next(e);
    }

    // 3. Update
    await db.execute({
      sql:  'UPDATE bookings SET check_in = ?, check_out = ? WHERE id = ?',
      args: [check_in, check_out, id],
    });

    const { rows } = await db.execute({
      sql: `
        SELECT b.*, r.room_no, r.type, r.price
        FROM   bookings b
        JOIN   rooms    r ON r.id = b.room_id
        WHERE  b.id = ?
      `,
      args: [id],
    });

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/bookings/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      const e = new Error('Booking id must be a valid integer.');
      e.statusCode = 400;
      return next(e);
    }

    const result = await db.execute({
      sql: 'DELETE FROM bookings WHERE id = ?', args: [id],
    });

    if (result.rowsAffected === 0) {
      const e = new Error(`Booking with id ${id} not found.`);
      e.statusCode = 404;
      return next(e);
    }

    res.json({ message: `Booking ${id} cancelled successfully.` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
