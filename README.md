# Seatflow Ticket Booking System

Seatflow is a full-stack movie and concert ticketing system with live seat maps, protected temporary holds, QR tickets, cancellation, FIFO waitlists, and role-based operations.

## Stack

- React + Vite client
- Express + TypeScript API
- PostgreSQL + Prisma data layer
- Redis + BullMQ delayed expiry jobs
- Socket.IO real-time seat updates
- Resend transactional email API

## Run locally

1. Install Node.js 20+, PostgreSQL, and Redis.
2. Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env`.
3. Set `DATABASE_URL`, `REDIS_URL`, and a strong `JWT_SECRET` in `server/.env`.
4. Run `npm install`, then `npm run prisma:generate -w server` and `npm run prisma:migrate -w server`.
5. Start both apps: `npm run dev`.

Client: `http://localhost:5173`. API: `http://localhost:4000`. Health check: `GET /health`.

## Email and QR tickets

The QR payload is a public verification URL (for example `https://tickets.example.com/verify/BK-2026-D418AD2B`), not a customer session or a private token. `GET /api/bookings/verify/:reference` is intentionally public and returns only the event/seat information needed at entry. Every newly confirmed booking generates a QR PNG after its transaction commits; **My tickets** also regenerates QR images for older confirmed bookings.

Set `PUBLIC_FRONTEND_URL` on the API to the browser-visible frontend origin. For LAN testing, set it and `CLIENT_URL` to `http://<your-computer-lan-ip>:5173`, and use the same LAN origin in the phone browser. The previous `APP_URL` is accepted as a temporary compatibility fallback, but new deployments should use `PUBLIC_FRONTEND_URL`. The Vite development proxy keeps unset client API/socket URLs same-origin, so a LAN phone does not call its own `localhost`.

For local work, `DEV_CLIENT_URLS` defaults to the exact Vite origin `http://localhost:5173`, even if `CLIENT_URL` is a LAN address. Set `NODE_ENV=production` in deployment: this disables the development list and keeps CORS restricted to the explicitly configured `CLIENT_URL` origin(s). Never use `*` for the API or Socket.IO CORS origin.

## Simulated payment lifecycle

Checkout creates a `PAYMENT_PENDING` booking while the selected seats remain server-held. It creates a separate `Payment` record and QR using `/payment/:paymentReference?token=…`; the short-lived random action token permits payment from a second device without a Seatflow login, while only its hash is stored. Success atomically changes payment to `SUCCESSFUL`, confirms the booking, books its seats, and only then generates the distinct admission QR (`/verify/:bookingReference`) and sends email. Cancellation or hold expiry releases seats and closes the payment. Prices, convenience fee, GST, and total are snapshotted on the booking in paise.

Create a free Resend account, verify a sending domain (or use its test sender for the account owner), create an API key, then set:

```env
RESEND_API_KEY="re_..."
EMAIL_FROM="Seatflow Tickets <tickets@your-verified-domain.com>"
```

Without those two variables, development remains safe: a preview is logged and a successful booking is never rolled back because an email provider is unavailable. See [Resend’s send-email API](https://resend.com/docs/api-reference/emails/send-email) for account/domain requirements.

## Roles

- `CUSTOMER`: browse, hold, confirm, cancel, waitlist, and view tickets.
- `ORGANISER`: create events and view summaries only for events they own.
- `ADMIN`: create venues, create events, and view any event summary.

Registration intentionally permits only customer or organiser roles. Promote the first trusted admin directly in the database for a demo; never expose admin self-registration publicly.

## Checks before submission

```bash
npm run test
npm run build
```

## Database-backed integration tests

Docker users can start the isolated services with `npm run test:services:up`; this creates only `seatflow-postgres-test` (`seatflow_test` on port 55432) and `seatflow-redis-test` (port 56379). Export the matching values from `server/.env.test.example`, apply migrations with `DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy --schema server/prisma/schema.prisma`, then run `npm run test:integration -w server`. The suite refuses to run or clean data unless `TEST_DATABASE_URL` is set and its database name contains `test`; it never uses the development database. Redis is likewise a separate test container.

Run the manual integration checklist in [docs/verification-checklist.md](docs/verification-checklist.md) against the deployed environment. Architecture, data model, API reference, deployment steps, and the under-800-word design write-up are in [docs](docs/).
