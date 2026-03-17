# Phase 1 Foundation Summary

## What This Phase Adds
- A TypeScript workspace with:
  - `client/` placeholder React app
  - `server/` Express API
  - `packages/contracts/` shared dashboard contracts
- A read-only Deadline integration layer that fetches workers, jobs, pools, and groups.
- A minimal SQLite cache foundation for current-state payloads and future farm snapshots.
- Dashboard-oriented API routes for summary, jobs, and room views.

## Deadline Endpoints Used
- `GET /api/slaves?Data=info`
  - runtime worker state including `Stat`
- `GET /api/slaves?Data=infosettings`
  - worker pool/group metadata used for room grouping
- `GET /api/jobs?States=Active,Failed,Pending,Suspended`
  - current active, queued, failed, pending, and suspended jobs
- `GET /api/pools`
  - validation that configured room pools exist upstream
- `GET /api/groups`
  - fallback metadata and diagnostics only

## Normalization Rules
- Workers:
  - `1 => rendering`
  - `2 => idle`
  - `3 => offline`
  - `4 => stalled`
  - `8 => startingJob`
  - everything else => `unknown`
- Jobs:
  - `Stat=4 => Failed`
  - `Stat=6 => Pending`
  - `Stat=2 => Suspended`
  - `Stat=1` with `RenderingChunks > 0 => Rendering`
  - `Stat=1` with `RenderingChunks = 0 => Queued`
  - everything else => `Unknown`
- Utilization:
  - `rendering / total workers`
- Online workers:
  - `rendering + startingJob + idle`

## Room Mapping
- Canonical room order in Phase 1:
  - `ula-501b`
  - `ula-501c`
  - `ula-502`
- Assignment strategy:
  - first matching pool wins
  - if no pool matches, matching group is used as a compatibility fallback
  - if neither matches, the worker is marked `unassigned`
- Room summaries include `unmatchedWorkerCount` for workers assigned through the group fallback.
- `/api/dashboard/rooms` also includes:
  - `unassignedWorkersCount`
  - `poolValidationWarnings`

## API Surface Ready For Phase 2
- `GET /api/health`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/jobs`
- `GET /api/dashboard/rooms`

## SQLite Foundation
- `resource_cache`
  - stores current normalized payloads for `dashboard_snapshot`, `summary`, `jobs`, and `rooms`
- `farm_snapshots`
  - reserved for future history work
  - currently receives summary snapshots during successful refreshes

## Still To Verify Against The Live Farm
- Whether `/api/jobs` exposes enough data for `activeWorkersCount` and `estimatedCompletionAt` without per-job follow-up requests.
- Whether the real worker metadata always includes both pool and group values in `Data=infosettings`.
- Whether any production worker/job payloads use alternate field names that should be added to the extractor helpers.
- Whether Deadline Web Service authentication is enabled on the actual Mac mini environment.
