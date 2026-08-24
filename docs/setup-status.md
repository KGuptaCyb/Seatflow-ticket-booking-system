# Setup and verification status

Updated 2026-08-23. No database reset or destructive data operation was run.

## Configuration

Use untracked `server/.env` and `client/.env` files copied from their `.env.example` templates. Server secrets must never appear in `client/.env`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL/Prisma connection. |
| `REDIS_URL` | Yes | BullMQ delayed-expiry queue. Use only the provider URI; TLS Upstash URLs use `rediss://`. |
| `JWT_SECRET` | Yes in production | JWT signing key; use at least 32 random characters. |
| `CLIENT_URL` | Yes outside local development | Exact browser origin for HTTP and Socket.IO CORS. |
| `RESEND_API_KEY` | For live email | Resend API key, server-only. |
| `EMAIL_FROM` | For live email | Verified Resend sender, for example `Seatflow Tickets <tickets@example.com>`. |
| `SEAT_HOLD_TTL_MINUTES` / `WAITLIST_OFFER_TTL_MINUTES` | No | Both default to 10 minutes. |

The current `REDIS_URL` has been checked structurally: it is a `rediss://` URI with no `redis-cli` command prefix. It cannot presently resolve from this machine, so the provider-issued Upstash URI/DNS access must be corrected before the API worker can run. The configured PostgreSQL connection also cannot be reached from this environment. Resend is intentionally unset, so bookings use the safe preview path rather than attempting live delivery.

## Run locally

1. Ensure PostgreSQL and Redis are reachable from this machine.
2. Install dependencies with `npm ci`.
3. Generate the Prisma client: `npm run prisma:generate -w server`.
4. Apply migrations: `npx prisma migrate deploy --schema server/prisma/schema.prisma`.
5. Start API/worker and client together: `npm run dev`.

The client is at `http://localhost:5173`; API health is `http://localhost:4000/health`.

## Verified locally

| Check | Result |
| --- | --- |
| Email helper tests | Pass (2 tests) |
| Server TypeScript build | Pass |
| Client production build | Pass |
| Prisma schema validation | Pass |
| Redis PING / BullMQ worker | Pending provider DNS/connectivity |
| PostgreSQL query / live API | Pending provider connectivity |
| Resend delivery | Pending verified sender and key |

The integration matrix is in `docs/verification-checklist.md`. It requires a reachable PostgreSQL database, Redis worker, and (for the email assertion) a verified Resend sender. Use temporary accounts/events only; do not test against real customer bookings.
