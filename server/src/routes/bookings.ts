import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import QRCode from 'qrcode';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { qrPngAttachment, sendEmail, ticketEmailHtml } from '../email.js';
import { ApiError, asyncRoute } from '../errors.js';
import { offerNext } from '../jobs.js';
import { authenticate, AuthRequest, authorize } from '../middleware/auth.js';
import { eventChanged } from '../realtime.js';

const r = Router();
const transactionOptions = { maxWait: 10_000, timeout: 15_000 };
const referencePattern = /^BK-\d{4}-[A-Z0-9]{8}$/;
const bookingReference = () => `BK-${new Date().getFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
const paymentReference = () => `PAY-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
export const verificationUrlFor = (reference: string) => `${config.publicFrontendUrl}/verify/${encodeURIComponent(reference)}`;
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const paymentUrlFor = (reference: string, token: string) => `${config.publicFrontendUrl}/payment/${encodeURIComponent(reference)}?token=${encodeURIComponent(token)}`;
const qrFor = (value: string) => QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
const priceBreakdown = (seats: { price: number }[]) => {
  const subtotal = seats.reduce((sum, seat) => sum + seat.price, 0);
  const convenienceFee = seats.length * 2_500;
  const tax = Math.round((subtotal + convenienceFee) * 0.18);
  return { subtotal, convenienceFee, tax, total: subtotal + convenienceFee + tax };
};

const bookingInclude = {
  user: { select: { name: true, email: true } }, event: { include: { venue: true, movie: true } },
  seats: { include: { eventSeat: { include: { seat: true } } } }, payment: true,
} as const;
const publicPaymentInclude = { booking: { include: { event: { include: { venue: true } }, seats: { include: { eventSeat: { include: { seat: true } } } } } } } as const;

const unavailableReason = (payment: { status: string; expiresAt: Date; actionTokenExpiresAt: Date }) => {
  if (payment.status === 'SUCCESSFUL') return 'This payment has already been completed.';
  if (payment.status === 'CANCELLED') return 'This payment has been cancelled.';
  if (payment.status === 'EXPIRED' || payment.expiresAt <= new Date() || payment.actionTokenExpiresAt <= new Date()) return 'This payment link has expired.';
  return 'This payment link is unavailable.';
};
const requirePaymentToken = (payment: { actionTokenHash: string; status: string; expiresAt: Date; actionTokenExpiresAt: Date }, token: unknown, allowCompleted = false) => {
  if (typeof token !== 'string' || token.length < 32 || tokenHash(token) !== payment.actionTokenHash) throw new ApiError(404, 'Payment unavailable');
  if (payment.status === 'SUCCESSFUL' && allowCompleted) return;
  if (payment.status !== 'PENDING' || payment.expiresAt <= new Date() || payment.actionTokenExpiresAt <= new Date()) throw new ApiError(409, unavailableReason(payment));
};

async function deliverTicket(booking: any) {
  let qrCode: string;
  try {
    qrCode = await qrFor(verificationUrlFor(booking.reference));
    await prisma.booking.update({ where: { id: booking.id }, data: { qrCode } });
  } catch (error) { console.error(`[qr] ticket generation failed for ${booking.reference}`, error); return null; }
  try {
    await sendEmail({
      to: booking.user.email, subject: `Your Movie Ticket is Confirmed — ${booking.event.title}`,
      html: ticketEmailHtml({ name: booking.user.name, reference: booking.reference, eventTitle: booking.event.title,
        venue: booking.event.venue.name, startsAt: booking.event.startsAt,
        seats: booking.seats.map(({ eventSeat }: any) => `${eventSeat.seat.row}${eventSeat.seat.number}`),
        category: [...new Set(booking.seats.map(({ eventSeat }: any) => eventSeat.category))].join(', '),
        subtotal: booking.subtotal, convenienceFee: booking.convenienceFee, tax: booking.tax, total: booking.total,
        posterUrl: booking.event.movie?.posterUrl, qrDataUrl: qrCode }),
      attachments: [qrPngAttachment(booking.reference, qrCode)],
    });
  } catch (error) { console.error(`[email] confirmation delivery failed for ${booking.reference}`, error); }
  return qrCode;
}

