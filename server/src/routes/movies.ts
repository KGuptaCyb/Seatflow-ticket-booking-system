import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../db.js';
import { asyncRoute, ApiError } from '../errors.js';
import { authenticate, authorize } from '../middleware/auth.js';

const r = Router();

const movieStatus = z.enum([
  'UPCOMING',
  'NOW_SHOWING',
  'ENDED',
]);

const movieInput = z.object({
  title: z.string().trim().min(2).max(200),

  slug: z
    .string()
    .trim()
    .min(2)
    .max(200)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must contain only lowercase letters, numbers and hyphens.'
    ),

  description: z
    .string()
    .trim()
    .min(20)
    .max(5000),

  posterUrl: z.string().url(),

  backdropUrl: z
    .string()
    .url()
    .optional()
    .nullable(),

  releaseDate: z
    .string()
    .datetime({ offset: true }),

  durationMinutes: z
    .number()
    .int()
    .positive()
    .max(1000),

  language: z
    .string()
    .trim()
    .min(2)
    .max(100),

  genres: z
    .array(z.string().trim().min(1).max(50))
    .min(1)
    .max(20),

  certification: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable(),

  director: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable(),

  cast: z
    .array(z.string().trim().min(1).max(200))
    .max(100)
    .default([]),

  trailerUrl: z
    .string()
    .url()
    .optional()
    .nullable(),

  rating: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .nullable(),

  status: movieStatus.default('NOW_SHOWING'),
});

const movieUpdate = movieInput.partial().extend({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(200)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must contain only lowercase letters, numbers and hyphens.'
    )
    .optional(),
});

const movieInclude = {
  showings: {
    where: {
      status: 'PUBLISHED' as const,
    },
    include: {
      venue: true,
    },
    orderBy: {
      startsAt: 'asc' as const,
    },
  },
};

const catalogueInclude = {
  showings: {
    where: {
      status: 'PUBLISHED' as const,
      startsAt: {
        gte: new Date(),
      },
    },
    include: {
      venue: true,
    },
    orderBy: {
      startsAt: 'asc' as const,
    },
  },
};

const normaliseGenres = (genres: string[]) =>
  [...new Set(
    genres
      .map((genre) => genre.trim())
      .filter(Boolean)
  )];

const getMovieOrThrow = async (slug: string) => {
  const movie = await prisma.movie.findUnique({
    where: {
      slug,
    },
    include: movieInclude,
  });

  if (!movie) {
    throw new ApiError(404, 'Movie not found');
  }

  return movie;
};

/**
 * GET /movies
 *
 * Public movie catalogue.
 *
 * Supports:
 *   ?q=batman
 *   ?genre=Action
 *   ?language=English
 *   ?status=NOW_SHOWING
 *
 * Only future published showings are returned.
 */
