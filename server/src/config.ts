import 'dotenv/config';

const configuredUrls = (process.env.CLIENT_URL || '')
  .split(',')
  .map((url) => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// Development commonly serves Vite at localhost while CLIENT_URL points to a
// LAN frontend for phone testing. Keep both exact origins available locally;
// production accepts only the explicitly configured CLIENT_URL origin(s).
const urls = [
  ...configuredUrls,
  ...(process.env.NODE_ENV === 'production'
    ? []
    : (process.env.DEV_CLIENT_URLS || 'http://localhost:5173')
      .split(',').map((url) => url.trim().replace(/\/+$/, '')).filter(Boolean)),
].filter((url, index, all) => all.indexOf(url) === index);

export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '0.0.0.0',
  jwt: process.env.JWT_SECRET || 'development-only-change-me-please-123456',
  clientUrls: urls,
  // This is intentionally distinct from API/CORS configuration: it is the
  // browser-visible origin encoded in a QR code.
  publicFrontendUrl: (process.env.PUBLIC_FRONTEND_URL || process.env.APP_URL || configuredUrls[0] || 'http://localhost:5173').replace(/\/+$/, ''),
  redis: process.env.REDIS_URL || 'redis://localhost:6379',
  holdMs: Number(process.env.SEAT_HOLD_TTL_MINUTES || 10) * 60000,
  paymentActionMs: Number(process.env.PAYMENT_ACTION_TTL_MINUTES || process.env.SEAT_HOLD_TTL_MINUTES || 10) * 60000,
  offerMs: Number(process.env.WAITLIST_OFFER_TTL_MINUTES || 10) * 60000,
  smtpHost: process.env.SMTP_HOST,
smtpPort: Number(process.env.SMTP_PORT || 2525),
smtpUser: process.env.SMTP_USER,
smtpPass: process.env.SMTP_PASS,
emailFrom: process.env.EMAIL_FROM,
};
