# Deployment checklist

1. Provision managed PostgreSQL and Redis. Use the provider-issued URI only in `DATABASE_URL`/`REDIS_URL`; TLS Redis endpoints must use `rediss://`.
2. Set `CLIENT_URL` and `PUBLIC_FRONTEND_URL` to the deployed frontend HTTPS origin. Set `VITE_API_URL` and `VITE_SOCKET_URL` to the deployed API origins. For LAN testing, use the computer's LAN address in `CLIENT_URL` and `PUBLIC_FRONTEND_URL`; never use `localhost` in a QR ticket.
3. Generate a 32+ character `JWT_SECRET`; do not reuse development credentials.
4. Verify a Resend sending domain and configure `RESEND_API_KEY` plus `EMAIL_FROM`.
5. Run `npm ci`, `npm run prisma:generate -w server`, `npx prisma migrate deploy --schema server/prisma/schema.prisma`, and `npm run build`. This applies the normal migration history, including secure payment and waitlist action-token migrations, without resetting production data.
6. Serve `client/dist` from a static host and run `npm run start -w server` in an API service with a persistent Redis connection. Set the API health check to `/health`.
7. Use at least one worker-capable API process. At larger scale, run the BullMQ worker separately with the same Redis queue.
8. Set CORS only to the exact client origin and validate a full booking, email, cancellation, waitlist expiry, and organiser summary after deployment.
9. Configure the static host to serve `index.html` as the fallback for unknown paths so direct QR visits to `/verify/:reference` reach the React application.
# Public QR URLs

Set `PUBLIC_FRONTEND_URL` to the browser-visible frontend origin. For phone testing on a LAN, use the computer's LAN address (for example `http://192.168.x.x:5173`) in `PUBLIC_FRONTEND_URL` and `CLIENT_URL`; do not use `localhost`. `APP_URL` remains supported as a legacy fallback.