r.get(
  '/',
  asyncRoute(async (req, res) => {
    const q =
      typeof req.query.q === 'string'
        ? req.query.q.trim()
        : '';

    const genre =
      typeof req.query.genre === 'string'
        ? req.query.genre.trim()
        : '';

    const language =
      typeof req.query.language === 'string'
        ? req.query.language.trim()
        : '';

    const status =
      typeof req.query.status === 'string'
        ? req.query.status
        : '';

    const parsedStatus =
      status === 'UPCOMING' ||
      status === 'NOW_SHOWING' ||
      status === 'ENDED'
        ? status
        : undefined;

    const movies = await prisma.movie.findMany({
      where: {
        ...(q
          ? {
              OR: [
                {
                  title: {
                    contains: q,
                    mode: 'insensitive',
                  },
                },
                {
                  description: {
                    contains: q,
                    mode: 'insensitive',
                  },
                },
                {
                  director: {
                    contains: q,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),

        ...(genre
          ? {
              genres: {
                has: genre,
              },
            }
          : {}),

        ...(language
          ? {
              language: {
                equals: language,
                mode: 'insensitive',
              },
            }
          : {}),

        ...(parsedStatus
          ? {
              status: parsedStatus,
            }
          : {}),
      },

      include: catalogueInclude,

      orderBy: [
        {
          status: 'asc',
        },
        {
          releaseDate: 'desc',
        },
        {
          title: 'asc',
        },
      ],
    });

    res.json({
      success: true,
      data: movies,
    });
  })
);

/**
 * GET /movies/:slug
 *
 * Public movie detail page.
 *
 * Returns the movie together with all published showings.
 */
r.get(
  '/:slug',
  asyncRoute(async (req, res) => {
    const slug = String(req.params.slug).trim();

    const movie = await getMovieOrThrow(slug);

    res.json({
      success: true,
      data: movie,
    });
  })
);

/**
 * POST /movies
 *
 * Admin/organiser movie catalogue creation.
 */
r.post(
  '/',
  authenticate,
  authorize('ADMIN', 'ORGANISER'),
  asyncRoute(async (req, res) => {
    const data = movieInput.parse(req.body);

    const genres = normaliseGenres(data.genres);

    const existing = await prisma.movie.findUnique({
      where: {
        slug: data.slug,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new ApiError(
        409,
        'A movie with this slug already exists.'
      );
    }

    const movie = await prisma.movie.create({
      data: {
        title: data.title,
        slug: data.slug,
        description: data.description,
        posterUrl: data.posterUrl,
        backdropUrl: data.backdropUrl ?? null,
        releaseDate: new Date(data.releaseDate),
        durationMinutes: data.durationMinutes,
        language: data.language,
        genres,
        certification: data.certification ?? null,
        director: data.director ?? null,
        cast: data.cast,
        trailerUrl: data.trailerUrl ?? null,
        rating: data.rating ?? null,
        status: data.status,
      },
    });

    res.status(201).json({
      success: true,
      data: movie,
    });
  })
);

/**
 * PATCH /movies/:id
 *
 * Admin/organiser movie catalogue update.
 */
r.patch(
  '/:id',
  authenticate,
  authorize('ADMIN', 'ORGANISER'),
  asyncRoute(async (req, res) => {
    const id = String(req.params.id);

    const data = movieUpdate.parse(req.body);

    const existingMovie = await prisma.movie.findUnique({
      where: {
        id,
      },
      include: {
        showings: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!existingMovie) {
      throw new ApiError(404, 'Movie not found');
    }

    if (
      data.slug &&
      data.slug !== existingMovie.slug
    ) {
      const duplicate = await prisma.movie.findUnique({
        where: {
          slug: data.slug,
        },
        select: {
          id: true,
        },
      });

      if (duplicate && duplicate.id !== id) {
        throw new ApiError(
          409,
          'A movie with this slug already exists.'
        );
      }
    }

    const updateData: Record<string, unknown> = {};

    if (data.title !== undefined) {
      updateData.title = data.title;
    }

    if (data.slug !== undefined) {
      updateData.slug = data.slug;
    }

    if (data.description !== undefined) {
      updateData.description = data.description;
    }

    if (data.posterUrl !== undefined) {
      updateData.posterUrl = data.posterUrl;
    }

    if (data.backdropUrl !== undefined) {
      updateData.backdropUrl =
        data.backdropUrl ?? null;
    }

    if (data.releaseDate !== undefined) {
      updateData.releaseDate =
        new Date(data.releaseDate);
    }

    if (data.durationMinutes !== undefined) {
      updateData.durationMinutes =
        data.durationMinutes;
    }

    if (data.language !== undefined) {
      updateData.language = data.language;
    }

    if (data.genres !== undefined) {
      updateData.genres =
        normaliseGenres(data.genres);
    }

    if (data.certification !== undefined) {
      updateData.certification =
        data.certification ?? null;
    }

    if (data.director !== undefined) {
      updateData.director =
        data.director ?? null;
    }

    if (data.cast !== undefined) {
      updateData.cast = data.cast;
    }

    if (data.trailerUrl !== undefined) {
      updateData.trailerUrl =
        data.trailerUrl ?? null;
    }

    if (data.rating !== undefined) {
      updateData.rating =
        data.rating ?? null;
    }

    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    const movie = await prisma.movie.update({
      where: {
        id,
      },
      data: updateData,
    });

    res.json({
      success: true,
      data: movie,
    });
  })
);

/**
 * DELETE /movies/:id
 *
 * Admin/organiser movie deletion.
 *
 * A movie cannot be deleted once it has showings.
 * This protects historical bookings and tickets.
 */
r.delete(
  '/:id',
  authenticate,
  authorize('ADMIN', 'ORGANISER'),
  asyncRoute(async (req, res) => {
    const id = String(req.params.id);

    const movie = await prisma.movie.findUnique({
      where: {
        id,
      },
      include: {
        _count: {
          select: {
            showings: true,
          },
        },
      },
    });

    if (!movie) {
      throw new ApiError(404, 'Movie not found');
    }

    if (movie._count.showings > 0) {
      throw new ApiError(
        409,
        'This movie cannot be deleted because it already has showings. Mark it as ENDED instead.'
      );
    }

    await prisma.movie.delete({
      where: {
        id,
      },
    });

    res.json({
      success: true,
      data: {
        deleted: true,
        id,
      },
    });
  })
);

export default r;