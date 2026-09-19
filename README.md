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

Syllabase runs entirely on your own infrastructure via Docker Compose — a self-hosted Supabase stack (Postgres, auth, REST API, edge functions) plus the frontend, no external accounts or SaaS dependencies required.

### Quickstart

```sh
cp .env.example .env
cp accounts.env.example accounts.env
```

Edit `.env`: set `POSTGRES_PASSWORD`, generate `JWT_SECRET`/`ANON_KEY`/`SERVICE_ROLE_KEY`/`CRON_SECRET`, and set `SITE_URL`/`VITE_SUPABASE_URL` to your actual domain(s). See the comments in `.env.example` for exactly what each value needs to be and how to generate the JWT-based keys.

Edit `accounts.env`: list the username/password pairs for whoever should have an account. There's no public sign-up page — this file *is* the account system.

```sh
docker compose up -d
```

That's it — Postgres, auth, the REST API, the 4 edge functions, and the frontend all come up together, migrations apply automatically, and your accounts get created. `frontend` and `seed-accounts` pull prebuilt images from GHCR by default (published by the [Release workflow](.github/workflows/release.yml) on every tagged version) — nothing to build yourself unless you want to. Run `docker compose build` instead if you'd rather build from source, or are working from an unreleased commit.

### Resetting a password

Edit `accounts.env`, then:

```sh
docker compose up -d seed-accounts
```

No email, no SMTP server, no admin panel — editing the file *is* the reset mechanism.

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
- Username/password accounts, provisioned by whoever runs the instance (see Self-hosting above) — no public signup.
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
- **Backend / DB**: Self-hosted Supabase (Postgres + GoTrue auth + PostgREST + Edge Functions), fronted by Kong
- **Deployment**: Docker Compose
