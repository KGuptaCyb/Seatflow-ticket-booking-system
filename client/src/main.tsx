import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { io } from 'socket.io-client';
import { api, get } from './lib/api';
import './style.css';

type Event = {
  id: string;
  title: string;
  description: string;
  type: string;
  startsAt: string;
  venue: {
    name: string;
    location: string;
  };
};

type Seat = {
  id: string;
  status: string;
  price: number;
  category: string;
  holdExpiresAt?: string;
  seat: {
    row: string;
    number: number;
  };
};

type Movie = {
  id?: string;
  slug: string;
  title: string;
  description?: string;
  posterUrl?: string;
  backdropUrl?: string;
  genres?: string[];
  language?: string;
  durationMinutes?: number;
  certification?: string;
  director?: string;
  rating?: number;
  status?: string;
  showings?: any[];
};

type VerificationTicket = {
  valid: boolean;
  reference: string;
  status: string;
  event: {
    title: string;
    startsAt: string;
    venue: string;
    location: string;
  };
  seats: Array<{
    row: string;
    number: number;
    category: string;
  }>;
};

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n / 100);

const movieStatusLabel = (status?: string) => {
  if (!status) return '';

  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getMovieArray = (response: any): Movie[] => {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.movies)) {
    return response.movies;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.data?.movies)) {
    return response.data.movies;
  }

  return [];
};

