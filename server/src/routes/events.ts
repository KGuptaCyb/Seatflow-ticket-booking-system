import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../db.js';
import { asyncRoute, ApiError } from '../errors.js';
import {
  authenticate,
  authorize,
  AuthRequest,
} from '../middleware/auth.js';
import { scheduleHold } from '../jobs.js';
import { config } from '../config.js';
import { eventChanged } from '../realtime.js';

const r = Router();

const eventInput = z.object({
  title: z.string().min(3),
  description: z.string(),
  type: z.enum(['MOVIE', 'CONCERT']),
  movieId: z.string().optional(),
  venueId: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  pricing: z.record(z.string(), z.number().int().positive()),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});

const eventUpdate = eventInput
  .omit({ venueId: true })
  .partial()
  .extend({
    status: z
      .enum(['DRAFT', 'PUBLISHED', 'CANCELLED'])
      .optional(),
  });

const ownEvent = async (
  id: string,
  user: NonNullable<AuthRequest['user']>,
) => {
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      venue: true,
      movie: true,
    },
  });

  if (!event) {
    throw new ApiError(404, 'Event not found');
  }

  if (
    user.role !== 'ADMIN' &&
    event.organiserId !== user.id
  ) {
    throw new ApiError(403, 'Not your event');
  }

  return event;
};

/*
 * Validate the relationship between an event and a movie.
 *
 * MOVIE events:
 *   - must have a valid movieId
 *
 * CONCERT events:
 *   - must not have movieId
 */