r.get('/verify/:reference', asyncRoute(async (req, res) => {
  const reference = String(req.params.reference ?? '').trim().toUpperCase();
  if (!referencePattern.test(reference)) throw new ApiError(404, 'Ticket not found');
  const booking = await prisma.booking.findUnique({ where: { reference }, include: { event: { include: { venue: true } }, seats: { include: { eventSeat: { include: { seat: true } } } } } });
  if (!booking) throw new ApiError(404, 'Ticket not found');
  res.json({ success: true, data: { valid: booking.status === 'CONFIRMED', reference: booking.reference, status: booking.status,
    event: { title: booking.event.title, startsAt: booking.event.startsAt, venue: booking.event.venue.name, location: booking.event.venue.location },
    seats: booking.seats.map(({ eventSeat, price }) => ({ row: eventSeat.seat.row, number: eventSeat.seat.number, category: eventSeat.category, price })),
  } });
}));

r.get('/payments/:reference', asyncRoute(async (req, res) => {
  const payment = await prisma.payment.findUnique({ where: { reference: String(req.params.reference) }, include: publicPaymentInclude });
  if (!payment) throw new ApiError(404, 'Payment unavailable');
  const token = req.query.token;
  if (typeof token !== 'string' || tokenHash(token) !== payment.actionTokenHash) throw new ApiError(404, 'Payment unavailable');
  const { booking } = payment;
  res.json({ success: true, data: { reference: payment.reference, status: payment.status, expiresAt: payment.expiresAt, qrCode: await qrFor(paymentUrlFor(payment.reference, token)),
    booking: { reference: booking.reference, status: booking.status, subtotal: booking.subtotal, convenienceFee: booking.convenienceFee, tax: booking.tax, total: booking.total,
      event: { title: booking.event.title, startsAt: booking.event.startsAt, venue: booking.event.venue.name, location: booking.event.venue.location },
      seats: booking.seats.map(({ eventSeat, price }) => ({ row: eventSeat.seat.row, number: eventSeat.seat.number, category: eventSeat.category, price })),
    }, unavailableReason: payment.status === 'PENDING' && payment.expiresAt > new Date() && payment.actionTokenExpiresAt > new Date() ? null : unavailableReason(payment),
  } });
}));

r.post('/', authenticate, authorize('CUSTOMER'), asyncRoute(async (req: AuthRequest, res) => {
  const seatIds = req.body.seatIds as string[];
  if (!Array.isArray(seatIds) || !seatIds.length) throw new ApiError(400, 'Seat IDs required');
  const ids = [...new Set(seatIds)]; if (ids.length !== seatIds.length) throw new ApiError(400, 'Seat IDs must be unique');
  const created = await prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<{ id:string; status:string; heldById:string|null; holdExpiresAt:Date|null }[]>`SELECT id,status,"heldById","holdExpiresAt" FROM "EventSeat" WHERE id = ANY(${ids}::text[]) FOR UPDATE`;
    if (locked.length !== ids.length || locked.some(s => s.status !== 'HELD' || s.heldById !== req.user!.id || !s.holdExpiresAt || s.holdExpiresAt <= new Date())) throw new ApiError(409, 'Your seat hold has expired or is invalid');
    const seats = await tx.eventSeat.findMany({ where: { id: { in: ids } }, include: { seat: true } }); const eventId = seats[0]?.eventId;
    if (!eventId || seats.some(s => s.eventId !== eventId)) throw new ApiError(400, 'Seats must belong to one event');
    const expiresAt = new Date(Math.min(...locked.map(s => s.holdExpiresAt!.getTime())));
    const actionToken = randomBytes(32).toString('base64url');
    const actionTokenExpiresAt = new Date(Math.min(expiresAt.getTime(), Date.now() + config.paymentActionMs));
    const prices = priceBreakdown(seats);
    const booking = await tx.booking.create({ data: { reference: bookingReference(), userId: req.user!.id, eventId, qrToken: randomUUID(), status: 'PAYMENT_PENDING', ...prices,
      seats: { create: seats.map(s => ({ eventSeatId: s.id, price: s.price })) }, payment: { create: { reference: paymentReference(), expiresAt, actionTokenHash: tokenHash(actionToken), actionTokenExpiresAt } } }, include: bookingInclude });
    return { booking, actionToken };
  }, transactionOptions);
  const payment = created.booking.payment!; const paymentQrCode = await qrFor(paymentUrlFor(payment.reference, created.actionToken));
  res.status(201).json({ success: true, data: { booking: created.booking, payment: { reference: payment.reference, status: payment.status, expiresAt: payment.expiresAt, qrCode: paymentQrCode, url: paymentUrlFor(payment.reference, created.actionToken) } } });
}));

