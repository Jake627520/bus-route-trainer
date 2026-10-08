# Bus Route Trainer

Queensland Bus Driver Route Learning & Memory Trainer.

An independent, specialised training application engineered to help Queensland bus drivers quickly learn and retain unfamiliar bus routes, service variations, stop sequences, and depot driver knowledge.

> **Language & Locale Standard**: This project adheres to **Australian English (`en-AU`)** across all user interfaces, terminology (e.g. *timetables*, *depot*, *centre*, *specialised*), and user-facing documentation. The interface is also available in **Traditional Chinese (`zh-TW`)**.

---

## For Drivers — Using the App

### Do I need to install anything?

**No.** Bus Route Trainer is a website. There is no app to download from the App Store or Google Play. You only need a modern web browser (Safari, Chrome, Edge, or Firefox) and an internet connection.

It works on phones, tablets, and desktop computers.

### Quick start on your phone

1. Open your phone's browser and go to the site address your depot gave you.
2. Tap **Register** to create an account.
   - Choose a username.
   - **Email is optional**, but if you leave it blank you will **not** be able to reset a forgotten password. We recommend adding it.
   - Your password must meet the rules shown on screen (see [Password requirements](#password-requirements)).
3. Sign in.
4. From **All routes**, tap a route, then tap **Enrol** on the direction/variant you need to learn.
5. Tap **Start practice** and answer the questions.
6. Come back daily — the home screen shows what is due for review.

### Add it to your home screen (optional)

This makes the site open like an app, without the browser address bar.

- **iPhone / iPad (Safari)**: tap the **Share** button → **Add to Home Screen** → **Add**.
- **Android (Chrome)**: tap the **⋮** menu → **Add to Home screen** → **Add**.

> **Note**: this creates a shortcut only. The app still requires an internet connection — offline support is not yet implemented (see [Roadmap](#roadmap)).

### How practice works

Practice uses **active recall** with a **spaced repetition system (SRS)**:

- You are shown a hint (for example, a stop name) and must type the answer from memory.
- Cards you get right come back **less** often; cards you get wrong come back **sooner**.
- The home screen shows your **daily review queue**, **practice streak**, **accuracy**, and a **mastery trend**.

Two question modes are used:

| Mode | What you are asked |
|---|---|
| **Next stop** | Given the current stop, name the stop that comes next |
| **Station identification** | Given a position in the route, name that stop |

### Password requirements

| Rule | Requirement |
|---|---|
| Length | At least **8** characters (12 or more recommended) |
| Lowercase | At least one `a-z` |
| Uppercase | At least one `A-Z` |
| Special character | At least one of `!@#$%^&*()_+-=[]{}\|;:,.<>?` |
| Digits | Optional |
| Common passwords | Blocked (e.g. `Password!1`) |

Forgot your password? Tap **Forgot password?** on the sign-in page. A reset link is emailed to you and is valid for **1 hour**, single use. This only works if you registered an email address.

### ⚠️ Safety notice

**Never use this app while driving.** It is a study tool for use before or after your shift.

Timetables, route alignments, and stop sequences come from periodic snapshots of open data and **may be out of date**. During actual operation, always follow official Translink depot notices, master run sheets, and radio dispatch instructions. See [`DISCLAIMER.md`](./DISCLAIMER.md).

---

## For Developers

### Software you need to install

| Software | Why | Notes |
|---|---|---|
| **Docker Desktop** | Runs the app and PostgreSQL in containers | **Required.** macOS/Windows/Linux. After install, ensure `docker` is on your `PATH` (on macOS it may be at `~/.docker/bin`) |
| **Git** | Clone the repository | Pre-installed on macOS/Linux; Windows users install Git for Windows |

That is all. **Node.js and PostgreSQL are *not* installed on your machine** — they run inside the container. This keeps every environment identical.

> **Project rule**: never run `node` / `npm` directly on the host. The database only exists inside Docker, so host runs will fail or behave inconsistently. See [`AGENTS.md`](./AGENTS.md).

Optional: an editor with Dev Containers support (VS Code, Cursor, or Antigravity) lets you use **Reopen in Container** for a fully configured shell.

### Setup SOP

```bash
# 1. Clone
git clone https://github.com/Jake627520/bus-route-trainer.git
cd bus-route-trainer

# 2. Create your local environment file
cp .env.example .env
```

Then edit `.env`. For local development, point both database URLs at the container's database and set an auth secret:

```bash
DATABASE_URL="postgresql://postgres:postgres@db:5432/bus_route_trainer"
DIRECT_URL="postgresql://postgres:postgres@db:5432/bus_route_trainer"
AUTH_SECRET="<output of: openssl rand -base64 32>"
```

```bash
# 3. Start the database
docker compose up -d db

# 4. Apply the schema
docker compose run --rm app npx prisma migrate deploy

# 5. Start the dev server
docker compose run --rm --service-ports app npm run dev -- -H 0.0.0.0
```

Open <http://localhost:3000>, register an account, and you are in.

> The route list is empty until you import GTFS data — see [Importing transport data](#importing-transport-data).

### Everyday commands

| Task | Command |
|---|---|
| Run tests | `docker compose run --rm app npm test` |
| Lint | `docker compose run --rm app npx eslint .` |
| Production build | `docker compose run --rm app npx next build` |
| Regenerate Prisma client | `docker compose run --rm app npx prisma generate` |
| Stop everything | `docker compose down` |
| Stop **and wipe the database** | `docker compose down -v` |

> Tests run serially (`--fileParallelism=false`) because integration tests share one database.

### Importing transport data

Download a GTFS feed from [Translink Open Data](https://translink.com.au/about-translink/open-data), unzip it, then:

```bash
# Buses only (recommended first import)
docker compose run --rm app npx tsx scripts/import-gtfs.ts ./path-to-gtfs --bus-only

# Other modes, with a cap on how many routes are imported
docker compose run --rm app npx tsx scripts/import-gtfs.ts ./path-to-gtfs --route-types=2,4 --max-routes=50
```

| Flag | Effect |
|---|---|
| `--bus-only` | Import bus routes only (GTFS route type 3) |
| `--route-types=2,4` | Import specific GTFS route types (2 = train, 3 = bus, 4 = ferry) |
| `--max-routes=N` | Cap the number of routes — useful to stay inside a free database tier |
| `--clear` | Delete existing GTFS tables before importing |

A scheduled GitHub Actions workflow refreshes the feed automatically; see `.github/workflows/gtfs-update.yml`.

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Cannot connect to the Docker daemon` | Docker Desktop is not running — start it |
| `Port 3000 is in use` | An old dev container is still up: `docker ps` then `docker rm -f <id>` |
| `Unknown argument` from Prisma | Stale generated client — run `npx prisma generate` inside the container |
| Build fails on `migrate` | `DIRECT_URL` is missing or pointed at a pooled connection; migrations need a direct connection |
| Redirected to `/login` in a loop | Cookies need HTTPS in production (`SameSite=Lax` + `Secure`) |

### Architecture & workflow

- **Stack**: Next.js 16 (App Router) · React 19 · TypeScript · Prisma 6 · PostgreSQL · Tailwind CSS v4 · Vitest
- **Method**: **OpenSpec (spec-first) + TDD**. Changes are specified in `openspec/changes/<id>/` and reviewed before coding; tests go red before implementation turns them green.
- **Data boundaries**: official GTFS data, application data, and driver personal knowledge are kept in separate bounded contexts.
- Deployment: [`DEPLOY.md`](./DEPLOY.md) · Handover notes: [`HANDOFF.md`](./HANDOFF.md) · Agent rules: [`AGENTS.md`](./AGENTS.md)

---

## Features

**Available now**

- **Route & variant discovery** — browse routes and enrol in specific directions/variants
- **Active recall practice** — next-stop and station-identification questions
- **Spaced repetition (SRS)** — adaptive review intervals driven by recall performance
- **Review dashboard** — daily review queue, practice streak, accuracy, and mastery trend
- **Accounts** — registration, sign-in, enforced password strength policy, and email password reset
- **Bilingual interface** — Australian English and Traditional Chinese
- **Multi-mode data** — bus, train, and ferry imports, with scheduled GTFS refresh

### Roadmap

- **Offline PWA support** — not yet implemented; an internet connection is currently required
- **Driver knowledge layer** — personal notes, hazards, and depot pointers (data model exists; UI pending)
- **Timetable & timing-point drills**
- **Multi-factor authentication (MFA)**

---

## Licensing, Copyright & Intellectual Property

This project keeps **three** things legally separate: the code, the transport data, and third-party branding.

### 1. Application source code — MIT

Copyright © 2026 Jake627520. Licensed under the **MIT Licence** — see [`LICENSE`](./LICENSE).

You may use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the code, provided the copyright notice and permission notice are retained. The software is provided "as is", without warranty of any kind.

### 2. Public transport data — CC BY 4.0 (separate licence)

Route, stop, trip, and timetable data is sourced from **Translink Queensland Open Data**, provided by the Department of Transport and Main Roads (Translink), Queensland Government, under [**Creative Commons Attribution 4.0 International (CC BY 4.0)**](https://creativecommons.org/licenses/by/4.0/).

> **Important**: the MIT licence covers the code **only**. It grants you **no rights** over the transport data. If you redistribute that data you must comply with CC BY 4.0 independently, including correct attribution to Translink.

Full details: [`DATA-LICENSE.md`](./DATA-LICENSE.md).

### 3. Trade marks & branding — not licensed

**Translink**, the Queensland Government, and the Department of Transport and Main Roads own their respective trade marks, logos, and visual identity. Those marks are **deliberately not used** in this application, and **no licence to use them is granted or implied** by the MIT licence.

Route numbers and stop names are factual identifiers used descriptively for training purposes; this does not imply endorsement.

### 4. Non-affiliation

This is an **independent community project**. It is **not** affiliated with, endorsed by, sponsored by, maintained by, or operated by Translink, the Department of Transport and Main Roads, or the Queensland Government.

### 5. No warranty & operational disclaimer

Provided "as is" with no warranty. Transport data is a periodic snapshot and may be inaccurate or outdated. **Drivers must always follow official depot notices, master run sheets, and radio dispatch instructions during actual operation.** Nothing here is operational advice.

Full text: [`DISCLAIMER.md`](./DISCLAIMER.md).

### 6. Your data

Accounts store a username, an optional email address, and a salted password hash — passwords are never stored in plain text. Practice history is tied to your account and used to schedule your reviews. Self-hosters are responsible for their own privacy obligations.

### Contributing

Contributions are accepted under the MIT Licence. By submitting a pull request you agree your contribution is licensed under the same terms, and you confirm you have the right to submit it. Follow the OpenSpec + TDD workflow described in [`AGENTS.md`](./AGENTS.md).
