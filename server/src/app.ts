import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler } from './errors.js';
import auth from './routes/auth.js';
import events from './routes/events.js';
import venues from './routes/venues.js';
import movies from './routes/movies.js';
import bookings from './routes/bookings.js';
import waitlist from './routes/waitlist.js';

export const allowedOrigin = (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => {
  if (!origin || config.clientUrls.includes(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS'));
};

export function createApp() {
  const app = express();
  app.use(helmet()); app.use(cors({ origin: allowedOrigin })); app.use(express.json());
  app.get('/health', (_q, res) => res.json({ ok: true }));
  app.use('/api/auth', auth); app.use('/api/movies', movies); app.use('/api/events', events);
  app.use('/api/venues', venues); app.use('/api/bookings', bookings); app.use('/api', waitlist);
  app.use(errorHandler);
  return app;
}
