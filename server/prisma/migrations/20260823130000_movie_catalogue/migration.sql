CREATE TYPE "MovieStatus" AS ENUM ('UPCOMING', 'NOW_SHOWING', 'ENDED');
CREATE TABLE "Movie" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "posterUrl" TEXT NOT NULL,
  "backdropUrl" TEXT,
  "releaseDate" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "language" TEXT NOT NULL,
  "genres" TEXT[] NOT NULL,
  "certification" TEXT,
  "director" TEXT,
  "cast" TEXT[] NOT NULL,
  "trailerUrl" TEXT,
  "rating" DOUBLE PRECISION,
  "status" "MovieStatus" NOT NULL DEFAULT 'NOW_SHOWING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Movie_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Movie_slug_key" ON "Movie"("slug");
CREATE INDEX "Movie_status_releaseDate_idx" ON "Movie"("status", "releaseDate");
CREATE INDEX "Movie_language_idx" ON "Movie"("language");
ALTER TABLE "Event" ADD COLUMN "movieId" TEXT;
CREATE INDEX "Event_movieId_startsAt_idx" ON "Event"("movieId", "startsAt");
ALTER TABLE "Event" ADD CONSTRAINT "Event_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE SET NULL ON UPDATE CASCADE;
