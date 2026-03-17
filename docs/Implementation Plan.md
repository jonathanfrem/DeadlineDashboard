# Deadline Dashboard — Implementation Plan

## Project Summary
Build an internal, read-only dashboard for a Direct Repository Thinkbox Deadline render farm using Deadline Web Service.

The dashboard will:
- run on a Mac mini
- be accessible internally on LAN
- be operator-friendly but also understandable for students
- support a wall/TV mode from the start
- focus on live current-state visibility first
- use SQLite for local persistence/caching/snapshots

## Core Product Goal
Give technical operators and room users a clear live view of:
- what the farm is doing now
- what jobs are active/queued
- how healthy each room/pool is
- whether there are failed jobs or stalled workers

This is a read-only monitoring dashboard, not a control panel.

## Confirmed Product Decisions

### Audience
- Jonathan
- technical operators
- student-friendly enough for wall display

### Current pools / groups
- `ula-501b`
- `ula-501c`
- `ula-502`

### V1 priorities
- live farm health overview
- one combined jobs table with status
- active + queued job visibility
- room/pool-level machine availability
- total farm utilization
- failed jobs visibility
- stalled workers visibility
- 10–30 second auto-refresh
- TV/wall mode from the start

### Utilization definition
Use:
- **rendering workers / total workers**

Offline/stalled should be visualized separately.

### Auth
- none for v1
- LAN-only access

### Database
- **SQLite**
- single-host simplicity on Mac mini
- used for cache + future snapshots/history

## Deadline API / Web Service Notes
The dashboard should use Deadline Web Service as the primary live data source.

Important worker state detail confirmed from the docs:
- `Stat (SlaveStatus)` values include:
  - `1 = Rendering`
  - `2 = Idle`
  - `3 = Offline`
  - `4 = Stalled`
  - `8 = StartingJob`

This means stalled can be handled directly in v1, not only through custom heuristics.

## Recommended Architecture

### Frontend
- React
- dashboard-first layout
- readable both on desktop and wall display
- polling-based updates every 10–30 seconds

### Backend
- Node + Express
- talks to Deadline Web Service
- normalizes job/worker/pool data into frontend-friendly shapes
- runs optional helper scripts if needed later

### Database
- SQLite
- stores:
  - cached current state
  - optional snapshots
  - room/pool metadata if needed later
  - future history/trend data

## Data Layers
Design around two data layers:

### 1. Current state (v1)
- jobs currently active
- jobs currently queued
- worker totals
- worker totals by pool/room
- failed job count
- stalled worker count
- utilization values
- last updated timestamp

### 2. Historical snapshots (later)
- utilization over time
- worker state totals over time
- job counts over time
- failed/stalled trend data

That way history can be added without redesigning the app.

## Suggested V1 Pages

### 1. Main dashboard
Primary operator view.

Contains:
- top summary metrics
- room/pool health section
- combined jobs table
- last updated indicator

### 2. TV / wall mode
Uses the same data, but with a presentation optimized for passive viewing.

Priorities:
- large text
- large status indicators
- room health at a glance
- active jobs visibility
- failed/stalled visibility
- no dense controls

## Suggested V1 Dashboard Layout

### Top summary row
- total utilization
- total rendering workers
- total online workers
- total offline workers
- total stalled workers
- failed jobs count
- queued jobs count

### Room / pool health section
One panel per room:
- `ula-501b`
- `ula-501c`
- `ula-502`

Each panel shows:
- total workers
- rendering workers
- idle workers
- offline workers
- stalled workers
- room health color

### Combined jobs table
Columns:
- job name
- user
- status
- progress %
- submit time
- ETA / expected finish
- active workers
- pool/group if useful

The table should be sortable and readable, but read-only.

### Footer / metadata
- last updated timestamp
- current poll interval
- stale-data warning if backend hasn’t updated recently

## Health / Color Logic
Room health should use clear colors.

Suggested initial approach:
- **green** = most machines available/healthy
- **yellow** = noticeable degradation
- **red** = significant issues / many unavailable or stalled

Important requirement:
- thresholds should be configurable
- do not hardcode room health cutoffs deep in the UI

## V1 Functional Requirements

### Farm overview
- show total worker counts by status
- calculate total utilization
- show failed jobs count
- show stalled worker count

### Room summary
- group workers by pool/room
- show room-level health summaries
- apply room color state from configurable thresholds

### Jobs view
- combined jobs table with status
- include active + queued jobs in one view
- show progress and active worker counts

### Refresh behavior
- poll every 10–30 seconds
- show last successful update time
- show warning if data is stale

### Read-only behavior
- no write actions
- no job control actions
- no worker control actions

## Suggested V2 / Later
- worker page per room/pool
- detailed worker/machine table
- historical charts and trends
- issue/failure-focused views
- alerting logic
- auto-rotating TV mode if useful
- helper-script-based richer metrics

## Implementation Phases

## Phase 1 — Technical spike / API shaping
Goal:
- confirm Deadline Web Service endpoints and payloads needed for jobs + workers + pools
- confirm pool/group mapping quality
- verify worker `Stat` values in practice
- shape normalized backend models

Deliverable:
- backend can fetch and normalize current jobs and workers from Deadline

## Phase 2 — Backend foundation
Goal:
- create Express backend
- create SQLite DB
- implement polling/cache layer
- normalize:
  - jobs
  - workers
  - room summaries
  - farm summary

Deliverable:
- API endpoints for dashboard data

## Phase 3 — Frontend dashboard
Goal:
- build main dashboard UI
- build combined jobs table
- build room summary cards
- build summary metrics row
- add polling refresh + stale indicator

Deliverable:
- working operator dashboard

## Phase 4 — TV / wall mode
Goal:
- build large-format view
- simplify for passive visibility
- optimize for room display

Deliverable:
- static wall view using same backend data

## Phase 5 — Optional helpers / hardening
Goal:
- helper scripts if needed
- polish health calculations
- improve error handling
- prepare for future historical snapshots

## Suggested Tech Stack
- React frontend
- Node/Express backend
- SQLite database
- polling refresh (10–30s)
- chart library for summary visuals if needed later

## Acceptance Criteria for V1
V1 is successful when the dashboard can:
- show current farm health live
- show a combined jobs table with status
- show room/pool health for `ula-501b`, `ula-501c`, `ula-502`
- show failed jobs count
- show stalled workers count
- auto-refresh on an interval
- offer a readable TV/wall mode
- remain read-only and LAN-only
