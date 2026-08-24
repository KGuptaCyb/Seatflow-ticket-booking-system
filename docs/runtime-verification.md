# Runtime verification

Verified on 2026-08-22. Prisma remains at the installed **6.19.3** version. No schema changes, destructive database commands, reset operations, or dependency upgrades were performed.

## Latest infrastructure recheck — 2026-08-23

| Check | Result | Detail |
| --- | --- | --- |
| `REDIS_URL` format | PASS | It is a parseable Redis URI. Its credentials were not printed. |
| Redis ioredis connection | FAIL | The project's `ioredis` connection failed DNS resolution for the configured Upstash host (`ENOTFOUND`). BullMQ cannot be usable until Redis hostname resolution/connectivity succeeds. |
| BullMQ readiness | NOT RUN | It was intentionally not attempted after ioredis failed before a connection could be established. |
| `DATABASE_URL` format | PASS | It is a valid `postgresql://` URI with a Neon hostname and `sslmode=require`; credentials were masked. |
| PostgreSQL Prisma `SELECT 1` | FAIL | Prisma cannot reach the configured Neon hostname on port 5432. This is a DNS/connectivity/network issue, not a malformed URI or absent SSL requirement. |
| Migration `init` | NOT RUN | The recheck did not run a migration because the read-only PostgreSQL connection test failed. |
| Server build | PASS | `npm run build -w server` completed successfully. |

The configured Redis and PostgreSQL hostnames both fail from this execution environment. Verify outbound DNS/network access and the provider endpoints from the machine/environment that will run the backend. For the Upstash service, ensure its connection URI and TLS scheme match the provider-issued URI; use only the URI in `REDIS_URL`, never the `redis-cli` command.

## Connectivity recheck with actual configured hosts — 2026-08-23

| Check | Result | Detail |
| --- | --- | --- |
| Google DNS (8.8.8.8) | PASS | Confirmed by the user. |
| Neon hostname DNS | PASS | The hostname resolves to multiple public addresses. |
| Upstash hostname DNS | PASS | The hostname resolves through Upstash's global endpoint. |
| Neon TCP 5432 | PASS | TCP connection succeeded. |
| Upstash TCP 6379 | PASS | TCP connection succeeded. |
| PostgreSQL Prisma `SELECT 1` | PASS | The configured Prisma Client returned `connected: 1`. |
| Migration `init` | PASS | `prisma migrate status` reports one migration and the database schema is up to date. |
| Database tables | PASS | `Booking`, `BookingSeat`, `Event`, `EventSeat`, `Seat`, `User`, `Venue`, `Waitlist`, `WaitlistOffer`, and `_prisma_migrations` were read from the `public` schema. |
| Redis ioredis/BullMQ | FAIL | The project's current non-TLS ioredis connection closes during protocol handshake. A TLS-only in-memory diagnostic reached Redis and returned `WRONGPASS`, identifying invalid Redis credentials; the endpoint also requires TLS. |

No secrets, complete URLs, usernames, passwords, tokens, or API keys were recorded. The database connection and migration are confirmed working. The remaining Redis issue is configuration-only: obtain the current Upstash TLS connection URI/credentials, use its URI-only value in `REDIS_URL`, and configure the runtime for TLS (for example, a `rediss://` URI) before retrying the backend.

## Latest infrastructure re-verification

| Check | Latest result | Detail |
| --- | --- | --- |
| `REDIS_URL` structure | FAIL | The active `server/.env` value supplied to ioredis is still not a URI: it contains `redis-cli --tls -u` text before the URI. `new URL()` and ioredis both reject it as `ERR_INVALID_URL`. |
| Redis ioredis `PING` | FAIL | Not attempted after URL parsing failed; no network connection was opened. |
| BullMQ readiness | FAIL | Not attempted after the shared ioredis connection rejected the malformed value. |
| `DATABASE_URL` structure | PASS | Parsed as a PostgreSQL URI with a Neon host, database name, and `sslmode=require`; credentials were not printed. |
| PostgreSQL Prisma `SELECT 1` | FAIL | Prisma cannot reach the configured Neon host on port 5432. This is a Neon database/network/DNS/connectivity issue, not a malformed URI or an SSL URI-parameter issue. |
| Migration | NOT RUN | Per verification requirements, skipped because PostgreSQL connectivity failed. |
| Server build | PASS | `npm run build -w server` completed successfully. |

