# 🎟️ Seatflow Ticket Booking System

Seatflow is a full-stack movie and event ticket booking platform designed for high-demand events where seats must be allocated safely under concurrent booking attempts.

The system supports visual seat selection, temporary seat holds, automatic hold expiry, real-time seat availability, role-based authentication, booking cancellation, waitlists, automatic waitlist offers, QR-code tickets, email confirmations, and organiser/admin management.

---

## 🚀 Live Demo

### Frontend — Vercel

https://seatflowticketbookingsystem.vercel.app

### Backend API — Render

https://seatflow-api-b46j.onrender.com

> **Note:** The deployed frontend is hosted on Vercel and the backend API is hosted on Render.

---

# 📌 Problem Statement

High-demand movies and events can sell out within seconds, while abandoned checkouts and last-minute cancellations can leave seats unused.

Seatflow addresses this by providing:

* Visual seat selection
* Temporary seat holds
* Automatic hold expiration
* Real-time seat status updates
* Concurrency-safe booking
* Waitlists for sold-out events
* Automatic seat reassignment after cancellation
* Time-limited waitlist offers
* QR-code ticket generation
* Email booking confirmations
* Booking history and cancellation
* Role-based customer, organiser and admin functionality

---

# ✨ Features

## 👤 Customer

* Register and log in
* Browse available movies/events
* Search and filter events
* View event details
* View a visual seat map
* See seat status:

  * Available
  * Held
  * Booked
* Select one or more seats
* Temporarily hold selected seats
* Complete booking before the hold expires
* Receive a QR-code ticket after confirmation
* View booking history
* Cancel confirmed bookings
* Join a waitlist when an event/category is sold out
* Receive a time-limited booking offer when a waitlisted seat becomes available

---

## 🎬 Organiser

Organisers can:

* Register and log in
* Create movie/event listings
* Specify:

  * Event name
  * Event type
  * Venue
  * Date
  * Time
  * Description
  * Seat-category pricing
* View event booking information
* View booking summaries
* View revenue information per event

---

## 🛠️ Admin

Administrators can manage venue-related configuration, including:

* Venues
* Seat layouts
* Seat categories
* Seat configuration such as Premium and Standard categories

The seat layout is associated with the event/show so that seat-level availability can be tracked independently.

---

# 🪑 Seat Booking

Seatflow uses a seat-level booking model rather than only maintaining a total event capacity.

Each seat can have a status such as:

```text
AVAILABLE
HELD
BOOKED
```

The frontend renders these states as a visual seat map.

This allows customers to understand exactly which seats are available before completing a booking.

---

# ⏱️ Seat Hold & TTL Mechanism

When a customer selects seats during checkout, the system creates a temporary hold.

The hold has a configurable time-to-live (TTL).

The default configuration is designed around a 10-minute checkout window.

Example:

```text
Customer selects seat
        ↓
Seat becomes HELD
        ↓
Hold expiration timestamp is created
        ↓
Customer completes booking
        ↓
Seat becomes BOOKED
```

If checkout is abandoned:

```text
Seat HELD
    ↓
TTL expires
    ↓
Hold is released
    ↓
Seat becomes AVAILABLE
    ↓
Real-time seat status is updated
```

The TTL is configurable through environment variables.

Example:

```env
SEAT_HOLD_TTL_MINUTES=10
PAYMENT_ACTION_TTL_MINUTES=10
WAITLIST_OFFER_TTL_MINUTES=10
```

Background processing is used to handle time-based booking operations and expiry.

---

# 🔐 Concurrency Protection

A major requirement of the system is preventing two customers from successfully holding or booking the same seat at the same time.

Seatflow therefore performs seat availability validation and booking operations on the backend rather than trusting the frontend.

The booking flow is protected using the database/transaction layer and the seat state associated with each show.

Conceptually:

```text
Customer A ──┐
             ├──> Backend booking transaction ──> Seat state
Customer B ──┘
```

If two customers attempt to reserve the same seat simultaneously, only one request can successfully acquire the seat.

The second request receives an appropriate conflict/availability response instead of creating a duplicate booking.