const validateMovieLink = async (
  type: 'MOVIE' | 'CONCERT',
  movieId?: string,
) => {
  if (type === 'MOVIE' && !movieId) {
    throw new ApiError(
      400,
      'Movie events must have a movieId',
    );
  }

  if (type === 'CONCERT' && movieId) {
    throw new ApiError(
      400,
      'Concert events cannot be linked to a movie',
    );
  }

  if (movieId) {
    const movie = await prisma.movie.findUnique({
      where: {
        id: movieId,
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (!movie) {
      throw new ApiError(
        404,
        'Movie not found',
      );
    }
  }
};

const validatePricing = async (
  venueId: string,
  pricing: Record<string, number>,
) => {
  const categories = [
    ...new Set(
      (
        await prisma.seat.findMany({
          where: {
            venueId,
          },
          select: {
            category: true,
          },
        })
      ).map((seat) => seat.category),
    ),
  ];

  if (!categories.length) {
    throw new ApiError(
      400,
      'Venue has no seat categories',
    );
  }

  if (
    categories.some(
      (category) =>
        !Number.isInteger(pricing[category]) ||
        pricing[category] <= 0,
    ) ||
    Object.keys(pricing).some(
      (category) =>
        !categories.includes(category),
    )
  ) {
    throw new ApiError(
      400,
      'Pricing must provide a positive price for every venue category',
    );
  }
};

/*
 * IMPORTANT:
 *
 * Keep static/specific routes before /:id.
 *
 * Otherwise Express can interpret:
 *
 *   /mine/list
 *
 * as:
 *
 *   /:id
 *
 * with id = "mine".
 */

/* ============================================================
 * PUBLIC EVENT LIST
 * ============================================================ */

r.get(
  '/',
  asyncRoute(async (req, res) => {
    const q = String(
      req.query.q || '',
    );

    const type =
      typeof req.query.type === 'string'
        ? req.query.type
        : undefined;

    const events =
      await prisma.event.findMany({
        where: {
          status: 'PUBLISHED',

          ...(type === 'MOVIE' ||
          type === 'CONCERT'
            ? { type }
            : {}),

          ...(q
            ? {
                title: {
                  contains: q,
                  mode: 'insensitive',
                },
              }
            : {}),
        },

        include: {
          movie: true,
          venue: true,

          _count: {
            select: {
              eventSeats: true,
            },
          },
        },

        orderBy: {
          startsAt: 'asc',
        },
      });

    res.json({
      success: true,
      data: events,
    });
  }),
);

/* ============================================================
 * ORGANISER / ADMIN EVENT LIST
 * ============================================================ */

r.get(
  '/mine/list',
  authenticate,
  authorize('ORGANISER', 'ADMIN'),
  asyncRoute(async (req: AuthRequest, res) => {
    const events =
      await prisma.event.findMany({
        where:
          req.user!.role === 'ADMIN'
            ? {}
            : {
                organiserId:
                  req.user!.id,
              },

        include: {
          movie: true,
          venue: true,

          bookings: {
            where: {
              status: 'CONFIRMED',
            },

            select: {
              total: true,
              subtotal: true,
              convenienceFee: true,
              tax: true,
            },
          },

          _count: {
            select: {
              bookings: true,
            },
          },
        },

        orderBy: {
          startsAt: 'desc',
        },
      });

    res.json({
      success: true,

      data: events.map(
        (event) => ({
          id: event.id,
          title: event.title,
          description:
            event.description,
          type: event.type,
          movieId:
            event.movieId,
          movie: event.movie,
          status: event.status,
          startsAt:
            event.startsAt,
          endsAt:
            event.endsAt,
          venue: event.venue,

          bookingCount:
            event.bookings.length,

          revenue:
            event.bookings.reduce(
              (
                sum,
                booking,
              ) =>
                sum +
                booking.total,
              0,
            ),
        }),
      ),
    });
  }),
);

/* ============================================================
 * EVENT SEATS
 * ============================================================ */

r.get(
  '/:id/seats',
  asyncRoute(async (req, res) => {
    const seats =
      await prisma.eventSeat.findMany({
        where: {
          eventId:
            String(req.params.id),
        },

        include: {
          seat: true,
        },

        orderBy: {
          seat: {
            row: 'asc',
          },
        },
      });

    res.json({
      success: true,
      data: seats,
    });
  }),
);

/* ============================================================
 * ORGANISER / ADMIN EVENT MANAGEMENT
 * ============================================================ */

r.get(
  '/:id/manage',
  authenticate,
  authorize('ORGANISER', 'ADMIN'),
  asyncRoute(async (req: AuthRequest, res) => {
    const event =
      await ownEvent(
        String(req.params.id),
        req.user!,
      );

    const details =
      await prisma.event.findUniqueOrThrow({
        where: {
          id: event.id,
        },

        include: {
          movie: true,

          venue: {
            include: {
              seats: true,
            },
          },

          eventSeats: {
            include: {
              seat: true,
            },
          },

          bookings: {
            where: {
              status: 'CONFIRMED',
            },

            select: {
              total: true,
              subtotal: true,
              convenienceFee: true,
              tax: true,
            },
          },

          _count: {
            select: {
              bookings: true,
            },
          },
        },
      });

    res.json({
      success: true,
      data: details,
    });
  }),
);

/* ============================================================
 * ORGANISER / ADMIN EVENT SUMMARY
 * ============================================================ */

r.get(
  '/:id/summary',
  authenticate,
  authorize('ORGANISER', 'ADMIN'),
  asyncRoute(async (req: AuthRequest, res) => {
    const id =
      String(req.params.id);

    const event =
      await prisma.event.findUnique({
        where: {
          id,
        },

        include: {
          movie: true,

          _count: {
            select: {
              eventSeats: true,
            },
          },

          bookings: {
            where: {
              status: 'CONFIRMED',
            },

            select: {
              total: true,
            },
          },
        },
      });

    if (!event) {
      throw new ApiError(
        404,
        'Event not found',
      );
    }

    if (
      req.user!.role !== 'ADMIN' &&
      event.organiserId !==
        req.user!.id
    ) {
      throw new ApiError(
        403,
        'Not your event',
      );
    }

    const seats =
      await prisma.eventSeat.groupBy({
        by: ['status'],

        where: {
          eventId: id,
        },

        _count: {
          _all: true,
        },
      });

    const confirmed =
      event.bookings;

    res.json({
      success: true,

      data: {
        eventId: id,
        title: event.title,
        type: event.type,
        movie: event.movie,

        totalSeats:
          event._count.eventSeats,

        bookingCount:
          confirmed.length,

        revenue:
          confirmed.reduce(
            (sum, booking) =>
              sum + booking.total,
            0,
          ),

        seats:
          Object.fromEntries(
            seats.map(
              (seat) => [
                seat.status,
                seat._count
                  ._all,
              ],
            ),
          ),
      },
    });
  }),
);

/* ============================================================
 * PUBLIC SINGLE EVENT
 * ============================================================ */

r.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const event =
      await prisma.event.findUnique({
        where: {
          id: String(
            req.params.id,
          ),
        },

        include: {
          movie: true,

          venue: true,

          organiser: {
            select: {
              name: true,
            },
          },

          eventSeats: {
            include: {
              seat: true,
            },
          },
        },
      });

    if (!event) {
      throw new ApiError(
        404,
        'Event not found',
      );
    }

    /*
     * Do not expose unpublished events
     * through the public event endpoint.
     *
     * Organisers/admins can still access
     * them through /manage.
     */
    if (
      event.status !==
        'PUBLISHED'
    ) {
      throw new ApiError(
        404,
        'Event not found',
      );
    }

    res.json({
      success: true,
      data: event,
    });
  }),
);

