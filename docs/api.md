# API reference

All API responses use `{ success: true, data }`; errors use `{ success: false, message }`. Protected endpoints require `Authorization: Bearer <JWT>`.

| Method | Endpoint | Role | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Public | Register customer/organiser |
| POST | `/api/auth/login` | Public | Sign in |
| GET | `/api/auth/me` | Any signed-in | Current user |
| GET | `/api/events` | Public | Published event discovery |
| GET | `/api/events/:id` | Public | Event detail |
| GET | `/api/events/:id/seats` | Public | Current seat map |
| POST | `/api/events/:id/seats/hold` | Customer | Hold up to 10 available seats |
| POST | `/api/events/:id/seats/release` | Signed-in | Release caller’s holds |
| POST | `/api/events/:id/waitlist` | Customer | Join/reactivate category queue |
| GET | `/api/events/:id/waitlist/status` | Customer | Caller’s offers for the event |
| POST | `/api/waitlist/offers/:token/accept` | Customer | Convert offer to a hold |
| POST | `/api/bookings` | Customer | Confirm caller-owned held seats |
| GET | `/api/bookings` | Customer | Booking history with QR data URL |
| POST | `/api/bookings/:id/cancel` | Booking owner | Cancel and release seats |
| POST | `/api/venues` | Admin | Create venue and seat layout |
| GET | `/api/venues` | Public | List venues |
| POST | `/api/events` | Organiser/Admin | Create event from venue layout |
| GET | `/api/events/mine/list` | Organiser/Admin | List only the caller's managed events with confirmed-booking revenue |
| GET | `/api/events/:id/manage` | Owning organiser/Admin | Private event, venue, seat, and confirmed-booking details |
| PATCH | `/api/events/:id` | Owning organiser/Admin | Update title, description, show time, pricing, or status |
| POST | `/api/events/:id/status` | Owning organiser/Admin | Set `DRAFT`, `PUBLISHED`, or `CANCELLED` |
| GET | `/api/events/:id/summary` | Owning organiser/Admin | Booking, revenue, and seat summary |

`POST /api/events/:id/seats/hold` body: `{ "seatIds": ["..."] }`. `POST /api/bookings` uses the same shape. Event creation accepts `title`, `description`, `type`, `venueId`, `startsAt`, optional `endsAt`, `pricing`, and `status`.

Organiser pricing is an object of every category in the selected venue, with positive integer paise values, for example `{ "VIP": 50000, "Premium": 35000, "Standard": 20000 }`. Unknown, missing, zero, or negative categories are rejected with `400`. Updating an event changes only current `EventSeat` prices; `BookingSeat.price` and historical totals remain unchanged. A cancelled or draft event rejects new seat holds with `409`.
