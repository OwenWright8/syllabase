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

Copy this into a `docker-compose.yml`:

```yaml
services:
  db:
    image: ghcr.io/owenwright8/syllabase-db:latest
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-postgres}
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXP: ${JWT_EXP:-3600}
    volumes:
      - db-data:/var/lib/postgresql/data
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
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-postgres}
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXP: ${JWT_EXP:-3600}
      ANON_KEY: ${ANON_KEY}
      SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY}
      CRON_SECRET: ${CRON_SECRET}
      SITE_URL: ${SITE_URL}
      VITE_SUPABASE_PUBLISHABLE_KEY: ${VITE_SUPABASE_PUBLISHABLE_KEY}
    ports:
      - "${APP_PORT:-8080}:8080"

volumes:
  db-data:
```

Then grab [`.env.example`](.env.example) and [`setup.sh`](setup.sh) next to it (or just clone the repo, which already has all three), and run:

```sh
./setup.sh
```

This generates `.env` with every secret (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `CRON_SECRET`) filled in automatically — no manual JWT signing. Open `.env` and set the one value that can't be guessed for you:

```
SITE_URL=https://your-domain.example
```

Then:

```sh
docker compose up -d
```

That's it — `app` pulls the prebuilt image from GHCR by default (published by the [Release workflow](.github/workflows/release.yml) on every tagged version), Postgres comes up alongside it, and migrations apply automatically on first boot. If you'd rather build from source, swap `image:` for `build: { context: ., dockerfile: Dockerfile }` (or just run `docker compose build` from a full checkout, which the repo's own `docker-compose.yml` is already set up for).

Visit the site: since this is a fresh instance with no accounts yet, you'll be prompted to create one. Every visit after that shows the normal sign in / sign up screen — anyone with the URL can create their own account and their own private data (there's no email verification since there's no SMTP server involved), so keep that in mind if you're putting this on the open internet rather than behind a VPN/private network.

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
