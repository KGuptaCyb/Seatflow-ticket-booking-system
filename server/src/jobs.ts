import { Queue, Worker } from 'bullmq';
import { createHash, randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';
import { prisma } from './db.js';
import { config } from './config.js';
import { sendEmail } from './email.js';
import { eventChanged } from './realtime.js';

const redisUrl = new URL(config.redis);
const connection = new Redis(config.redis, { maxRetriesPerRequest: null, ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}) });
export const expiryQueue = new Queue('expiry', { connection });
export const scheduleHold = (seatId: string, expires: Date) => expiryQueue.add('hold', { seatId }, { delay: Math.max(0, +expires - Date.now()), jobId: `hold:${seatId}:${+expires}` });
export const scheduleOffer = (offerId: string, expires: Date) => expiryQueue.add('offer', { offerId }, { delay: Math.max(0, +expires - Date.now()), jobId: `offer:${offerId}` });
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** FIFO, category-scoped allocation. Both the seat and queue row are locked,
 * preventing duplicate offers when cancellation and expiry jobs overlap. */
export async function offerNext(eventSeatId: string) {
  const expiresAt = new Date(Date.now() + config.offerMs);
  const allocation = await prisma.$transaction(async (tx) => {
    const seats = await tx.$queryRaw<{ id: string; eventId: string; category: string; status: string }[]>`SELECT id,"eventId",category,status FROM "EventSeat" WHERE id=${eventSeatId} FOR UPDATE`;
    const seat = seats[0];
    if (!seat || seat.status !== 'AVAILABLE') return null;
    const candidates = await tx.$queryRaw<{ id: string; email: string }[]>`SELECT w.id,u.email FROM "Waitlist" w JOIN "User" u ON u.id=w."userId" WHERE w."eventId"=${seat.eventId} AND w.category=${seat.category} AND w.active=true ORDER BY w."createdAt" ASC LIMIT 1 FOR UPDATE OF w SKIP LOCKED`;
    const candidate = candidates[0];
    if (!candidate) return null;
    await tx.eventSeat.update({ where: { id: seat.id }, data: { status: 'OFFERED' } });
    const actionToken = randomBytes(32).toString('base64url');
    const offer = await tx.waitlistOffer.create({ data: { waitlistId: candidate.id, eventSeatId: seat.id, actionTokenHash: tokenHash(actionToken), expiresAt } });
    return { offer, actionToken, eventId: seat.eventId, email: candidate.email };
  });
  if (!allocation) return null;
  await scheduleOffer(allocation.offer.id, expiresAt);
  eventChanged(allocation.eventId, [{ id: eventSeatId, status: 'OFFERED' }]);
  const offerUrl = `${config.publicFrontendUrl}/waitlist-offer/${encodeURIComponent(allocation.actionToken)}`;
  try { await sendEmail({ to: allocation.email, subject: 'A Seatflow waitlist seat is available', html: `<p>A seat is available for you until <strong>${expiresAt.toLocaleString()}</strong>.</p><p><a href="${offerUrl}">Complete your booking</a></p>` }); }
  catch (error) { console.error(`[email] waitlist offer delivery failed for ${allocation.offer.id}`, error); }
  return allocation.offer;
}

async function expireHold(seatId: string) {
  const released = await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string; eventId: string }[]>`SELECT id,"eventId" FROM "EventSeat" WHERE id=${seatId} AND status='HELD' AND "holdExpiresAt"<=NOW() FOR UPDATE`;
    const seat = rows[0]; if (!seat) return null;
    await tx.eventSeat.update({ where: { id: seat.id }, data: { status: 'AVAILABLE', heldById: null, holdExpiresAt: null } });
    const pending = await tx.payment.findMany({ where: { status: 'PENDING', booking: { status: 'PAYMENT_PENDING', seats: { some: { eventSeatId: seat.id } } } }, select: { id: true, bookingId: true } });
    if (pending.length) {
      await tx.payment.updateMany({ where: { id: { in: pending.map(p => p.id) }, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      await tx.booking.updateMany({ where: { id: { in: pending.map(p => p.bookingId) }, status: 'PAYMENT_PENDING' }, data: { status: 'EXPIRED' } });
    }
    return seat;
  });
  if (!released) return;
  eventChanged(released.eventId, [{ id: released.id, status: 'AVAILABLE' }]);
  await offerNext(released.id);
}

async function reconcileExpiredHolds() {
  // Indexed by event/status; bounded batches keep recovery light after outages.
  const expired = await prisma.eventSeat.findMany({ where: { status: 'HELD', holdExpiresAt: { lte: new Date() } }, select: { id: true }, take: 100, orderBy: { holdExpiresAt: 'asc' } });
  await Promise.all(expired.map(seat => expireHold(seat.id)));
}

export const startWorker = () => {
  const worker = new Worker('expiry', async job => {
  if (job.name === 'hold') return expireHold(job.data.seatId);
  const expired = await prisma.$transaction(async tx => {
    const offers = await tx.$queryRaw<{ id: string; waitlistId: string; eventSeatId: string; eventId: string }[]>`SELECT o.id,o."waitlistId",o."eventSeatId",s."eventId" FROM "WaitlistOffer" o JOIN "EventSeat" s ON s.id=o."eventSeatId" WHERE o.id=${job.data.offerId} AND o.status='PENDING' AND o."expiresAt"<=NOW() FOR UPDATE OF o,s`;
    const offer = offers[0]; if (!offer) return null;
    await tx.waitlistOffer.update({ where: { id: offer.id }, data: { status: 'EXPIRED' } });
    await tx.waitlist.update({ where: { id: offer.waitlistId }, data: { active: false } });
    await tx.eventSeat.update({ where: { id: offer.eventSeatId }, data: { status: 'AVAILABLE', heldById: null, holdExpiresAt: null } });
    return offer;
  });
  if (!expired) return;
  eventChanged(expired.eventId, [{ id: expired.eventSeatId, status: 'AVAILABLE' }]);
  await offerNext(expired.eventSeatId);
  }, { connection });
  // Delayed jobs are an optimization; this database reconciliation recovers
  // holds after worker restarts, Redis interruption, or missed delayed jobs.
  const timer = setInterval(() => { void reconcileExpiredHolds().catch(error => console.error('[expiry] hold reconciliation failed', error)); }, 60_000);
  timer.unref();
  void reconcileExpiredHolds().catch(error => console.error('[expiry] initial hold reconciliation failed', error));
  return worker;
};
