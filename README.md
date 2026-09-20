# Syllabase

Syllabase is a self-hosted study and homework planner for people juggling multiple courses, homework, labs, and exams. Run it on your own server — your data stays on your own infrastructure.

It helps you:
- See everything due today (and what's coming next).
- Break exam prep into multiple study days.
- Track weekly progress with clean statistics.
- Keep courses and past semesters organized.
- Get optional push notifications (via your own Pushover account) for upcoming assignments, exams, and quizzes.
- Access the app from desktop, mobile, and as an installable PWA.

---

## Self-hosting

Syllabase is two containers: `db` (Postgres, extended with a couple of small init scripts GoTrue/PostgREST need — see `Dockerfile.db`), and one `app` container bundling everything else — auth, the REST API, the 5 edge functions, and the frontend, all behind an internal gateway. No external accounts or SaaS dependencies required.

### Quickstart

**1.** Save this as `docker-compose.yml`:

```yaml
services:
  db:
    image: ghcr.io/owenwright8/syllabase-db:latest
    restart: unless-stopped
    environment:
      # Optional (see "Optional settings"): leave as they are for automatic setup.
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-}
      POSTGRES_DB: ${POSTGRES_DB:-postgres}
      JWT_EXP: ${JWT_EXP:-3600}
    volumes:
      - db-data:/var/lib/postgresql/data
      - secrets:/secrets
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 20

  app:
    image: ghcr.io/owenwright8/syllabase:latest
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      # Optional (see "Optional settings"): leave as they are for automatic setup.
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-}
      POSTGRES_DB: ${POSTGRES_DB:-postgres}
      JWT_SECRET: ${JWT_SECRET:-}
      JWT_EXP: ${JWT_EXP:-3600}
      ANON_KEY: ${ANON_KEY:-}
      SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY:-}
      CRON_SECRET: ${CRON_SECRET:-}
    volumes:
      - secrets:/secrets
    security_opt:
      - no-new-privileges:true
    ports:
      - "${APP_PORT:-8080}:8080"

volumes:
  db-data:
  secrets:
```

**2.** Start it:

```sh
docker compose up -d
```

**3.** Open `http://<your-server-ip>:8080` and create the first account.

That's the whole setup. There is nothing to configure: on first start it generates its own secrets (database password, signing keys) and keeps them in the `secrets` volume, and it uses whatever address you open it at, so an IP and port work as they are. (To use a different port, set `APP_PORT` or change the left-hand `8080` in `ports`.)

Anyone with the URL can create their own account and their own private data (there's no email verification since there's no SMTP server involved), so keep that in mind if you're putting this on the open internet rather than behind a VPN/private network. See [Security notes](#security-notes) below.

**Using a domain and HTTPS:** point your reverse proxy (Caddy, Traefik, nginx…) at port `8080`. There is no URL setting to change: the app follows the address it is loaded from, including behind a proxy.

**Building from source** instead of pulling the prebuilt images: clone the repo and run `docker compose up -d --build` (the repo's own `docker-compose.yml` is set up for both).

### Optional settings

None of these are required. Docker Compose reads a `.env` file next to `docker-compose.yml` automatically; [`.env.example`](.env.example) lists them, all commented out.

| Setting | What it does |
|---|---|
| `POSTGRES_PASSWORD`, `JWT_SECRET`, `CRON_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` | Use your own secrets instead of generated ones. |
| `APP_PORT` | The port the app is published on (default `8080`). |
| `SYLLABASE_VERSION` | Pin to a release tag (e.g. `v0.4.0`) instead of `latest`. |

### Upgrading

```sh
docker compose pull && docker compose up -d
```

Migrations apply automatically, each in its own transaction. **Coming from v0.3.x or earlier** (where you ran `./setup.sh` and edited `.env`)? Nothing needs to change: your existing compose file and `.env` keep working, and `SITE_URL` is no longer used (delete it if you like). If you switch to the new compose file above, keep your `.env` next to it: it holds your database password, and the database refuses to start rather than guess a new one.

### Backups

Your data lives in the `db-data` volume and the keys that go with it live in the `secrets` volume, so back up **both**. If `secrets` is lost but `db-data` survives, the database will refuse to start (rather than silently create a password that doesn't match) and tell you what to restore.

### Security notes

- **Put it behind HTTPS.** The `app` container speaks plain HTTP on the published port. Run it behind a reverse proxy (Caddy, Traefik, nginx…) that terminates TLS. Passwords and session tokens cross the wire on every request, so don't expose the plain-HTTP port to the internet.
- **Sign-up is open.** Anyone who can reach the URL can create an account (each account only ever sees its own data). If that isn't what you want, keep the instance on a private network/VPN or restrict access at your reverse proxy.
- **Postgres is not exposed to the network.** The app talks to it over the internal compose network and its port isn't published.
- **The `secrets` volume holds every key** (database password, JWT signing secret, cron secret). Anyone who can run Docker commands on the host can read it, just as they could read a `.env` file. Treat it like one: keep it out of version control and out of backups you don't trust.
- **Sign-in attempts are rate limited** per client IP at the gateway. Behind a reverse proxy, make sure it forwards the client address in `X-Forwarded-For` (most do by default) so the limit applies per person rather than to the proxy as a whole.

### Notifications (optional)

Push notifications go through [Pushover](https://pushover.net) — each person brings their own free Pushover account and app token, configured on the Profile page. Nothing here depends on how the instance is hosted, and no notification setup is required for the app to work.

---

## Features

### 🗓 Today View
- Shows everything scheduled for the selected day, plus your ordered "plan" for the day.
- At-a-glance stats: due today, week progress, term totals.
- A 7-day activity chart and streak tracking.

### 📚 Courses & Assignments
- Create courses with short codes (e.g., `CHE-111`, `PHY-109`) and color tags.
- Assignments with type, due date/time, course, notes, and priority.
- Archive completed assignments and whole courses at the end of a term.

### 🧪 Exams, Quizzes & Study Items
- Track exams and quizzes per course.
- Study items can link to a specific exam/quiz, with priority and status.
- A dedicated Study page and Today-page widget surface what needs attention.

### 📖 Readings & Planner
- Track readings alongside assignments.
- A day-planner view for ordering exactly what you're working on, when.

### 👤 Accounts
- Username/password accounts. The first visit to a fresh instance creates the first account; after that it's a normal sign in / sign up screen.
- Change your password from the Profile page once logged in.

### 🔌 Homepage widget
- A read-only stats API (`widget-stats` function, API-key gated) for embedding your stats into a [Homepage](https://gethomepage.dev) dashboard or similar.

### 🌙 UI / UX
- Light/dark themes with several accent color options.
- Responsive design, installable as a PWA.

---

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui
- **Backend / DB**: Self-hosted Supabase-compatible stack (Postgres + GoTrue auth + PostgREST + Edge Functions), with nginx as the internal gateway
- **Deployment**: Docker Compose (2 containers: Postgres + one all-in-one app container)

## Development

```sh
npm ci
npm run dev        # http://localhost:8080 — point VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY at a running instance
npm run test:e2e   # Playwright; needs no backend (see below)
```

The end-to-end tests (`e2e/`) drive the real UI in Chromium against an in-memory fake of the backend (`e2e/support/fakeBackend.ts`), installed by intercepting network requests — so they run with no server, database or Docker. Run `npx playwright install chromium` once first.