function Nav() {
  const nav = useNavigate();
  const role = localStorage.getItem('role');

  const logout = () => {
    localStorage.clear();
    nav('/');
  };

  return (
    <header>
      <Link className="brand" to="/">
        seatflow
      </Link>

      <nav>
        <Link to="/events">Discover</Link>

        <Link to="/movies">Movies</Link>

        {localStorage.token ? (
          <>
            {role === 'CUSTOMER' ? (
              <Link to="/bookings">My tickets</Link>
            ) : role === 'ORGANISER' ? (
              <Link to="/organiser">My events</Link>
            ) : (
              <Link to="/events">Manage events</Link>
            )}

            <button onClick={logout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Sign in</Link>

            <Link className="pill" to="/register">
              Get started
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

function Home() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">
          LIVE EXPERIENCES, BEAUTIFULLY SIMPLE
        </p>

        <h1>
          Your next great night
          <br />
          starts right here.
        </h1>

        <p>
          Movies and concerts, with seat selection that feels effortless.
        </p>

        <div className="heroActions">
          <Link className="cta" to="/movies">
            Browse movies →
          </Link>

          <Link className="secondaryButton" to="/events">
            Browse all events
          </Link>
        </div>
      </section>

      <section className="features">
        <div>
          ◉
          <b>Live availability</b>
          <span>Seats update instantly</span>
        </div>

        <div>
          ▣
          <b>Secure booking</b>
          <span>Protected timed holds</span>
        </div>

        <div>
          ◇
          <b>Instant tickets</b>
          <span>QR tickets by email</span>
        </div>
      </section>
    </main>
  );
}

function Events() {
  const [events, setEvents] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();

    if (q) params.set('q', q);
    if (type) params.set('type', type);

    get<any[]>(`/events?${params.toString()}`)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [q, type]);

  return (
    <main>
      <div className="pageHead">
        <p className="eyebrow">
          DISCOVER
        </p>

        <h2>
          Find your next experience
        </h2>

        <input
          placeholder="Search events"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select
          aria-label="Event type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All events</option>
          <option value="MOVIE">Movies</option>
          <option value="CONCERT">Concerts</option>
        </select>
      </div>

      <div className="cards">
        {events.map((event) => (
          <Link
            className="card"
            to={`/events/${event.id}`}
            key={event.id}
          >
            <span className="badge">
              {event.type}
            </span>

            <h3>
              {event.title}
            </h3>

            <p>
              {event.venue?.name}
              {event.venue?.location
                ? ` · ${event.venue.location}`
                : ''}
            </p>

            <p>
              {new Date(event.startsAt).toLocaleString()}
            </p>

            <p>
              {event.description}
            </p>

            <b>
              {event._count?.eventSeats ?? 0} seats
              {' · '}
              View seats →
            </b>
          </Link>
        ))}

        {!events.length && (
          <p>
            No published events yet.
          </p>
        )}
      </div>
    </main>
  );
}

function MovieCatalogue() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadMovies = async () => {
      try {
        setLoading(true);
        setError('');

        const params = new URLSearchParams();

        if (q.trim()) {
          params.set('q', q.trim());
        }

        if (genre) {
          params.set('genre', genre);
        }

        if (status) {
          params.set('status', status);
        }

        const query = params.toString();
        const response = await get<any>(
          query ? `/movies?${query}` : '/movies'
        );

        if (!mounted) {
          return;
        }

        setMovies(getMovieArray(response));
      } catch (err: any) {
        if (!mounted) {
          return;
        }

        setMovies([]);
        setError(
          err.response?.data?.message ||
            'Could not load the movie catalogue.'
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadMovies();

    return () => {
      mounted = false;
    };
  }, [q, genre, status]);

  const genres = useMemo(() => {
    const values = new Set<string>();

    movies.forEach((movie) => {
      (movie.genres || []).forEach((item) => {
        if (item) {
          values.add(item);
        }
      });
    });

    return Array.from(values).sort();
  }, [movies]);

  return (
    <main className="movieCatalogue">
      <div className="pageHead movieCatalogueHead">
        <p className="eyebrow">
          MOVIE CATALOGUE
        </p>

        <h2>
          Find your next movie night
        </h2>

        <p>
          Browse movies, explore details and choose a showtime.
        </p>

        <div className="catalogueFilters">
          <input
            placeholder="Search movies"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search movies"
          />

          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            aria-label="Filter by genre"
          >
            <option value="">
              All genres
            </option>

            {genres.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by movie status"
          >
            <option value="">
              All movies
            </option>

            <option value="NOW_SHOWING">
              Now Showing
            </option>

            <option value="COMING_SOON">
              Coming Soon
            </option>
          </select>
        </div>
      </div>

      {loading && (
        <section className="movieCatalogueState">
          <p>
            Loading movies…
          </p>
        </section>
      )}

      {!loading && error && (
        <section className="movieCatalogueState">
          <p>
            {error}
          </p>
        </section>
      )}

      {!loading && !error && (
        <div className="movieGrid">
          {movies.map((movie) => (
            <Link
              className="movieCard"
              to={`/movies/${movie.slug}`}
              key={movie.id || movie.slug}
            >
              <div className="moviePoster">
                {movie.posterUrl ? (
                  <img
                    src={movie.posterUrl}
                    alt={`${movie.title} poster`}
                    loading="lazy"
                  />
                ) : (
                  <div className="moviePosterPlaceholder">
                    <span>
                      {movie.title?.charAt(0) || 'M'}
                    </span>
                  </div>
                )}

                {movie.status && (
                  <span className="movieStatus">
                    {movieStatusLabel(movie.status)}
                  </span>
                )}
              </div>

              <div className="movieCardBody">
                <h3>
                  {movie.title}
                </h3>

                <p className="movieMeta">
                  {(movie.genres || []).slice(0, 2).join(' · ')}
                </p>

                <p className="movieMeta">
                  {movie.language || 'Language TBA'}
                  {movie.durationMinutes
                    ? ` · ${movie.durationMinutes} min`
                    : ''}
                  {movie.certification
                    ? ` · ${movie.certification}`
                    : ''}
                </p>

                <div className="movieCardFooter">
                  <span>
                    {movie.rating != null
                      ? `★ ${movie.rating.toFixed(1)}`
                      : 'Rating TBA'}
                  </span>

                  <b>
                    View →
                  </b>
                </div>
              </div>
            </Link>
          ))}

          {!movies.length && (
            <section className="movieCatalogueState">
              <h3>
                No movies found
              </h3>

              <p>
                Try changing your search or filters.
              </p>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function MoviePage() {
  const { slug = '' } = useParams();

  const [movie, setMovie] =
    useState<Movie | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);

        const data = await get<Movie>(
          `/movies/${encodeURIComponent(slug)}`
        );

        if (mounted) {
          setMovie(data);
        }
      } catch {
        if (mounted) {
          setMovie(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <main>
        Loading movie…
      </main>
    );
  }

  if (!movie) {
    return (
      <main className="movieCatalogueState">
        <h2>
          Movie not found
        </h2>

        <p>
          The movie you requested could not be found.
        </p>

        <Link className="cta" to="/movies">
          Back to movies
        </Link>
      </main>
    );
  }

  const genres = movie.genres || [];
  const showings = movie.showings || [];

  return (
    <main className="movieDetail">
      <section
        className="movieHero"
        style={{
          backgroundImage: `linear-gradient(90deg, #10231eee, #10231e33), url(${movie.backdropUrl || movie.posterUrl || ''})`,
        }}
      >
        <div className="movieHeroPoster">
          {movie.posterUrl ? (
            <img
              src={movie.posterUrl}
              alt={`${movie.title} poster`}
            />
          ) : (
            <div className="moviePosterPlaceholder">
              <span>
                {movie.title.charAt(0)}
              </span>
            </div>
          )}
        </div>

        <div className="movieHeroContent">
          {movie.status && (
            <p className="eyebrow">
              {movieStatusLabel(movie.status)}
            </p>
          )}

          <h1>
            {movie.title}
          </h1>

          {movie.description && (
            <p>
              {movie.description}
            </p>
          )}

          <p>
            {genres.join(' · ')}

            {genres.length > 0 && ' · '}

            {movie.language || 'Language TBA'}

            {movie.durationMinutes
              ? ` · ${movie.durationMinutes} min`
              : ''}

            {movie.certification
              ? ` · ${movie.certification}`
              : ''}
          </p>

          {(movie.director || movie.rating != null) && (
            <p>
              {movie.director
                ? `Directed by ${movie.director}`
                : ''}

              {movie.director && movie.rating != null
                ? ' · '
                : ''}

              {movie.rating != null
                ? `★ ${movie.rating.toFixed(1)}`
                : ''}
            </p>
          )}
        </div>
      </section>

      <section>
        <div className="pageHead">
          <p className="eyebrow">
            SHOWTIMES
          </p>

          <h2>
            Choose a showtime
          </h2>
        </div>

        <div className="showtimes">
          {showings.map((showing: any) => (
            <Link
              className="showtime"
              to={`/events/${showing.id}`}
              key={showing.id}
            >
              <b>
                {new Date(
                  showing.startsAt
                ).toLocaleDateString()}
              </b>

              <span>
                {new Date(
                  showing.startsAt
                ).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>

              <small>
                {showing.venue?.name}

                <br />

                Standard from ₹
                {Math.round(
                  Number(
                    showing.pricing?.Standard || 0
                  ) / 100
                )}
              </small>
            </Link>
          ))}
        </div>

        {!showings.length && (
          <p>
            No bookable showtimes are available yet.
          </p>
        )}
      </section>
    </main>
  );
}

function EventPage() {
  const { id = '' } = useParams();

  const [event, setEvent] =
    useState<Event | null>(null);

  const [seats, setSeats] =
    useState<Seat[]>([]);

  const [selected, setSelected] =
    useState<string[]>([]);

  const [hold, setHold] =
    useState<string | null>(null);

  const [now, setNow] =
    useState(Date.now());

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [eventData, seatData] =
          await Promise.all([
            get<Event>(`/events/${id}`),
            get<Seat[]>(
              `/events/${id}/seats`
            ),
          ]);

        if (!mounted) {
          return;
        }

        setEvent(eventData);
        setSeats(seatData);
      } catch (error) {
        console.error(
          'Failed to load event:',
          error
        );
      }
    };

    void load();

    const socket = import.meta.env.VITE_SOCKET_URL
      ? io(import.meta.env.VITE_SOCKET_URL)
      : io();

    socket.emit(
      'event:join',
      id
    );

    socket.on(
      'seats:changed',
      ({
        seats: updates,
      }: {
        seats: any[];
      }) => {
        setSeats((oldSeats) =>
          oldSeats.map((seat) => {
            const update =
              updates.find(
                (item) =>
                  item.id === seat.id
              );

            return update
              ? {
                  ...seat,
                  ...update,
                }
              : seat;
          })
        );
      }
    );

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, [id]);

  useEffect(() => {
    if (!hold) {
      return;
    }

    const timer = window.setInterval(
      () => setNow(Date.now()),
      1_000
    );

    return () =>
      window.clearInterval(timer);
  }, [hold]);

  useEffect(() => {
    if (
      !hold ||
      new Date(hold).getTime() > now
    ) {
      return;
    }

    setHold(null);
    setSelected([]);

    get<Seat[]>(
      `/events/${id}/seats`
    )
      .then(setSeats)
      .catch(() => {});
  }, [hold, id, now]);

  const grouped = useMemo(() => {
    const groupedSeats: Record<
      string,
      Seat[]
    > = {};

    for (const seat of seats) {
      if (!groupedSeats[seat.seat.row]) {
        groupedSeats[seat.seat.row] = [];
      }

      groupedSeats[
        seat.seat.row
      ].push(seat);
    }

    return Object.entries(
      groupedSeats
    );
  }, [seats]);

  const select = (seat: Seat) => {
    if (seat.status !== 'AVAILABLE') {
      return;
    }

    setSelected((current) =>
      current.includes(seat.id)
        ? current.filter(
            (id) => id !== seat.id
          )
        : [...current, seat.id]
    );
  };

  const reserve = async () => {
    if (!selected.length) {
      return;
    }

    try {
      const response =
        await api.post(
          `/events/${id}/seats/hold`,
          {
            seatIds: selected,
          }
        );

      setHold(
        response.data.data.expiresAt
      );

      setSeats((current) =>
        current.map((seat) =>
          selected.includes(seat.id)
            ? {
                ...seat,
                status: 'HELD',
                holdExpiresAt:
                  response.data.data
                    .expiresAt,
              }
            : seat
        )
      );
    } catch (error: any) {
      alert(
        error.response?.data?.message ||
          'Could not reserve seats'
      );

      get<Seat[]>(
        `/events/${id}/seats`
      )
        .then(setSeats)
        .catch(() => {});
    }
  };

  const confirm = async () => {
    if (!selected.length) {
      return;
    }

    try {
      const response =
        await api.post(
          '/bookings',
          {
            seatIds: selected,
          }
        );

      window.location.assign(
        response.data.data.payment.url
      );
    } catch (error: any) {
      alert(
        error.response?.data?.message ||
          'Your seat hold has expired.'
      );

      setHold(null);
      setSelected([]);

      get<Seat[]>(
        `/events/${id}/seats`
      )
        .then(setSeats)
        .catch(() => {});
    }
  };

  if (!event) {
    return (
      <main>
        Loading event…
      </main>
    );
  }

  const chosen = seats.filter((seat) =>
    selected.includes(seat.id)
  );

  const secondsRemaining = hold
    ? Math.max(
        0,
        Math.ceil(
          (new Date(hold).getTime() - now) /
            1_000
        )
      )
    : 0;

  const countdown = `${String(
    Math.floor(secondsRemaining / 60)
  ).padStart(2, '0')}:${String(
    secondsRemaining % 60
  ).padStart(2, '0')}`;

  return (
    <main className="booking">
      <section>
        <p className="eyebrow">
          {event.type} ·{' '}
          {event.venue.name}
        </p>

        <h2>
          {event.title}
        </h2>

        <p>
          {new Date(
            event.startsAt
          ).toLocaleString()}{' '}
          · {event.venue.location}
        </p>

        <div className="screen">
          STAGE / SCREEN
        </div>

        <div className="legend">
          <i className="available" />
          Available

          <i className="chosen" />
          Selected

          <i className="taken" />
          Unavailable
        </div>

        <div className="map">
          {grouped.map(
            ([row, items]) => (
              <div
                className="seatRow"
                key={row}
              >
                <label>
                  {row}
                </label>

                {items
                  .sort(
                    (a, b) =>
                      a.seat.number -
                      b.seat.number
                  )
                  .map((seat) => {
                    const isSelected =
                      selected.includes(
                        seat.id
                      );

                    return (
                      <button
                        key={seat.id}
                        type="button"
                        title={`${seat.category} ${money(
                          seat.price
                        )}`}
                        onClick={() =>
                          select(seat)
                        }
                        className={`seat ${
                          seat.status ===
                          'AVAILABLE'
                            ? isSelected
                              ? 'selected'
                              : ''
                            : 'blocked'
                        }`}
                      >
                        {
                          seat.seat
                            .number
                        }
                      </button>
                    );
                  })}
              </div>
            )
          )}
        </div>
      </section>

      <aside>
        <h3>
          Your selection
        </h3>

        {chosen.length ? (
          <>
            {chosen.map((seat) => (
              <p key={seat.id}>
                {seat.seat.row}
                {seat.seat.number}{' '}
                <span>
                  {money(seat.price)}
                </span>
              </p>
            ))}

            <hr />

            <h3>
              Total{' '}
              <span>
                {money(
                  chosen.reduce(
                    (total, seat) =>
                      total +
                      seat.price,
                    0
                  )
                )}
              </span>
            </h3>

            {hold ? (
              <>
                <small>
                  Reserved for {countdown}
                </small>

                <button
                  type="button"
                  className="cta full"
                  onClick={confirm}
                >
                  Confirm booking
                </button>
              </>
            ) : (
              <button
                type="button"
                className="cta full"
                onClick={reserve}
              >
                Reserve seats
              </button>
            )}
          </>
        ) : (
          <p>
            Select available seats to
            continue.
          </p>
        )}
      </aside>
    </main>
  );
}

function Auth({
  register = false,
}: {
  register?: boolean;
}) {
  const nav = useNavigate();

  const [name, setName] =
    useState('');

  const [email, setEmail] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [role, setRole] =
    useState('CUSTOMER');

  const submit = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    try {
      const response =
        await api.post(
          `/auth/${
            register
              ? 'register'
              : 'login'
          }`,
          {
            name,
            email,
            password,
            role,
          }
        );

      localStorage.setItem(
        'token',
        response.data.data.token
      );

      localStorage.setItem(
        'role',
        response.data.data.user.role
      );

      nav('/events');
    } catch (error: any) {
      alert(
        error.response?.data?.message ||
          'Unable to continue'
      );
    }
  };

  return (
    <main className="auth">
      <form onSubmit={submit}>
        <p className="eyebrow">
          WELCOME TO SEATFLOW
        </p>

        <h2>
          {register
            ? 'Create your account'
            : 'Welcome back'}
        </h2>

        {register && (
          <input
            placeholder="Full name"
            value={name}
            onChange={(e) =>
              setName(
                e.target.value
              )
            }
            required
          />
        )}

        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) =>
            setEmail(
              e.target.value
            )
          }
          required
        />

        <input
          placeholder="Password (8+ characters)"
          type="password"
          value={password}
          onChange={(e) =>
            setPassword(
              e.target.value
            )
          }
          minLength={8}
          required
        />

        <fieldset className="rolePicker">
          <legend>
            {register
              ? 'I want to join as'
              : 'Sign in as'}
          </legend>

          {(
            [
              'CUSTOMER',
              'ORGANISER',
              ...(register ? [] : ['ADMIN']),
            ] as const
          ).map((option) => (
            <button
              key={option}
              type="button"
              className={
                role === option
                  ? 'roleChoice active'
                  : 'roleChoice'
              }
              onClick={() =>
                setRole(option)
              }
            >
              <b>
                {option === 'CUSTOMER'
                  ? 'Customer'
                  : option === 'ORGANISER'
                    ? 'Organiser'
                    : 'Admin'}
              </b>

              <span>
                {option === 'CUSTOMER'
                  ? 'Book seats and manage tickets.'
                  : option === 'ORGANISER'
                    ? 'Create and manage events.'
                    : 'Manage the platform.'}
              </span>
            </button>
          ))}
        </fieldset>

        <button
          type="submit"
          className="cta full"
        >
          {register
            ? 'Create account'
            : 'Sign in'}
        </button>

        <p>
          {register
            ? 'Already registered? '
            : 'New here? '}

          <Link
            to={
              register
                ? '/login'
                : '/register'
            }
          >
            {register
              ? 'Sign in'
              : 'Create an account'}
          </Link>
        </p>
      </form>
    </main>
  );
}

function Bookings() {
  const [data, setData] =
    useState<any[]>([]);

  const load = () => {
    return get<any[]>(
      '/bookings'
    )
      .then(setData)
      .catch(() =>
        setData([])
      );
  };

  useEffect(() => {
    void load();
  }, []);

  const cancel = async (
    id: string
  ) => {
    if (
      !window.confirm(
        'Cancel this booking? Your seats may be offered to the waitlist.'
      )
    ) {
      return;
    }

    try {
      await api.post(
        `/bookings/${id}/cancel`
      );

      await load();
    } catch (error: any) {
      alert(
        error.response?.data?.message ||
          'Could not cancel this booking'
      );
    }
  };

  return (
    <main>
      <div className="pageHead">
        <p className="eyebrow">
          YOUR BOOKINGS
        </p>

        <h2>
          Tickets for your next night out
        </h2>
      </div>

      <div className="tickets">
        {data.map((booking) => (
          <article
            className="ticket ticketDetail"
            key={booking.id}
          >
            <div>
              <span className="badge">
                {booking.status}
              </span>

              <h3>
                {booking.event.title}
              </h3>

              <p>
                <b>
                  {booking.reference}
                </b>{' '}
                ·{' '}
                {new Date(
                  booking.event
                    .startsAt
                ).toLocaleString()}
              </p>

              <p>
                {
                  booking.event
                    .venue.name
                }{' '}
                ·{' '}
                {booking.seats
                  .map(
                    (seat: any) =>
                      `${seat.eventSeat.seat.row}${seat.eventSeat.seat.number}`
                  )
                  .join(', ')}{' '}
                ·{' '}
                {money(booking.total)}
              </p>

              {booking.status ===
                'CONFIRMED' && (
                <>
                  <small>
                    Present the QR code at
                    entry. It opens the
                    Seatflow ticket
                    verification page.
                  </small>

                  <button
                    type="button"
                    className="cta"
                    onClick={() =>
                      cancel(
                        booking.id
                      )
                    }
                  >
                    Cancel booking
                  </button>
                </>
              )}

              {booking.status ===
                'PAYMENT_PENDING' &&
                booking.payment && (
                  <small>
                    Payment is pending. Continue using
                    the secure payment link or QR created
                    at checkout; your seats remain reserved
                    until it expires.
                  </small>
                )}
            </div>

            {booking.qrCode && (
              <img
                className="ticketQr"
                src={booking.qrCode}
                alt={`QR ticket ${booking.reference}`}
              />
            )}
          </article>
        ))}

        {!data.length && (
          <p>
            No tickets yet.{' '}
            <Link to="/events">
              Explore events
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}

function VerifyTicket() {
  const { reference = '' } =
    useParams();

  const [loading, setLoading] =
    useState(true);

  const [ticket, setTicket] =
    useState<VerificationTicket | null>(
      null
    );

  const [error, setError] =
    useState('');

  const [errorKind, setErrorKind] =
    useState<
      'not-found' | 'unavailable' | null
    >(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!reference) {
        setError(
          'No booking reference was provided.'
        );

        setErrorKind('not-found');
        setLoading(false);

        return;
      }

      try {
        setLoading(true);
        setError('');
        setErrorKind(null);

        const response =
          await get<VerificationTicket>(
            `/bookings/verify/${encodeURIComponent(
              reference
            )}`
          );

        if (!mounted) {
          return;
        }

        setTicket(response);
      } catch (error: any) {
        if (!mounted) {
          return;
        }

        const isNotFound =
          error.response?.status === 404;

        setError(
          error.response?.data?.message ||
            (isNotFound
              ? 'This ticket does not exist.'
              : 'The verification service could not be reached.')
        );

        setErrorKind(
          isNotFound
            ? 'not-found'
            : 'unavailable'
        );

        setTicket(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [reference]);

  if (loading) {
    return (
      <main className="verificationShell">
        <section className="verificationCard loading">
          <span className="verifyMark">
            …
          </span>

          <p className="eyebrow">
            SEATFLOW VERIFY
          </p>

          <h2>
            Checking ticket…
          </h2>

          <p>
            Verifying booking reference.
          </p>
        </section>
      </main>
    );
  }

  if (error || !ticket) {
    return (
      <main className="verificationShell">
        <section className="verificationCard invalid">
          <span className="verifyMark">
            !
          </span>

          <p className="eyebrow">
            SEATFLOW VERIFY
          </p>

          <h2>
            {errorKind ===
            'unavailable'
              ? 'Verification unavailable'
              : 'Ticket not found'}
          </h2>

          <p>
            {error}
          </p>
        </section>
      </main>
    );
  }

  const valid =
    ticket.valid &&
    ticket.status ===
      'CONFIRMED';

  return (
    <main className="verificationShell">
      <section
        className={`verificationCard ${
          valid
            ? 'valid'
            : 'invalid'
        }`}
      >
        <span className="verifyMark">
          {valid ? '✓' : '!'}
        </span>

        <p className="eyebrow">
          SEATFLOW VERIFY
        </p>

        <h2>
          {valid
            ? 'Valid ticket'
            : 'Invalid / cancelled'}
        </h2>

        <p>
          {valid
            ? 'This ticket is valid for entry.'
            : 'This ticket is no longer valid for entry.'}
        </p>

        <hr />

        <h3>
          {ticket.event.title}
        </h3>

        <p>
          <b>Booking:</b>{' '}
          {ticket.reference}
        </p>

        <p>
          <b>Status:</b>{' '}
          {ticket.status}
        </p>

        <p>
          <b>Venue:</b>{' '}
          {ticket.event.venue}
        </p>

        <p>
          <b>Location:</b>{' '}
          {ticket.event.location}
        </p>

        <p>
          <b>Date:</b>{' '}
          {new Date(
            ticket.event.startsAt
          ).toLocaleString()}
        </p>

        <h3>
          Seats
        </h3>

        {ticket.seats.map(
          (seat) => (
            <p
              key={`${seat.row}-${seat.number}`}
            >
              {seat.row}
              {seat.number} ·{' '}
              {seat.category}
            </p>
          )
        )}
      </section>
    </main>
  );
}

function PaymentPage() {
  const { reference = '' } =
    useParams();

  const actionToken =
    new URLSearchParams(
      window.location.search
    ).get('token') || '';

  const [payment, setPayment] =
    useState<any>(null);

  const [error, setError] =
    useState('');

  const [working, setWorking] =
    useState(false);

  useEffect(() => {
    get<any>(
      `/bookings/payments/${encodeURIComponent(
        reference
      )}?token=${encodeURIComponent(
        actionToken
      )}`
    )
      .then(setPayment)
      .catch((err) =>
        setError(
          err.response?.data?.message ||
            'Payment details are unavailable.'
        )
      );
  }, [reference, actionToken]);

  const act = async (
    action: 'succeed' | 'cancel'
  ) => {
    setWorking(true);

    try {
      const response =
        await api.post(
          `/bookings/payments/${encodeURIComponent(
            reference
          )}/${action}`,
          {
            token: actionToken,
          }
        );

      if (action === 'succeed') {
        setPayment(
          (current: any) => ({
            ...current,
            status: 'SUCCESSFUL',
            verificationUrl:
              response.data.data
                .verificationUrl,
          })
        );
      } else {
        setPayment(
          (current: any) => ({
            ...current,
            status: 'CANCELLED',
          })
        );
      }

      return response;
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          'Payment action could not be completed.'
      );
    } finally {
      setWorking(false);
    }
  };

  if (error) {
    return (
      <main className="verificationShell">
        <section className="verificationCard invalid">
          <span className="verifyMark">
            !
          </span>

          <h2>
            Payment unavailable
          </h2>

          <p>
            {error}
          </p>
        </section>
      </main>
    );
  }

  if (!payment) {
    return (
      <main className="verificationShell">
        <section className="verificationCard loading">
          <span className="verifyMark">
            …
          </span>

          <h2>
            Preparing payment…
          </h2>
        </section>
      </main>
    );
  }

  const booking =
    payment.booking;

  const pending =
    payment.status === 'PENDING' &&
    !payment.unavailableReason;

  return (
    <main className="paymentShell">
      <section className="paymentCard">
        <p className="eyebrow">
          SIMULATED PAYMENT — NO MONEY IS TRANSFERRED
        </p>

        <h2>
          {pending
            ? 'Complete your booking'
            : 'Payment unavailable'}
        </h2>

        <h3>
          {booking.event.title}
        </h3>

        <p>
          {booking.event.venue} ·{' '}
          {new Date(
            booking.event.startsAt
          ).toLocaleString()}
        </p>

        <p>
          Seats:{' '}
          {booking.seats
            .map(
              (seat: any) =>
                `${seat.row}${seat.number} (${seat.category})`
            )
            .join(', ')}
        </p>

        <div className="priceBreakdown">
          <p>
            Tickets
            <span>
              {money(booking.subtotal)}
            </span>
          </p>

          <p>
            Convenience fee
            <span>
              {money(
                booking.convenienceFee
              )}
            </span>
          </p>

          <p>
            GST
            <span>
              {money(booking.tax)}
            </span>
          </p>

          <h3>
            Total
            <span>
              {money(booking.total)}
            </span>
          </h3>
        </div>

        <p>
          Status:{' '}
          <b>
            {payment.status}
          </b>
        </p>

        {payment.unavailableReason && (
          <p>
            {payment.unavailableReason}
          </p>
        )}

        {pending && (
          <div className="paymentActions">
            <button
              className="cta"
              disabled={working}
              onClick={() =>
                void act('succeed')
              }
            >
              Payment successful
            </button>

            <button
              disabled={working}
              onClick={() =>
                void act('cancel')
              }
            >
              Cancel payment
            </button>
          </div>
        )}

        {payment.status ===
          'SUCCESSFUL' && (
          <Link
            className="cta"
            to={`/verify/${booking.reference}`}
          >
            View ticket
          </Link>
        )}
      </section>
    </main>
  );
}

function WaitlistOfferPage() {
  const { token = '' } =
    useParams();

  const [offer, setOffer] =
    useState<any>(null);

  const [error, setError] =
    useState('');

  const [working, setWorking] =
    useState(false);

  useEffect(() => {
    get<any>(
      `/waitlist/offers/${encodeURIComponent(
        token
      )}`
    )
      .then(setOffer)
      .catch((err) =>
        setError(
          err.response?.data?.message ||
            'Offer unavailable.'
        )
      );
  }, [token]);

  const act = async (
    action: 'accept' | 'decline'
  ) => {
    setWorking(true);

    try {
      const response =
        await api.post(
          `/waitlist/offers/${encodeURIComponent(
            token
          )}/${action}`
        );

      if (action === 'accept') {
        window.location.assign(
          response.data.data.paymentUrl
        );
      } else {
        setOffer(
          (current: any) => ({
            ...current,
            status: 'CANCELLED',
            unavailableReason:
              'This offer has been cancelled.',
          })
        );
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          'Offer unavailable.'
      );
    } finally {
      setWorking(false);
    }
  };

  if (error) {
    return (
      <main className="verificationShell">
        <section className="verificationCard invalid">
          <span className="verifyMark">
            !
          </span>

          <h2>
            Offer unavailable
          </h2>

          <p>
            {error}
          </p>
        </section>
      </main>
    );
  }

  if (!offer) {
    return (
      <main className="verificationShell">
        <section className="verificationCard loading">
          <span className="verifyMark">
            …
          </span>

          <h2>
            Preparing offer…
          </h2>
        </section>
      </main>
    );
  }

  const pending =
    offer.status === 'PENDING' &&
    !offer.unavailableReason;

  return (
    <main className="paymentShell">
      <section className="paymentCard">
        <p className="eyebrow">
          WAITLIST OFFER
        </p>

        <h2>
          {pending
            ? 'Complete your booking'
            : 'Offer unavailable'}
        </h2>

        <h3>
          {offer.event.title}
        </h3>

        <p>
          {offer.event.venue} ·{' '}
          {new Date(
            offer.event.startsAt
          ).toLocaleString()}
        </p>

        <p>
          Seat: {offer.seat.row}
          {offer.seat.number} (
          {offer.seat.category})
        </p>

        <div className="priceBreakdown">
          <p>
            Ticket price
            <span>
              {money(offer.subtotal)}
            </span>
          </p>

          <p>
            Convenience fee
            <span>
              {money(
                offer.convenienceFee
              )}
            </span>
          </p>

          <p>
            GST
            <span>
              {money(offer.tax)}
            </span>
          </p>

          <h3>
            Total
            <span>
              {money(offer.total)}
            </span>
          </h3>
        </div>

        <p>
          Offer expiry:{' '}
          <b>
            {new Date(
              offer.expiresAt
            ).toLocaleString()}
          </b>
        </p>

        <p>
          Status:{' '}
          <b>
            {offer.status}
          </b>
        </p>

        {offer.unavailableReason && (
          <p>
            {offer.unavailableReason}
          </p>
        )}

        {pending && (
          <div className="paymentActions">
            <button
              className="cta"
              disabled={working}
              onClick={() =>
                void act('accept')
              }
            >
              Accept offer / Continue to payment
            </button>

            <button
              disabled={working}
              onClick={() =>
                void act('decline')
              }
            >
              Decline
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function OrganiserDashboard() {
  const [events, setEvents] =
    useState<any[]>([]);

  const [error, setError] =
    useState('');

  const load = () =>
    get<any[]>('/events/mine/list')
      .then(setEvents)
      .catch((err) =>
        setError(
          err.response?.data?.message ||
            'Could not load your events.'
        )
      );

  useEffect(() => {
    void load();
  }, []);

  if (
    localStorage.getItem('role') !==
      'ORGANISER' &&
    localStorage.getItem('role') !==
      'ADMIN'
  ) {
    return (
      <main>
        Please sign in as an organiser.
      </main>
    );
  }

  return (
    <main>
      <div className="pageHead">
        <p className="eyebrow">
          ORGANISER
        </p>

        <h2>
          My events
        </h2>

        <Link
          className="cta"
          to="/organiser/events/new"
        >
          Create event
        </Link>
      </div>

      {error && (
        <p>
          {error}
        </p>
      )}

      <div className="tickets">
        {events.map((event) => (
          <article
            className="ticket ticketDetail"
            key={event.id}
          >
            <div>
              <span className="badge">
                {event.status}
              </span>

              <h3>
                {event.title}
              </h3>

              <p>
                {event.type} ·{' '}
                {event.venue.name}
              </p>

              <p>
                {new Date(
                  event.startsAt
                ).toLocaleString()}
              </p>

              <p>
                {event.bookingCount}{' '}
                confirmed bookings ·{' '}
                {money(event.revenue)}
              </p>

              <Link
                className="cta"
                to={`/organiser/events/${event.id}`}
              >
                Manage
              </Link>
            </div>
          </article>
        ))}

        {!events.length &&
          !error && (
            <p>
              No events yet.
            </p>
          )}
      </div>
    </main>
  );
}

function OrganiserEventForm() {
  const nav = useNavigate();

  const [venues, setVenues] =
    useState<any[]>([]);

  const [venueId, setVenueId] =
    useState('');

  const [venue, setVenue] =
    useState<any>(null);

  const [form, setForm] =
    useState({
      title: '',
      description: '',
      type: 'MOVIE',
      startsAt: '',
      pricing:
        {} as Record<
          string,
          string
        >,
    });

  const [error, setError] =
    useState('');

  useEffect(() => {
    get<any[]>('/venues')
      .then(setVenues)
      .catch(() =>
        setError(
          'Could not load venues.'
        )
      );
  }, []);

  useEffect(() => {
    if (!venueId) {
      setVenue(null);
      return;
    }

    get<any>(
      `/venues/${venueId}`
    )
      .then(setVenue)
      .catch(() =>
        setError(
          'Could not load venue layout.'
        )
      );
  }, [venueId]);

  const categories: string[] =
    venue
      ? [
          ...new Set<string>(
            venue.seats?.map(
              (seat: any) =>
                String(
                  seat.category
                )
            ) || []
          ),
        ]
      : [];

  const submit = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    try {
      const pricing =
        Object.fromEntries(
          categories.map(
            (category) => [
              category,
              Math.round(
                Number(
                  form.pricing[
                    category
                  ]
                ) * 100
              ),
            ]
          )
        );

      const response =
        await api.post(
          '/events',
          {
            ...form,
            venueId,
            startsAt:
              new Date(
                form.startsAt
              ).toISOString(),
            pricing,
            status: 'DRAFT',
          }
        );

      nav(
        `/organiser/events/${response.data.data.id}`
      );
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          'Could not create event.'
      );
    }
  };

  return (
    <main>
      <div className="pageHead">
        <p className="eyebrow">
          ORGANISER
        </p>

        <h2>
          Create event
        </h2>
      </div>

      <form
        className="auth"
        onSubmit={submit}
      >
        <input
          required
          placeholder="Event title"
          value={form.title}
          onChange={(e) =>
            setForm({
              ...form,
              title:
                e.target.value,
            })
          }
        />

        <textarea
          required
          placeholder="Description"
          value={
            form.description
          }
          onChange={(e) =>
            setForm({
              ...form,
              description:
                e.target.value,
            })
          }
        />

        <select
          value={form.type}
          onChange={(e) =>
            setForm({
              ...form,
              type:
                e.target.value,
            })
          }
        >
          <option value="MOVIE">
            Movie
          </option>

          <option value="CONCERT">
            Concert
          </option>
        </select>

        <select
          required
          value={venueId}
          onChange={(e) =>
            setVenueId(
              e.target.value
            )
          }
        >
          <option value="">
            Choose venue
          </option>

          {venues.map(
            (venue) => (
              <option
                value={venue.id}
                key={venue.id}
              >
                {venue.name}
              </option>
            )
          )}
        </select>

        <input
          required
          type="datetime-local"
          value={form.startsAt}
          onChange={(e) =>
            setForm({
              ...form,
              startsAt:
                e.target.value,
            })
          }
        />

        {categories.map(
          (category) => (
            <label
              key={category}
            >
              {category} price (₹)

              <input
                required
                min="1"
                type="number"
                value={
                  form.pricing[
                    category
                  ] || ''
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    pricing: {
                      ...form.pricing,
                      [category]:
                        e.target.value,
                    },
                  })
                }
              />
            </label>
          )
        )}

        {error && (
          <p>
            {error}
          </p>
        )}

        <button
          className="cta"
          type="submit"
        >
          Create draft
        </button>
      </form>
    </main>
  );
}

function OrganiserManageEvent() {
  const { id = '' } =
    useParams();

  const [event, setEvent] =
    useState<any>(null);

  const [error, setError] =
    useState('');

  const load = () =>
    get<any>(
      `/events/${id}/manage`
    )
      .then(setEvent)
      .catch((err) =>
        setError(
          err.response?.data?.message ||
            'Could not load this event.'
        )
      );

  useEffect(() => {
    void load();
  }, [id]);

  const status = async (
    next: string
  ) => {
    try {
      await api.post(
        `/events/${id}/status`,
        {
          status: next,
        }
      );

      await load();
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          'Could not update status.'
      );
    }
  };

  if (error) {
    return (
      <main>
        {error}
      </main>
    );
  }

  if (!event) {
    return (
      <main>
        Loading event…
      </main>
    );
  }

  const confirmed =
    event.bookings || [];

  const gross =
    confirmed.reduce(
      (
        sum: number,
        booking: any
      ) =>
        sum +
        booking.subtotal,
      0
    );

  const fees =
    confirmed.reduce(
      (
        sum: number,
        booking: any
      ) =>
        sum +
        booking.convenienceFee,
      0
    );

  const tax =
    confirmed.reduce(
      (
        sum: number,
        booking: any
      ) =>
        sum +
        booking.tax,
      0
    );

  const total =
    confirmed.reduce(
      (
        sum: number,
        booking: any
      ) =>
        sum +
        booking.total,
      0
    );

  return (
    <main>
      <div className="pageHead">
        <p className="eyebrow">
          ORGANISER MANAGEMENT
        </p>

        <h2>
          {event.title}
        </h2>

        <p>
          {event.venue.name} ·{' '}
          {new Date(
            event.startsAt
          ).toLocaleString()}
        </p>

        <span className="badge">
          {event.status}
        </span>
      </div>

      <section className="features">
        <div>
          <b>
            Confirmed bookings
          </b>

          <span>
            {confirmed.length}
          </span>
        </div>

        <div>
          <b>
            Ticket revenue
          </b>

          <span>
            {money(gross)}
          </span>
        </div>

        <div>
          <b>
            Total collection
          </b>

          <span>
            {money(total)}
          </span>
        </div>
      </section>

      <p>
        Convenience fees:{' '}
        {money(fees)} · GST:{' '}
        {money(tax)}
      </p>

      <div className="paymentActions">
        {event.status !==
          'PUBLISHED' && (
          <button
            className="cta"
            onClick={() =>
              void status(
                'PUBLISHED'
              )
            }
          >
            Publish
          </button>
        )}

        {event.status !==
          'DRAFT' && (
          <button
            onClick={() =>
              void status('DRAFT')
            }
          >
            Unpublish
          </button>
        )}

        {event.status !==
          'CANCELLED' && (
          <button
            onClick={() =>
              void status(
                'CANCELLED'
              )
            }
          >
            Cancel show
          </button>
        )}
      </div>

      <h3>
        Category pricing
      </h3>

      {Object.entries(
        event.pricing as Record<
          string,
          number
        >
      ).map(
        ([category, price]) => (
          <p key={category}>
            {category}:{' '}
            {money(price)}
          </p>
        )
      )}
    </main>
  );
}

function App() {
  return (
    <>
      <Nav />

      <Routes>
        <Route
          path="/"
          element={<Home />}
        />

        <Route
          path="/events"
          element={<Events />}
        />

        <Route
          path="/events/:id"
          element={<EventPage />}
        />

        <Route
          path="/movies"
          element={<MovieCatalogue />}
        />

        <Route
          path="/movies/:slug"
          element={<MoviePage />}
        />

        <Route
          path="/bookings"
          element={<Bookings />}
        />

        <Route
          path="/verify/:reference"
          element={<VerifyTicket />}
        />

        <Route
          path="/payment/:reference"
          element={<PaymentPage />}
        />

        <Route
          path="/waitlist-offer/:token"
          element={<WaitlistOfferPage />}
        />

        <Route
          path="/organiser"
          element={<OrganiserDashboard />}
        />

        <Route
          path="/organiser/events/new"
          element={<OrganiserEventForm />}
        />

        <Route
          path="/organiser/events/:id"
          element={<OrganiserManageEvent />}
        />

        <Route
          path="/login"
          element={<Auth />}
        />

        <Route
          path="/register"
          element={<Auth register />}
        />
      </Routes>
    </>
  );
}

createRoot(
  document.getElementById('root')!
).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);