/* ============================================================
 * CREATE EVENT
 * ============================================================ */

r.post(
  '/',
  authenticate,
  authorize('ORGANISER', 'ADMIN'),
  asyncRoute(async (req: AuthRequest, res) => {
    const d =
      eventInput.parse(
        req.body,
      );

    /*
     * Validate movie relationship
     * before creating the event.
     */
    await validateMovieLink(
      d.type,
      d.movieId,
    );

    const venue =
      await prisma.venue.findUnique({
        where: {
          id: d.venueId,
        },

        include: {
          seats: true,
        },
      });

    if (!venue) {
      throw new ApiError(
        404,
        'Venue not found',
      );
    }

    await validatePricing(
      venue.id,
      d.pricing,
    );

    const event =
      await prisma.$transaction(
        async (tx) => {
          const created =
            await tx.event.create({
              data: {
                title:
                  d.title,

                description:
                  d.description,

                type:
                  d.type,

                movieId:
                  d.movieId ||
                  null,

                venueId:
                  d.venueId,

                startsAt:
                  new Date(
                    d.startsAt,
                  ),

                endsAt:
                  d.endsAt
                    ? new Date(
                        d.endsAt,
                      )
                    : null,

                pricing:
                  d.pricing,

                status:
                  d.status,

                organiserId:
                  req.user!.id,
              },

              include: {
                movie: true,
                venue: true,
              },
            });

          await tx.eventSeat.createMany({
            data:
              venue.seats.map(
                (seat) => ({
                  eventId:
                    created.id,

                  seatId:
                    seat.id,

                  category:
                    seat.category,

                  price:
                    d.pricing[
                      seat.category
                    ],
                }),
              ),
          });

          return created;
        },
      );

    res.status(201).json({
      success: true,
      data: event,
    });
  }),
);

/* ============================================================
 * UPDATE EVENT
 * ============================================================ */

r.patch(
  '/:id',
  authenticate,
  authorize('ORGANISER', 'ADMIN'),
  asyncRoute(async (req: AuthRequest, res) => {
    const event =
      await ownEvent(
        String(req.params.id),
        req.user!,
      );

    const d =
      eventUpdate.parse(
        req.body,
      );

    /*
     * Work out the final movie
     * relationship after the update.
     */
    const finalType =
      d.type ??
      event.type;

    const finalMovieId =
      d.movieId !== undefined
        ? d.movieId
        : event.movieId ??
          undefined;

    await validateMovieLink(
      finalType,
      finalMovieId,
    );

    if (d.pricing) {
      await validatePricing(
        event.venueId,
        d.pricing,
      );
    }

    const updated =
      await prisma.$transaction(
        async (tx) => {
          const result =
            await tx.event.update({
              where: {
                id: event.id,
              },

              data: {
                title:
                  d.title,

                description:
                  d.description,

                type:
                  d.type,

                movieId:
                  d.movieId !==
                  undefined
                    ? d.movieId ||
                      null
                    : undefined,

                startsAt:
                  d.startsAt
                    ? new Date(
                        d.startsAt,
                      )
                    : undefined,

                endsAt:
                  d.endsAt
                    ? new Date(
                        d.endsAt,
                      )
                    : undefined,

                pricing:
                  d.pricing,

                status:
                  d.status,
              },

              include: {
                movie: true,
                venue: true,
              },
            });

          /*
           * If pricing changes, update
           * all seats that have not
           * already been booked.
           */
          if (d.pricing) {
            for (const [
              category,
              price,
            ] of Object.entries(
              d.pricing,
            )) {
              await tx.eventSeat.updateMany({
                where: {
                  eventId:
                    event.id,

                  category,

                  status: {
                    in: [
                      'AVAILABLE',
                      'HELD',
                      'OFFERED',
                    ],
                  },
                },

                data: {
                  price,
                },
              });
            }
          }

          return result;
        },
      );

    res.json({
      success: true,
      data: updated,
    });
  }),
);

/* ============================================================
 * CHANGE EVENT STATUS
 * ============================================================ */