This protects the system from double-booking under concurrent requests.

---

# 🔄 Real-Time Seat Updates

Seat availability is updated in real time using Socket.IO.

When a seat changes state:

```text
AVAILABLE → HELD
HELD → BOOKED
HELD → AVAILABLE
BOOKED → AVAILABLE
```

the frontend can receive the updated state without requiring a full page refresh.

This is particularly important for high-demand events where several customers may be viewing the same seat map simultaneously.

---

# 📋 Waitlist System

When an event or seat category is sold out, customers can join a waitlist for the required seat category.

The waitlist is maintained as a queue.

Example:

```text
Customer A
    ↓
Customer B
    ↓
Customer C
```

When a confirmed booking is cancelled and a seat becomes available:

```text
Cancelled booking
       ↓
Seat becomes available
       ↓
Next eligible waitlisted customer selected
       ↓
Time-limited offer created
       ↓
Customer notified
       ↓
Customer completes booking
```

---

# ⏳ Time-Limited Waitlist Offer

A waitlisted customer does not receive an unlimited reservation.

Instead, the system creates a temporary offer with an expiry time.

Example:

```text
Seat becomes available
        ↓
Customer A receives offer
        ↓
Customer A has limited time to complete booking
        ↓
       ┌───────────────┐
       │               │
   Completes       Does not complete
   booking             │
       │               ↓
       ↓          Offer expires
    BOOKED               │
                        ↓
                 Next waitlisted
                   customer
```

If the customer does not complete the booking within the configured offer TTL, the offer expires and the seat can be offered to the next customer in the queue.

This prevents seats from remaining blocked indefinitely.

---

# 📧 Email Confirmation & QR Tickets

After a successful booking, Seatflow generates a QR-code ticket containing the booking reference.

The booking confirmation is sent through the application's email service.

The QR code represents the booking reference and can be used to identify the confirmed booking.

### Email limitation for the hosted demo

For this project/demo, an **SMTP sandbox environment** is used for email testing instead of a production email domain.

The reason is that sending reliable transactional email to arbitrary personal email addresses in a production environment generally requires a properly configured email provider and a verified sending domain/sender.

Therefore:

```text
Development / Demo
        ↓
SMTP Sandbox
        ↓
Test email delivery

Production
        ↓
Verified domain + production SMTP/email provider
        ↓
Customer personal email
```

The application is structured so that the SMTP configuration can be replaced with a production email provider when a domain and production email service are available.

---

# 🔑 Role-Based Authentication

The application supports three primary roles:

| Role      | Responsibility                                            |
| --------- | --------------------------------------------------------- |
| Customer  | Browse, select seats, book, cancel and manage tickets     |
| Organiser | Create/manage events and view booking/revenue information |
| Admin     | Manage venue and seat configuration                       |

Authentication and authorization are enforced on the backend so that protected operations cannot be performed simply by manipulating frontend UI.

---

# 🏗️ Technology Stack

## Frontend

* React
* TypeScript
* Vite
* Modern responsive UI
* Socket.IO client

## Backend

* Node.js
* Express.js
* TypeScript
* REST API
* JWT-based authentication
* Helmet
* CORS

## Database

* PostgreSQL
* Prisma ORM

## Real-Time Communication

* Socket.IO

## Background Processing

* Redis
* BullMQ

Background jobs support time-based operations such as hold expiry and other asynchronous booking workflows.

## Ticketing

* QR-code generation
* Booking-reference based QR tickets

## Email

* SMTP-based email service
* SMTP sandbox for the current demo

## Deployment

* Vercel — frontend
* Render — backend API

---

# 🗂️ Project Structure

```text
seatflow/
│
├── client/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── ...
│
├── server/
│   ├── src/
│   │   ├── routes/
│   │   ├── app.ts
│   │   ├── config.ts
│   │   ├── index.ts
│   │   ├── realtime.ts
│   │   ├── jobs.ts
│   │   └── ...
│   ├── prisma/
│   ├── package.json
│   └── ...
│
├── docs/
│   └── ...
│
├── .gitignore
├── compose.integration.yml
├── package.json
├── package-lock.json
└── README.md
```

