# Deadline Dashboard

Internal read-only dashboard for a Thinkbox Deadline render farm.

This project is intended to run on a local machine on the same network as the Deadline Web Service. It gives operators and students a quick live view of:

- current farm status
- room and pool availability
- active, queued, pending, and recent failed jobs
- stalled or offline workers
- machines that may need attention due to recent worker errors

The app is intentionally read-only. It does not send control commands back to Deadline.

## What It Does

The dashboard is split into two parts:

- `server/`
  An Express backend that talks to Deadline Web Service, normalizes the raw Deadline payloads, and serves dashboard-ready data.
- `client/`
  A React frontend that renders the dashboard UI.

The backend also uses SQLite for lightweight local storage so it can:

- cache the latest normalized snapshot
- survive brief Deadline outages more gracefully
- keep a simple foundation for future history/snapshots

## Current Features

- read-only dashboard UI
- automatic polling
- room summaries based on configured pool names
- job table with progress, runtime, remaining time, and recent failed jobs
- worker breakdown
- disabled workers shown separately and excluded from capacity totals
- recent worker issue detection based on Deadline worker reports
- local `.env` support

## Project Structure

```text
client/               React + Vite frontend
server/               Express + TypeScript backend
packages/contracts/   Shared TypeScript contracts
docs/                 Planning and project notes
```

## Requirements

- Node.js 20+ recommended
- npm
- Deadline Web Service installed and reachable

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create your local `.env`

Copy `.env.example` to `.env` and adjust values for your environment.

Example:

```env
DEADLINE_BASE_URL=https://127.0.0.1:4434
DEADLINE_TLS_INSECURE=true
DATABASE_PATH=./server/data/deadline-dashboard.sqlite
FAILED_JOBS_LOOKBACK_HOURS=12
HOST=0.0.0.0
WORKER_ISSUES_LOOKBACK_MINUTES=30
WORKER_DISPLAY_NAMES_PATH=./config/worker-display-names.json
POLL_INTERVAL_SECONDS=15
STALE_AFTER_SECONDS=45
ROOM_KEYS=ula-501b,ula-501c,ula-502
PORT=3001
```

The backend automatically loads the repo root `.env`.

### 3. Run database migration

```bash
npm run db:migrate
```

### 4. Start the dashboard

```bash
npm run dev
```

That starts:

- backend on `http://localhost:3001`
- frontend on `http://localhost:5173`

The Vite frontend proxies `/api` requests to the backend.

Because the dev servers now bind to `0.0.0.0`, you can also open the dashboard from another machine on the same network using the Mac mini's LAN IP:

```text
http://<mac-mini-ip>:5173
```

## Running Deadline Web Service

This dashboard expects Deadline Web Service to already be installed and running.

For a same-machine local test, a simple command is:

```bash
/Applications/Thinkbox/Deadline10/Resources/deadlinewebservice -local_only -port 8081
```

Depending on your Deadline setup, the service may still listen on HTTPS. In that case, a typical local base URL is:

```text
https://127.0.0.1:4434
```

You can sanity-check the service with:

```bash
curl -k https://127.0.0.1:4434/api/pools
```

If that returns JSON, the dashboard backend should be able to connect when `DEADLINE_BASE_URL` is set correctly.

## Configuration

### Required / important

- `DEADLINE_BASE_URL`
  Base URL for Deadline Web Service.

- `DEADLINE_TLS_INSECURE`
  Set to `true` for local/self-signed HTTPS testing. When enabled, the backend disables TLS certificate verification for Deadline requests.

- `DATABASE_PATH`
  Path to the SQLite file used for cache/snapshot storage.

- `HOST`
  Host interface for the backend. Use `0.0.0.0` to allow access from other machines on the LAN.

### Polling and freshness

- `POLL_INTERVAL_SECONDS`
  How often the dashboard refreshes its data. Default: `15`

- `STALE_AFTER_SECONDS`
  How long data can go without a successful refresh before it is considered stale. Default: `45`

### Dashboard behavior

- `ROOM_KEYS`
  Comma-separated list of room/pool keys shown in the room panel.

- `FAILED_JOBS_LOOKBACK_HOURS`
  Failed jobs older than this are hidden from the dashboard. Default: `12`

- `WORKER_ISSUES_LOOKBACK_MINUTES`
  How far back to look for recent worker issues from Deadline worker reports. Default: `30`

- `WORKER_DISPLAY_NAMES_PATH`
  Optional path to a JSON file that maps Deadline worker names to human-friendly labels for the issue view. If unset, the backend also checks `./config/worker-display-names.json`.

- `PORT`
  Backend port. Default: `3001`

### Worker Display Name Mapping

Create `config/worker-display-names.json` to show a friendlier machine label in the worker issues panel while still keeping the raw Deadline worker name internally.

Example:

```json
{
  "EGMSU9-FARM05": "501B-05",
  "EGMSU9-FARM06": "501B-06",
  "EGMSU9-FARM21": "502-01"
}
```

Matching is case-insensitive, so `EGMSU9-FARM05` and `egmsu9-farm05` are treated the same.

## API Routes

The backend exposes read-only routes:

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/jobs`
- `GET /api/dashboard/rooms`

These routes return normalized dashboard data. The frontend does not consume raw Deadline payloads directly.

## Useful Commands

```bash
npm run dev
npm run db:migrate
npm run update:start
npm test
npm run typecheck
npm run build
```

`npm run update:start` runs the full update flow for the TV machine: `git pull`, rebuilds the app, runs database migrations, and starts the production server.

## Production / LAN Access

For production on the Mac mini, build the app and start the backend:

```bash
npm run build
npm run db:migrate
npm run start --workspace server
```

In production mode, the Express server serves the built React app from `client/dist`, so other machines on the same network can open:

```text
http://<mac-mini-ip>:3001
```

Before testing from another machine, make sure:

- `HOST=0.0.0.0` is set
- macOS firewall allows incoming connections for Node if prompted
- the other machine can reach the Mac mini on the same LAN

## Notes About Data Handling

- worker rooms are assigned pool-first using `ROOM_KEYS`
- group matching is only used as a fallback
- disabled workers are shown separately and excluded from total worker/capacity counts
- failed jobs are intentionally limited to a recent time window
- worker issue detection is separate from room availability

## Troubleshooting

### Deadline is reachable in `curl`, but not in the dashboard

Check:

- `DEADLINE_BASE_URL` matches the actual Deadline Web Service URL
- `.env` exists at the repo root
- `DEADLINE_TLS_INSECURE=true` is set if you are using a self-signed local HTTPS certificate

### Dashboard shows stale data

That usually means the backend could not complete a fresh Deadline refresh and is serving the latest cached snapshot instead.

Check:

- Deadline Web Service is still running
- the configured base URL is correct
- network/TLS settings are still valid

### Room mapping looks wrong

Check that `ROOM_KEYS` matches the actual Deadline pool names exactly.

## Status

This project is still evolving, but the current implementation already supports a practical live operations dashboard for the render farm.