r.post('/payments/:reference/succeed', asyncRoute(async (req, res) => {
  const completed = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE "reference" = ${String(req.params.reference)} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { reference: String(req.params.reference) }, include: { booking: { include: { seats: true } } } });
    if (!payment) throw new ApiError(404, 'Payment unavailable');
    requirePaymentToken(payment, req.body?.token, true);
    if (payment.status === 'SUCCESSFUL') return { bookingId: payment.bookingId, alreadyComplete: true };
    if (payment.booking.status !== 'PAYMENT_PENDING') throw new ApiError(409, 'This booking is no longer available for payment.');
    const seats = await tx.$queryRaw<{ id:string; status:string; heldById:string|null; holdExpiresAt:Date|null }[]>`SELECT id,status,"heldById","holdExpiresAt" FROM "EventSeat" WHERE id = ANY(${payment.booking.seats.map(s => s.eventSeatId)}::text[]) FOR UPDATE`;
    if (seats.length !== payment.booking.seats.length || seats.some(s => s.status !== 'HELD' || s.heldById !== payment.booking.userId || !s.holdExpiresAt || s.holdExpiresAt <= new Date())) throw new ApiError(409, 'Seat hold is no longer available');
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCESSFUL', completedAt: new Date() } });
    await tx.booking.update({ where: { id: payment.bookingId }, data: { status: 'CONFIRMED' } });
    await tx.eventSeat.updateMany({ where: { id: { in: payment.booking.seats.map(s => s.eventSeatId) } }, data: { status: 'BOOKED', heldById: null, holdExpiresAt: null } });
    return { bookingId: payment.bookingId, alreadyComplete: false };
  }, transactionOptions);
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: completed.bookingId }, include: bookingInclude });
  const qrCode = completed.alreadyComplete ? (booking.qrCode || await qrFor(verificationUrlFor(booking.reference))) : await deliverTicket(booking);
  if (!completed.alreadyComplete) eventChanged(booking.eventId, booking.seats.map(({ eventSeatId }) => ({ id: eventSeatId, status: 'BOOKED' })));
  res.json({ success: true, data: { booking: { ...booking, qrCode }, verificationUrl: verificationUrlFor(booking.reference), alreadyComplete: completed.alreadyComplete } });
}));

