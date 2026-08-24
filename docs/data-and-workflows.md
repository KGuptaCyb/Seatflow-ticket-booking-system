# Database and workflow notes

## Core tables

`User` owns bookings, temporary holds, events, and waitlist entries. `Venue` owns reusable physical `Seat` records. `Event` points to a venue and creates its own `EventSeat` inventory snapshot. `Booking` and `BookingSeat` record confirmed commercial tickets. `Waitlist` is unique per event/customer/category; `WaitlistOffer` is unique per EventSeat, preventing multiple open offers for one seat.

Important constraints and indexes:

- `Seat @@unique([venueId, row, number])`
- `EventSeat @@unique([eventId, seatId])`, indexed by event/status
- `Booking.reference` and `Booking.qrToken` are unique
- `BookingSeat.eventSeatId` is unique
- `Waitlist @@unique([eventId, userId, category])`, FIFO indexed by event/category/active/created time

## Hold, concurrency, and waitlist rules

1. Hold and confirm requests lock requested EventSeat rows with PostgreSQL `FOR UPDATE`.
2. Confirmation requires a live hold held by the authenticated customer; it then creates the booking and moves seats to `BOOKED` in one transaction.
3. A delayed BullMQ job conditionally expires only the matching overdue hold.
4. Cancellation releases seats and attempts a category-matched FIFO offer.
5. Waitlist allocation locks both the available seat and oldest active queue row. An offer expires through a second delayed job; accept and expiry lock the same offer/seat rows, so only one wins.
6. Socket.IO is notification only. PostgreSQL state is reread/validated for every mutation.

## Expiry recovery and public offers

BullMQ schedules normal hold and offer expiry. The API worker also performs a bounded database reconciliation every minute for expired held seats, making recovery idempotent after delayed-job loss, worker restart, or temporary Redis interruption. New waitlist offers use a 256-bit public action token, but persist only its SHA-256 hash. The migration `20260823150000_secure_waitlist_offer_tokens` expires legacy plaintext-token offers and frees their offered seats; old links deliberately stop working.
