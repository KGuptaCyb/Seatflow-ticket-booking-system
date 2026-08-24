import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';

// This suite is intentionally opt-in: it never falls back to DATABASE_URL.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(testDatabaseUrl && /test/i.test(new URL(testDatabaseUrl).pathname));
if (enabled) {
  process.env.DATABASE_URL = testDatabaseUrl;
  if (process.env.TEST_REDIS_URL) process.env.REDIS_URL = process.env.TEST_REDIS_URL;
}

let prisma: any; let server: any; let baseUrl = ''; let createApp: any; let config: any;
const suite = enabled ? describe : describe.skip;
const auth = (user: any) => ({ Authorization: `Bearer ${jwt.sign({ id: user.id, email: user.email, role: user.role }, config.jwt)}` });
const request = async (path: string, options: RequestInit = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  return { status: response.status, body: await response.json() };
};

suite('booking lifecycle integration (real PostgreSQL)', () => {
  beforeAll(async () => {
    ({ prisma } = await import('../db.js')); ({ createApp } = await import('../app.js')); ({ config } = await import('../config.js'));
    // This deletes only the dedicated test database. Refuse any other target.
    if (!/test/i.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error('TEST_DATABASE_URL must name a dedicated test database');
    await prisma.waitlistOffer.deleteMany(); await prisma.waitlist.deleteMany(); await prisma.bookingSeat.deleteMany(); await prisma.payment.deleteMany(); await prisma.booking.deleteMany(); await prisma.eventSeat.deleteMany(); await prisma.event.deleteMany(); await prisma.seat.deleteMany(); await prisma.venue.deleteMany(); await prisma.user.deleteMany();
    server = createApp().listen(0); await new Promise<void>(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }, 30_000);
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); if (prisma) await prisma.$disconnect(); });

  async function fixture() {
    const [organiser, a, b] = await Promise.all(['ORGANISER', 'CUSTOMER', 'CUSTOMER'].map((role, i) => prisma.user.create({ data: { name: `${role}${i}`, email: `${role}${i}-${Date.now()}@test.local`, passwordHash: 'x', role } })));
    const venue = await prisma.venue.create({ data: { name: `v${Date.now()}`, location: 'test', seats: { create: { row: 'A', number: 6, category: 'VIP' } } }, include: { seats: true } });
    const event = await prisma.event.create({ data: { title: 'test show', description: 'test', type: 'MOVIE', venueId: venue.id, organiserId: organiser.id, startsAt: new Date(Date.now() + 86_400_000), status: 'PUBLISHED', pricing: { VIP: 10_000 }, eventSeats: { create: { seatId: venue.seats[0].id, category: 'VIP', price: 10_000 } } }, include: { eventSeats: true } });
    return { a, b, event, seat: event.eventSeats[0] };
  }

  it('serializes simultaneous holds for one seat', async () => {
    const { a, b, event, seat } = await fixture();
    const [first, second] = await Promise.all([a, b].map(user => request(`/api/events/${event.id}/seats/hold`, { method: 'POST', headers: auth(user), body: JSON.stringify({ seatIds: [seat.id] }) })));
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const stored = await prisma.eventSeat.findUniqueOrThrow({ where: { id: seat.id } });
    expect(stored.status).toBe('HELD'); expect([a.id, b.id]).toContain(stored.heldById);
  });

  it('does not let an old payment confirm or cancel another customer’s hold', async () => {
    const { a, b, event, seat } = await fixture();
    await request(`/api/events/${event.id}/seats/hold`, { method: 'POST', headers: auth(a), body: JSON.stringify({ seatIds: [seat.id] }) });
    const created = await request('/api/bookings', { method: 'POST', headers: auth(a), body: JSON.stringify({ seatIds: [seat.id] }) });
    const payment = created.body.data.payment; const token = new URL(payment.url).searchParams.get('token');
    await prisma.eventSeat.update({ where: { id: seat.id }, data: { status: 'AVAILABLE', heldById: null, holdExpiresAt: null } });
    await request(`/api/events/${event.id}/seats/hold`, { method: 'POST', headers: auth(b), body: JSON.stringify({ seatIds: [seat.id] }) });
    expect((await request(`/api/bookings/payments/${payment.reference}/succeed`, { method: 'POST', body: JSON.stringify({ token }) })).status).toBe(409);
    expect((await request(`/api/bookings/payments/${payment.reference}/cancel`, { method: 'POST', body: JSON.stringify({ token }) })).status).toBe(200);
    const [storedSeat, storedPayment] = await Promise.all([prisma.eventSeat.findUniqueOrThrow({ where: { id: seat.id } }), prisma.payment.findUniqueOrThrow({ where: { reference: payment.reference } })]);
    expect(storedSeat).toMatchObject({ status: 'HELD', heldById: b.id }); expect(storedPayment.status).toBe('CANCELLED');
  });

  it('confirms a valid public payment exactly once', async () => {
    const { a, event, seat } = await fixture();
    await request(`/api/events/${event.id}/seats/hold`, { method: 'POST', headers: auth(a), body: JSON.stringify({ seatIds: [seat.id] }) });
    const created = await request('/api/bookings', { method: 'POST', headers: auth(a), body: JSON.stringify({ seatIds: [seat.id] }) });
    const payment = created.body.data.payment; const token = new URL(payment.url).searchParams.get('token');
    const [one, two] = await Promise.all([1, 2].map(() => request(`/api/bookings/payments/${payment.reference}/succeed`, { method: 'POST', body: JSON.stringify({ token }) })));
    expect([one.status, two.status]).toEqual([200, 200]);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: created.body.data.booking.id }, include: { payment: true, seats: { include: { eventSeat: true } } } });
    expect(booking).toMatchObject({ status: 'CONFIRMED', payment: { status: 'SUCCESSFUL' } }); expect(booking.seats[0].eventSeat.status).toBe('BOOKED');
    expect(booking.qrCode).toContain('/');
  });

  it('keeps payment data private without its action token', async () => {
    const { a, event, seat } = await fixture();
    await request(`/api/events/${event.id}/seats/hold`, { method: 'POST', headers: auth(a), body: JSON.stringify({ seatIds: [seat.id] }) });
    const created = await request('/api/bookings', { method: 'POST', headers: auth(a), body: JSON.stringify({ seatIds: [seat.id] }) });
    const payment = created.body.data.payment;
    expect((await request(`/api/bookings/payments/${payment.reference}`)).status).toBe(404);
    expect((await request(`/api/bookings/payments/${payment.reference}?token=${new URL(payment.url).searchParams.get('token')}`)).status).toBe(200);
    const stored = await prisma.payment.findUniqueOrThrow({ where: { reference: payment.reference } });
    expect(JSON.stringify(stored)).not.toContain(new URL(payment.url).searchParams.get('token'));
  });
});