### Required corrections

Set `REDIS_URL` to only the URI value, with no command prefix. For a TLS Upstash endpoint that means a value beginning with `rediss://`, not `redis-cli --tls -u redis://...`.

For PostgreSQL, verify that this machine can reach the configured Neon endpoint on TCP 5432 and that the Neon project/database is active and permits connections. The URI format itself parsed successfully and includes the required SSL mode.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Prisma validation | PASS | `npx prisma validate --schema prisma/schema.prisma` run from `server/` reports the schema is valid. |
| Prisma Client generation | PASS | `npx prisma generate --schema prisma/schema.prisma` run from `server/` generated Prisma Client v6.19.3. |
| PostgreSQL Prisma query | FAIL | An actual `PrismaClient` `SELECT 1` could not reach the configured Neon database host on port 5432. |
| Initial migration (`init`) | FAIL | `npm run prisma:migrate -w server -- --name init` reached the configured datasource but failed with a Prisma schema-engine error; the failed direct connection confirms the database host was unreachable from this environment. No migration was applied. |
| Database migration state | Not available | It cannot be inspected until PostgreSQL connectivity succeeds. |
| Required application models | PASS (schema) | The valid Prisma schema defines `User`, `Venue`, `Seat`, `Event`, `EventSeat`, `Booking`, `BookingSeat`, `Waitlist`, and `WaitlistOffer`. Database tables cannot yet be confirmed because the database is unreachable. |
| Redis / BullMQ connection | FAIL | ioredis rejected the configured `REDIS_URL` as `ERR_INVALID_URL`. Its value contains a `redis-cli --tls -u` command prefix, not a URL accepted by `new Redis(REDIS_URL)`. |
| Server TypeScript build | PASS | `npm run build -w server` completed successfully. |

## Prisma command context

`server/.env` is intentionally scoped to the server workspace. Therefore, Prisma commands should be run from `server/` (or via the server npm workspace scripts) so `DATABASE_URL` is loaded. Running `npx prisma validate --schema server/prisma/schema.prisma` from repository root does not load `server/.env` and reports a missing `DATABASE_URL`.

## Migration

Requested migration name: `init`.

Result: no migration was created or applied because the configured PostgreSQL host could not be reached. There is no `server/prisma/migrations/` directory yet. Do **not** use `prisma migrate reset`; after connectivity is repaired, run the standard initial migration command below.

## Redis configuration issue

The project creates BullMQ's queue and worker through `new Redis(config.redis, { maxRetriesPerRequest: null })`. That constructor requires `REDIS_URL` to contain only a valid Redis URI, for example:

```env
REDIS_URL="rediss://default:PASSWORD@HOST:6379"
```

Do not include `redis-cli --tls -u` or any shell command text in the environment variable. No secret values are included in this document.

## Fixes made

- Fixed server route typing by making `asyncRoute` generically typed instead of accepting `any`.
- Corrected the ioredis import to use its `Redis` class, matching the actual installed module's TypeScript exports.
- Normalized Express route parameters to strings before passing them into Prisma.
- Corrected booking and waitlist route typing so relation results remain accurately typed.

These are build/type correctness fixes only; frontend functionality and Prisma schema were not changed.

## Exact next commands

1. Correct `REDIS_URL` in `server/.env` to the URI only, then verify from the server directory:

```bash
node --input-type=module -e "import 'dotenv/config'; import { Redis } from 'ioredis'; const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null }); try { console.log(await redis.ping()); } finally { redis.disconnect(); }"
```

2. Ensure the configured PostgreSQL host is accessible from this machine (network access, hostname, port 5432, credentials, SSL settings), then create and apply the initial migration:

```bash
cd server
npx prisma migrate dev --name init
```

3. Start the backend (API and embedded BullMQ worker):

```bash
npm run dev -w server
```

4. Start the frontend in a second terminal:

```bash
npm run dev -w client
```