---

# 🗄️ Database Design

The application uses PostgreSQL with Prisma as the ORM.

The database models the main booking concepts:

```text
User
 ├── Customer
 ├── Organiser
 └── Admin

Venue
 └── Seats
      └── Seat Category

Event / Show
 ├── Venue
 ├── Seat Layout
 └── Pricing

Booking
 ├── Customer
 ├── Event
 └── Selected Seats

Seat Hold
 ├── Event
 ├── Seat
 ├── Customer
 └── Expiration Time

Waitlist
 ├── Event
 ├── Seat Category
 └── Customer

Waitlist Offer
 ├── Waitlist Entry
 ├── Seat
 └── Expiration Time
```

The important design principle is that **seat state is maintained per event/show**, allowing the same physical venue to host different events while maintaining independent seat availability.

The Prisma schema in the repository is the source of truth for the exact database fields and relationships.

---

# 🔌 API

The backend exposes REST API route groups for the main application domains.

Current API areas include:

```text
/api/auth
/api/movies
/api/events
/api/venues
/api/bookings
/api/waitlist
```

A basic API health endpoint is also available:

```text
GET /
GET /health
```

The root endpoint returns an API status response, while `/health` can be used for deployment/availability checks.

---

# 🔐 Environment Variables

Create a `.env` file for local development.

Example:

```env
PORT=4000
HOST=0.0.0.0

DATABASE_URL=your_postgresql_connection_string

JWT_SECRET=your_secure_jwt_secret

CLIENT_URL=http://localhost:5173

DEV_CLIENT_URLS=http://localhost:5173

PUBLIC_FRONTEND_URL=http://localhost:5173

REDIS_URL=redis://localhost:6379

SEAT_HOLD_TTL_MINUTES=10
PAYMENT_ACTION_TTL_MINUTES=10
WAITLIST_OFFER_TTL_MINUTES=10

SMTP_HOST=your_smtp_host
SMTP_PORT=2525
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
EMAIL_FROM=your_sender_email
```

> Never commit real credentials, database passwords, JWT secrets, SMTP passwords, or API keys to GitHub.

---

# 💻 Local Setup

## 1. Clone the repository

```bash
git clone https://github.com/KGuptaCyb/Seatflow-ticket-booking-system.git
cd Seatflow-ticket-booking-system
```

## 2. Install dependencies

```bash
npm install
```

Install dependencies for the client and server if required by the project structure.

```bash
cd client
npm install
```

```bash
cd ../server
npm install
```

## 3. Configure environment variables

Create the appropriate `.env` files based on the environment variables described above.

## 4. Start required infrastructure

Redis and PostgreSQL must be available for the complete booking workflow.

The repository also contains:

```text
compose.integration.yml
```

which can be used for the project's integration/infrastructure setup where applicable.

## 5. Start the backend

```bash
cd server
npm run dev
```

The backend runs on the configured port, normally:

```text
http://localhost:4000
```

## 6. Start the frontend

```bash
cd client
npm run dev
```

The Vite development frontend normally runs on:

```text
http://localhost:5173
```

---

# 🌐 Deployment

## Frontend

Hosted using Vercel:

https://seatflowticketbookingsystem.vercel.app

## Backend

Hosted using Render:

https://seatflow-api-b46j.onrender.com

The frontend communicates with the deployed backend API through the configured production client/API environment variables.

---

# 🧠 System Design Write-Up

## 1. Seat Hold and TTL

When a customer selects seats, the backend creates a temporary seat hold with an expiration timestamp. The TTL is configurable, with the demo configured around a 10-minute checkout window. Held seats are unavailable to other customers during the hold period. Background processing checks for expired holds and releases them, returning the seats to the available state.

## 2. Concurrency Prevention

Seat allocation is performed on the backend and protected through database-level booking/transaction logic. Availability is checked as part of the reservation operation rather than relying on the frontend. This prevents two simultaneous customers from successfully acquiring the same seat. The database becomes the authoritative source for seat state.

## 3. Real-Time Seat State

Socket.IO broadcasts seat-state changes so customers viewing the same event can receive updates without refreshing the page. This keeps the visual seat map synchronized as seats move between available, held and booked states.

