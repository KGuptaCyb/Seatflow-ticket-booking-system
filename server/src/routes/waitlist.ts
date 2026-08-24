import { Router } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { asyncRoute, ApiError } from '../errors.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { eventChanged } from '../realtime.js';
import { scheduleHold, offerNext } from '../jobs.js';
import { config } from '../config.js';

const r = Router();
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const paymentReference = () => `PAY-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
const bookingReference = () => `BK-${new Date().getFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
const paymentUrl = (reference: string, token: string) => `${config.publicFrontendUrl}/payment/${encodeURIComponent(reference)}?token=${encodeURIComponent(token)}`;
const offerInclude = { waitlist: true, eventSeat: { include: { event: { include: { venue: true } }, seat: true } } } as const;
const offerReason = (offer: { status: string; expiresAt: Date }) => offer.status === 'ACCEPTED' ? 'This offer has already been accepted.' : offer.status === 'CANCELLED' ? 'This offer has been cancelled.' : offer.expiresAt <= new Date() || offer.status === 'EXPIRED' ? 'This offer has expired.' : 'This offer is unavailable.';

r.get('/waitlist/offers/:token', asyncRoute(async (req, res) => {
  const token = String(req.params.token);
  const offer = await prisma.waitlistOffer.findUnique({ where: { actionTokenHash: tokenHash(token) }, include: offerInclude });
  if (!offer) throw new ApiError(404, 'Offer unavailable');
  const seat = offer.eventSeat;
  res.json({ success: true, data: { status: offer.status, expiresAt: offer.expiresAt, unavailableReason: offer.status === 'PENDING' && offer.expiresAt > new Date() ? null : offerReason(offer),
    event: { title: seat.event.title, startsAt: seat.event.startsAt, venue: seat.event.venue.name, location: seat.event.venue.location },
    seat: { row: seat.seat.row, number: seat.seat.number, category: seat.category, price: seat.price },
    subtotal: seat.price, convenienceFee: 2_500, tax: Math.round((seat.price + 2_500) * .18), total: seat.price + 2_500 + Math.round((seat.price + 2_500) * .18),
  } });
}));

r.post('/events/:id/waitlist', authenticate, authorize('CUSTOMER'), asyncRoute(async (req: AuthRequest, res) => {
  const eventId = String(req.params.id), category = String(req.body.category || '');
  if (!category) throw new ApiError(400, 'Category required');
  const matchingSeats = await prisma.eventSeat.count({ where: { eventId, category } });
  if (!matchingSeats) throw new ApiError(400, 'Unknown seat category');
  const waitlist = await prisma.waitlist.upsert({ where: { eventId_userId_category: { eventId, userId: req.user!.id, category } }, create: { eventId, userId: req.user!.id, category }, update: { active: true } });
  res.status(201).json({ success: true, data: waitlist });
}));

r.get('/events/:id/waitlist/status', authenticate, asyncRoute(async (req: AuthRequest, res) => {
  const data = await prisma.waitlist.findMany({ where: { eventId: String(req.params.id), userId: req.user!.id }, include: { offers: { include: { eventSeat: { include: { seat: true } } }, orderBy: { createdAt: 'desc' } } } });
  res.json({ success: true, data });
}));

// The bearer link is intentionally public, but only carries a high-entropy
// token whose hash is stored. Acceptance creates the normal pending payment.
r.post('/waitlist/offers/:token/accept', asyncRoute(async (req, res) => {
  const token = String(req.params.token);
  const accepted = await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string; waitlistId: string; eventSeatId: string; eventId: string; expiresAt: Date; userId: string; status: string; price: number }[]>`SELECT o.id,o."waitlistId",o."eventSeatId",s."eventId",s.price,o."expiresAt",w."userId",o.status FROM "WaitlistOffer" o JOIN "Waitlist" w ON w.id=o."waitlistId" JOIN "EventSeat" s ON s.id=o."eventSeatId" WHERE o."actionTokenHash"=${tokenHash(token)} FOR UPDATE OF o,w,s`;
    const offer = rows[0];
    if (!offer || offer.status !== 'PENDING' || offer.expiresAt <= new Date()) throw new ApiError(409, offer ? offerReason(offer) : 'Offer unavailable');
    const seat = await tx.eventSeat.updateMany({ where: { id: offer.eventSeatId, status: 'OFFERED' }, data: { status: 'HELD', heldById: offer.userId, holdExpiresAt: offer.expiresAt } });
    if (seat.count !== 1) throw new ApiError(409, 'Offer is no longer valid');
    await tx.waitlistOffer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED' } });
    await tx.waitlist.update({ where: { id: offer.waitlistId }, data: { active: false } });
    const actionToken = randomBytes(32).toString('base64url');
    const subtotal = offer.price, convenienceFee = 2_500, tax = Math.round((subtotal + convenienceFee) * .18);
    const booking = await tx.booking.create({ data: { reference: bookingReference(), userId: offer.userId, eventId: offer.eventId, status: 'PAYMENT_PENDING', qrToken: randomUUID(), subtotal, convenienceFee, tax, total: subtotal + convenienceFee + tax,
      seats: { create: { eventSeatId: offer.eventSeatId, price: subtotal } }, payment: { create: { reference: paymentReference(), expiresAt: offer.expiresAt, actionTokenHash: tokenHash(actionToken), actionTokenExpiresAt: new Date(Math.min(offer.expiresAt.getTime(), Date.now() + config.paymentActionMs)) } } }, include: { payment: true } });
    return { ...offer, payment: booking.payment!, actionToken };
  });
  await scheduleHold(accepted.eventSeatId, accepted.expiresAt);
  eventChanged(accepted.eventId, [{ id: accepted.eventSeatId, status: 'HELD', holdExpiresAt: accepted.expiresAt }]);
  res.json({ success: true, data: { seatId: accepted.eventSeatId, expiresAt: accepted.expiresAt, paymentUrl: paymentUrl(accepted.payment.reference, accepted.actionToken) } });
}));

r.post('/waitlist/offers/:token/decline', asyncRoute(async (req, res) => {
  const token = String(req.params.token);
  const declined = await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string; waitlistId: string; eventSeatId: string; eventId: string; status: string; expiresAt: Date }[]>`SELECT o.id,o."waitlistId",o."eventSeatId",s."eventId",o.status,o."expiresAt" FROM "WaitlistOffer" o JOIN "EventSeat" s ON s.id=o."eventSeatId" WHERE o."actionTokenHash"=${tokenHash(token)} FOR UPDATE OF o,s`;
    const offer = rows[0];
    if (!offer) throw new ApiError(404, 'Offer unavailable');
    if (offer.status === 'CANCELLED') return { eventSeatId: offer.eventSeatId, eventId: offer.eventId, changed: false };
    if (offer.status !== 'PENDING' || offer.expiresAt <= new Date()) throw new ApiError(409, offerReason(offer));
    await tx.waitlistOffer.update({ where: { id: offer.id }, data: { status: 'CANCELLED' } });
    await tx.waitlist.update({ where: { id: offer.waitlistId }, data: { active: false } });
    const released = await tx.eventSeat.updateMany({ where: { id: offer.eventSeatId, status: 'OFFERED' }, data: { status: 'AVAILABLE' } });
    return { eventSeatId: offer.eventSeatId, eventId: offer.eventId, changed: released.count === 1 };
  });
  if (declined.changed) { eventChanged(declined.eventId, [{ id: declined.eventSeatId, status: 'AVAILABLE' }]); await offerNext(declined.eventSeatId); }
  res.json({ success: true, data: { status: 'CANCELLED' } });
}));

export default r;