r.post(
  '/:id/status',
  authenticate,
  authorize('ORGANISER', 'ADMIN'),
  asyncRoute(async (req: AuthRequest, res) => {
    const event =
      await ownEvent(
        String(req.params.id),
        req.user!,
      );

    const status =
      z
        .object({
          status: z.enum([
            'DRAFT',
            'PUBLISHED',
            'CANCELLED',
          ]),
        })
        .parse(req.body)
        .status;

    /*
     * Prevent publishing an invalid
     * movie event.
     */
    if (
      status === 'PUBLISHED'
    ) {
      await validateMovieLink(
        event.type,
        event.movieId ??
          undefined,
      );
    }

    const updated =
      await prisma.event.update({
        where: {
          id: event.id,
        },

        data: {
          status,
        },

        include: {
          movie: true,
          venue: true,
        },
      });

    /*
     * Let connected clients know
     * that the event changed.
     */
    eventChanged(
      event.id,
      [],
    );

    res.json({
      success: true,
      data: updated,
    });
  }),
);

/* ============================================================
 * HOLD SEATS
 * ============================================================ */

r.post(
  '/:id/seats/hold',
  authenticate,
  authorize('CUSTOMER'),
  asyncRoute(async (req: AuthRequest, res) => {
    const eventId =
      String(req.params.id);

    const requested =
      z
        .object({
          seatIds: z
            .array(
              z.string(),
            )
            .min(1)
            .max(10),
        })
        .parse(req.body)
        .seatIds;

    const ids = [
      ...new Set(
        requested,
      ),
    ];

    const expires =
      new Date(
        Date.now() +
          config.holdMs,
      );

    if (
      ids.length !==
      requested.length
    ) {
      throw new ApiError(
        400,
        'Seat IDs must be unique',
      );
    }

    const held =
      await prisma.$transaction(
        async (tx) => {
          const event =
            await tx.event.findUnique({
              where: {
                id: eventId,
              },

              select: {
                status: true,
              },
            });

          if (
            !event ||
            event.status !==
              'PUBLISHED'
          ) {
            throw new ApiError(
              409,
              'This show is not available for booking',
            );
          }

          const rows =
            await tx.$queryRaw<
              {
                id: string;
                status: string;
                holdExpiresAt:
                  | Date
                  | null;
              }[]
            >`
              SELECT
                id,
                status,
                "holdExpiresAt"
              FROM "EventSeat"
              WHERE id = ANY(${ids}::text[])
                AND "eventId" = ${eventId}
              FOR UPDATE
            `;

          if (
            rows.length !==
              ids.length ||
            rows.some(
              (seat) =>
                seat.status !==
                  'AVAILABLE' &&
                !(
                  seat.status ===
                    'HELD' &&
                  seat.holdExpiresAt &&
                  seat.holdExpiresAt <
                    new Date()
                ),
            )
          ) {
            throw new ApiError(
              409,
              'One or more seats are no longer available',
            );
          }

          await tx.eventSeat.updateMany({
            where: {
              id: {
                in: ids,
              },
            },

            data: {
              status:
                'HELD',

              heldById:
                req.user!.id,

              holdExpiresAt:
                expires,
            },
          });

          return tx.eventSeat.findMany({
            where: {
              id: {
                in: ids,
              },
            },

            include: {
              seat: true,
            },
          });
        },
      );

    await Promise.all(
      held.map(
        (seat) =>
          scheduleHold(
            seat.id,
            expires,
          ),
      ),
    );

    eventChanged(
      eventId,
      held.map(
        (seat) => ({
          id: seat.id,
          status:
            seat.status,
          holdExpiresAt:
            expires,
        }),
      ),
    );

    res.json({
      success: true,

      data: {
        seats: held,
        expiresAt:
          expires,
      },
    });
  }),
);

/* ============================================================
 * RELEASE HELD SEATS
 * ============================================================ */

r.post(
  '/:id/seats/release',
  authenticate,
  asyncRoute(async (req: AuthRequest, res) => {
    const eventId =
      String(req.params.id);

    const ids =
      z
        .object({
          seatIds: z
            .array(
              z.string(),
            )
            .min(1),
        })
        .parse(req.body)
        .seatIds;

    const updated =
      await prisma.eventSeat.updateMany({
        where: {
          id: {
            in: ids,
          },

          eventId,

          status: 'HELD',

          heldById:
            req.user!.id,
        },

        data: {
          status:
            'AVAILABLE',

          heldById:
            null,

          holdExpiresAt:
            null,
        },
      });

    eventChanged(
      eventId,
      ids.map(
        (id) => ({
          id,
          status:
            'AVAILABLE',
        }),
      ),
    );

    res.json({
      success: true,

      data: {
        released:
          updated.count,
      },
    });
  }),
);

export default r;

