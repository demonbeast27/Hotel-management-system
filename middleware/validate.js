/**
 * middleware/validate.js
 * Pure validation helpers — no framework deps, easy to unit-test.
 * All exported functions throw or return an error object; they NEVER
 * call next() themselves so the caller decides the response code.
 */

const ROOM_TYPES = ['Single', 'Double', 'Deluxe', 'Suite'];

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true if the string is a valid calendar date in YYYY-MM-DD format.
 * A regex quick-check is followed by a Date parse to catch e.g. 2024-02-30.
 */
function isValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str);
  return !isNaN(d.getTime()) && d.toISOString().startsWith(str);
}

/**
 * Validate a pair of ISO date strings: both must be valid, check_out must
 * be strictly after check_in, and check_in must not be in the past.
 *
 * @param {string} checkIn  - YYYY-MM-DD
 * @param {string} checkOut - YYYY-MM-DD
 * @param {boolean} skipPastCheck - set true for PUT (modifying existing booking)
 * @returns {{ error: string } | null}  null when valid
 */
function validateDates(checkIn, checkOut, skipPastCheck = false) {
  if (!checkIn || !checkOut) {
    return { error: 'check_in and check_out are required.' };
  }
  if (!isValidDate(checkIn))  return { error: 'check_in must be a valid YYYY-MM-DD date.' };
  if (!isValidDate(checkOut)) return { error: 'check_out must be a valid YYYY-MM-DD date.' };

  if (checkOut <= checkIn) {
    return { error: 'check_out must be strictly after check_in.' };
  }

  if (!skipPastCheck) {
    // Compare date strings directly (ISO lexicographic order == chronological order)
    const today = new Date().toISOString().slice(0, 10);
    if (checkIn < today) {
      return { error: 'check_in cannot be in the past.' };
    }
  }

  return null; // ✅ valid
}

// ── Room validators ───────────────────────────────────────────────────────────

function validateRoom({ room_no, type, price }) {
  if (!room_no || typeof room_no !== 'string' || room_no.trim() === '') {
    return { error: 'room_no is required and must be a non-empty string.' };
  }
  if (!ROOM_TYPES.includes(type)) {
    return { error: `type must be one of: ${ROOM_TYPES.join(', ')}.` };
  }
  const p = Number(price);
  if (isNaN(p) || p <= 0) {
    return { error: 'price must be a positive number.' };
  }
  return null;
}

// ── Booking validators ────────────────────────────────────────────────────────

function validateBooking({ room_id, guest_name, check_in, check_out }) {
  if (!room_id || isNaN(Number(room_id))) {
    return { error: 'room_id is required and must be a valid integer.' };
  }
  if (!guest_name || typeof guest_name !== 'string' || guest_name.trim() === '') {
    return { error: 'guest_name is required and must be a non-empty string.' };
  }
  return validateDates(check_in, check_out);
}

function validateBookingUpdate({ check_in, check_out }) {
  // For updates we allow check_in to be in the past (existing bookings).
  return validateDates(check_in, check_out, true);
}

module.exports = { validateRoom, validateBooking, validateBookingUpdate, isValidDate };
