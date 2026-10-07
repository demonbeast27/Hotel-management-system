# LuxStay Hotel — Room Booking System

A full-stack Hotel Room Booking System built as a college mini project.

**Stack:** Node.js · Express.js · SQLite (better-sqlite3) · Vanilla HTML/CSS/JS

---

## Quick Start

```bash
npm install
npm start
# App runs at http://localhost:3000
```

---

## Running Tests

```bash
npm test
```

Uses Node.js built-in `node:test` + `supertest`. Tests run against an **in-memory** SQLite database so `hotel.db` is never touched.

---

## Project Structure

```
hotel-booking/
├── server.js                 # Express entry point
├── db.js                     # SQLite connection, schema + seed
├── routes/
│   ├── rooms.js              # /api/rooms endpoints
│   └── bookings.js           # /api/bookings endpoints
├── middleware/
│   ├── validate.js           # Validation helpers
│   └── errorHandler.js       # Centralised error handler
├── public/
│   ├── index.html            # Single-page UI
│   ├── style.css             # Design system + responsive CSS
│   └── app.js                # fetch()-based frontend logic
├── tests/
│   └── api.test.js           # Automated API tests
├── package.json
└── README.md
```

---

## Database Schema

```
rooms                              bookings
─────────────────────────          ──────────────────────────────────
id       INTEGER PK AUTOINC        id         INTEGER PK AUTOINC
room_no  TEXT UNIQUE NOT NULL  1──N room_id    INTEGER FK -> rooms(id)
type     TEXT CHECK IN (Single,     guest_name TEXT NOT NULL
           Double,Deluxe,Suite)     check_in   DATE NOT NULL
price    REAL > 0                   check_out  DATE NOT NULL
status   TEXT DEFAULT Available     created_at DATETIME DEFAULT NOW
```

PRAGMA foreign_keys = ON, journal_mode = WAL

---

## REST API Reference

| Method | Endpoint | Success | Errors |
|--------|----------|---------|--------|
| POST | `/api/rooms` | 201 | 400, 409 |
| GET | `/api/rooms` | 200 | - |
| GET | `/api/rooms/search?type=&check_in=&check_out=` | 200 | 400 |
| POST | `/api/bookings` | 201 | 400, 404, 409 |
| GET | `/api/bookings` | 200 | - |
| PUT | `/api/bookings/:id` | 200 | 400, 404, 409 |
| DELETE | `/api/bookings/:id` | 200 | 404 |

---

## Overlap Logic (Viva Notes)

Two bookings overlap when: `A_in < B_out AND A_out > B_in`

Strict inequalities allow same-day checkout/check-in (half-open interval model).

The check runs inside a SQLite transaction to prevent race conditions.

---

## Seed Data

| Room | Type | Price/Night |
|------|------|-------------|
| 101 | Single | 2500 |
| 102 | Single | 2500 |
| 201 | Double | 4500 |
| 202 | Double | 4500 |
| 301 | Deluxe | 8000 |
| 401 | Suite | 15000 |