## 4. Waitlist Auto-Assignment

When an event or seat category is sold out, customers can join a FIFO waitlist. When a confirmed booking is cancelled, the released seat is matched with the next eligible waitlisted customer for that category.

## 5. Time-Limited Offer

The selected waitlisted customer receives a temporary offer with an expiration time. If the customer completes the booking within that period, the seat becomes booked. If the customer does not respond before the offer expires, the system releases the offer and proceeds to the next waitlisted customer. This prevents cancelled seats from remaining unused.

## 6. QR Ticket and Email

Once booking is successfully confirmed, a QR code is generated using the booking reference. The confirmation is sent through the configured SMTP service. The current hosted demonstration uses an SMTP sandbox because production transactional email to personal addresses requires a properly configured email provider and verified sending domain.

---

# 📊 Evaluation Requirements Coverage

| Requirement                   | Seatflow                |
| ----------------------------- | ----------------------- |
| Backend API                   | ✅ Express/Node.js API   |
| Frontend                      | ✅ React/Vite            |
| Database                      | ✅ PostgreSQL + Prisma   |
| Customer authentication       | ✅                       |
| Organiser authentication      | ✅                       |
| Admin role                    | ✅                       |
| Venue management              | ✅                       |
| Seat categories               | ✅                       |
| Event/movie listings          | ✅                       |
| Event filtering/browsing      | ✅                       |
| Visual seat map               | ✅                       |
| Available/Held/Booked status  | ✅                       |
| Configurable seat hold TTL    | ✅                       |
| Automatic hold release        | ✅                       |
| Concurrency protection        | ✅                       |
| Real-time seat updates        | ✅ Socket.IO             |
| Booking cancellation          | ✅                       |
| Booking history               | ✅                       |
| Waitlist by seat category     | ✅                       |
| Automatic waitlist assignment | ✅                       |
| Time-limited waitlist offer   | ✅                       |
| QR-code ticket                | ✅                       |
| Email confirmation            | ✅ SMTP sandbox for demo |
| Organiser booking summary     | ✅                       |
| Organiser revenue information | ✅                       |
| Hosted frontend               | ✅ Vercel                |
| Hosted backend                | ✅ Render                |
| Setup documentation           | ✅                       |
| Environment configuration     | ✅                       |
| API documentation             | ✅                       |
| Database documentation        | ✅                       |
| Seat-hold explanation         | ✅                       |
| Waitlist explanation          | ✅                       |
| System design write-up        | ✅                       |

---

# ⚠️ Production Considerations

The current project is designed as a functional demonstration of the required ticket-booking workflows.

For a production deployment, the following could be further hardened:

* Production email provider with verified domain
* Strong production secrets and credential rotation
* Additional monitoring and alerting
* Rate limiting
* More extensive automated tests
* Payment gateway integration/hardening
* Production-grade job/worker scaling
* Additional database indexes and performance tuning
* Observability and structured logging
* Custom production domain

These considerations do not change the core booking architecture demonstrated by Seatflow.

---

# 📦 Deliverables

This repository contains the complete source code for the Seatflow ticket booking system.

### Source Code

https://github.com/KGuptaCyb/Seatflow-ticket-booking-system

### Hosted Frontend

https://seatflowticketbookingsystem.vercel.app

### Hosted Backend

https://seatflow-api-b46j.onrender.com

### Documentation

* Setup guide
* Environment configuration
* API overview
* Database design
* Seat hold and TTL mechanism
* Concurrency protection
* Real-time seat updates
* Waitlist logic
* Time-limited waitlist offers
* QR ticket generation
* Email delivery limitation
* System design write-up

---

# 👩‍💻 Project

**Seatflow Ticket Booking System**

A full-stack ticket booking platform focused on safe seat allocation, temporary holds, real-time availability, concurrency protection and automated waitlist management.
manual integration checklist in [docs/verification-checklist.md](docs/verification-checklist.md) against the deployed environment. Architecture, data model, API reference, deployment steps, and the under-800-word design write-up are in [docs](docs/).
