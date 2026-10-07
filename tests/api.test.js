/**
 * tests/api.test.js
 * Automated API tests using Node.js built-in `node:test` + supertest.
 *
 * Run: npm test
 *
 * Test cases:
 *  1. Book a room, then book the same room for overlapping dates → expect 409
 *  2. Back-to-back booking (checkout day = next check-in day) → expect 201
 *  3. check_out before check_in → expect 400
 *  4. Cancel a non-existent booking → expect 404
 *  5. Add a duplicate room_no → expect 409
 *  6. Search returns only rooms free for the requested dates
 *  7. GET /api/bookings includes room_no and type
 */

const { test, before, describe } = require('node:test');
const assert   = require('node:assert/strict');
const request  = require('supertest');

// Use in-memory SQLite for tests (no pollution of hotel.db)
process.env.DB_PATH = ':memory:';
// Use a random port so tests can run even when the server is already on 3000
process.env.PORT = '0';

// Import server — start() is NOT called automatically when required.
// We call start() manually to initialise the DB and get the Express app.
const { app, start } = require('../server');

// ── Helper: today + N days in YYYY-MM-DD ─────────────────────────────────────
function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// ── Test Suite ────────────────────────────────────────────────────────────────
describe('Hotel Booking API', () => {
  let createdRoomId;

  // Initialise DB (schema + seed) before running any tests
  before(async () => {
    await start();

    // Add a dedicated test room so seed data doesn't interfere
    const res = await request(app)
      .post('/api/rooms')
      .send({ room_no: 'T01', type: 'Double', price: 5000 });

    createdRoomId = res.body.id;
  });

  // ── Test 1: Overlapping booking → 409 ───────────────────────────────────
  test('1. Double-booking same room → 409 Conflict', async () => {
    const checkIn  = futureDate(5);
    const checkOut = futureDate(8);

    const first = await request(app)
      .post('/api/bookings')
      .send({ room_id: createdRoomId, guest_name: 'Alice', check_in: checkIn, check_out: checkOut });
    assert.equal(first.status, 201, `First booking should be 201: ${JSON.stringify(first.body)}`);

    // Overlapping: days 6-9 overlaps with 5-8
    const second = await request(app)
      .post('/api/bookings')
      .send({ room_id: createdRoomId, guest_name: 'Bob', check_in: futureDate(6), check_out: futureDate(9) });
    assert.equal(second.status, 409, `Overlapping should be 409, got ${second.status}`);
    assert.ok(second.body.error, 'Response should contain an error message');
  });

  // ── Test 2: Back-to-back (checkout = next check-in) → 201 ──────────────
  test('2. Back-to-back booking → 201 OK', async () => {
    // Book days +10 → +12
    const r1 = await request(app)
      .post('/api/bookings')
      .send({ room_id: createdRoomId, guest_name: 'Charlie', check_in: futureDate(10), check_out: futureDate(12) });
    assert.equal(r1.status, 201, `Setup booking failed: ${JSON.stringify(r1.body)}`);

    // Next booking starts exactly on checkout day — should be allowed
    const r2 = await request(app)
      .post('/api/bookings')
      .send({ room_id: createdRoomId, guest_name: 'Diana', check_in: futureDate(12), check_out: futureDate(14) });
    assert.equal(r2.status, 201, `Back-to-back should be 201, got ${r2.status}: ${JSON.stringify(r2.body)}`);
  });

  // ── Test 3: check_out before check_in → 400 ─────────────────────────────
  test('3. check_out before check_in → 400', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ room_id: createdRoomId, guest_name: 'Eve', check_in: futureDate(5), check_out: futureDate(3) });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  // ── Test 4: Cancel non-existent booking → 404 ───────────────────────────
  test('4. Cancel non-existent booking → 404', async () => {
    const res = await request(app).delete('/api/bookings/999999');
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  // ── Test 5: Duplicate room_no → 409 ─────────────────────────────────────
  test('5. Duplicate room_no → 409', async () => {
    // T01 was added in before(). Adding it again must fail.
    const res = await request(app)
      .post('/api/rooms')
      .send({ room_no: 'T01', type: 'Single', price: 2000 });
    assert.equal(res.status, 409);
    assert.ok(res.body.error);
  });

  // ── Test 6: Search returns only free rooms ───────────────────────────────
  test('6. Search returns only free rooms for dates', async () => {
    // Add a second Double room (T02) which has NO bookings
    const addRes = await request(app)
      .post('/api/rooms')
      .send({ room_no: 'T02', type: 'Double', price: 5000 });
    const freeRoomId = addRes.body.id;

    // T01 has a booking for days +5 → +8 (from test 1)
    const checkIn  = futureDate(5);
    const checkOut = futureDate(8);

    const res = await request(app)
      .get(`/api/rooms/search?type=Double&check_in=${checkIn}&check_out=${checkOut}`);
    assert.equal(res.status, 200);

    const ids = res.body.map(r => r.id);
    assert.ok(!ids.includes(createdRoomId), 'Booked T01 should NOT appear in results');
    assert.ok(ids.includes(freeRoomId),     'Free T02 SHOULD appear in results');
  });

  // ── Test 7: GET /api/bookings includes room_no and type ─────────────────
  test('7. GET /api/bookings includes room_no and type', async () => {
    const res = await request(app).get('/api/bookings');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    if (res.body.length > 0) {
      assert.ok(res.body[0].room_no, 'Booking should include room_no');
      assert.ok(res.body[0].type,    'Booking should include room type');
    }
  });
});