r.post('/payments/:reference/cancel', asyncRoute(async (req, res) => {
  const released = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE "reference" = ${String(req.params.reference)} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { reference: String(req.params.reference) }, include: { booking: { include: { seats: true } } } });
    if (!payment) throw new ApiError(404, 'Payment unavailable');
    // A repeat request with the same capability is harmless and reports the final state.
    if (payment.status === 'CANCELLED') { if (typeof req.body?.token !== 'string' || tokenHash(req.body.token) !== payment.actionTokenHash) throw new ApiError(404, 'Payment unavailable'); return { booking: payment.booking, wasCancelled: true }; }
    requirePaymentToken(payment, req.body?.token);
    if (payment.booking.status !== 'PAYMENT_PENDING') throw new ApiError(409, 'Payment cannot be cancelled');
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } }); await tx.booking.update({ where: { id: payment.bookingId }, data: { status: 'CANCELLED' } });
    await tx.eventSeat.updateMany({ where: { id: { in: payment.booking.seats.map(s => s.eventSeatId) }, status: 'HELD', heldById: payment.booking.userId }, data: { status: 'AVAILABLE', heldById: null, holdExpiresAt: null } });
    return { booking: payment.booking, wasCancelled: false };
  }, transactionOptions);
  if (!released.wasCancelled) { eventChanged(released.booking.eventId, released.booking.seats.map(({ eventSeatId }) => ({ id: eventSeatId, status: 'AVAILABLE' }))); await Promise.all(released.booking.seats.map(({ eventSeatId }) => offerNext(eventSeatId))); }
  res.json({ success: true, data: { status: 'CANCELLED' } });
}));

r.get('/', authenticate, asyncRoute(async (req: AuthRequest, res) => {
  const bookings = await prisma.booking.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, include: bookingInclude });
  res.json({ success: true, data: await Promise.all(bookings.map(async b => ({ ...b, qrCode: b.status === 'CONFIRMED' ? await qrFor(verificationUrlFor(b.reference)) : null }))) });
}));

r.post('/:id/resend-email', authenticate, asyncRoute(async (req: AuthRequest, res) => {
  const booking = await prisma.booking.findUnique({ where: { id: String(req.params.id) }, include: bookingInclude });
  if (!booking) throw new ApiError(404, 'Booking not found'); if (booking.userId !== req.user!.id) throw new ApiError(403, 'Not your booking'); if (booking.status !== 'CONFIRMED') throw new ApiError(409, 'Only confirmed tickets can be emailed');
  await deliverTicket(booking); res.json({ success: true, data: { sent: true } });
}));

r.post('/:id/cancel', authenticate, asyncRoute(async (req: AuthRequest, res) => {
  const booking = await prisma.$transaction(async tx => { const b = await tx.booking.findUnique({ where: { id: String(req.params.id) }, include: { seats: { include: { eventSeat: true } }, payment: true } }); if (!b) throw new ApiError(404, 'Booking not found'); if (b.userId !== req.user!.id) throw new ApiError(403, 'Not your booking'); if (b.status !== 'CONFIRMED') throw new ApiError(409, 'Only confirmed bookings can be cancelled'); await tx.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } }); if (b.payment) await tx.payment.update({ where: { id: b.payment.id }, data: { status: 'CANCELLED' } }); await tx.eventSeat.updateMany({ where: { id: { in: b.seats.map(s => s.eventSeatId) } }, data: { status: 'AVAILABLE', heldById: null, holdExpiresAt: null } }); return b; }, transactionOptions);
  eventChanged(booking.eventId, booking.seats.map(({ eventSeatId }) => ({ id: eventSeatId, status: 'AVAILABLE' }))); await Promise.all(booking.seats.map(({ eventSeatId }) => offerNext(eventSeatId))); res.json({ success: true, data: booking });
}));

r.delete('/:id', authenticate, authorize('CUSTOMER'), asyncRoute(async (req: AuthRequest, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: String(req.params.id) },
    include: {
      seats: true,
      payment: true,
    },
  });

  if (!booking) {
    throw new ApiError(404, 'Booking not found');
  }

  if (booking.userId !== req.user!.id) {
    throw new ApiError(403, 'Not your booking');
  }

  if (!['CANCELLED', 'EXPIRED', 'PAYMENT_FAILED'].includes(booking.status)) {
    throw new ApiError(409, 'Only cancelled or expired bookings can be deleted');
  }

  await prisma.booking.delete({
    where: { id: booking.id },
  });

  res.json({
    success: true,
    data: { deleted: true },
  });
}));

export default r;
