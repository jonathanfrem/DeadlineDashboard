import { startTransition, useEffect, useState } from "react";
import type {
  DashboardViewResponse,
  HealthCheckResponse,
  JobRow,
  JobStatus,
  RoomSummary,
  WorkerIssue,
  WorkerStatusTotals
} from "@deadline-dashboard/contracts";

type DashboardDataState = {
  dashboard: DashboardViewResponse | null;
  error: string | null;
  health: HealthCheckResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
};

type JobFilter = "All" | JobStatus;

const jobFilters: JobFilter[] = [
  "All",
  "Failed",
  "Rendering",
  "Queued",
  "Pending"
];

const workerStatusOrder: Array<keyof WorkerStatusTotals> = [
  "rendering",
  "idle",
  "offline",
  "stalled"
];

const workerStatusLabels: Record<keyof WorkerStatusTotals, string> = {
  idle: "Idle",
  offline: "Offline",
  rendering: "Rendering",
  stalled: "Stalled",
  startingJob: "Starting Job",
  total: "Total",
  unknown: "Unknown"
};

const workerStatusColors: Record<keyof WorkerStatusTotals, string> = {
  idle: "var(--slate)",
  offline: "#5b6470",
  rendering: "var(--green)",
  stalled: "var(--red)",
  startingJob: "var(--blue)",
  total: "transparent",
  unknown: "var(--purple)"
};

const dashboardMeta = {
  madeBy: "Jonathan Fremstad",
  version: "v0.1.0"
};
const ISSUE_ROWS_PER_PAGE = 5;
const ISSUE_PAGE_ROTATION_MS = 10_000;

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatProgress(value: number | null): string {
  return value === null ? "No data" : `${Math.round(value)}%`;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    second: "2-digit",
    minute: "2-digit",
    month: "short"
  }).format(new Date(value));
}

function formatRelativeFreshness(value: string | null): string {
  if (!value) {
    return "Never";
  }

  const deltaSeconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 1000)
  );

  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }

  const deltaMinutes = Math.floor(deltaSeconds / 60);

  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  return `${deltaHours}h ago`;
}

function formatDuration(value: number | null): string {
  if (value === null) {
    return "Unknown";
  }

  const totalSeconds = Math.max(0, Math.round(value));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatRoomLabel(value: string): string {
  return value.replace(/^ula-/i, "").toUpperCase();
}

function formatIssueRoom(value: string | null): string {
  return value ? formatRoomLabel(value) : "Unassigned";
}

function getJobCount(jobs: JobRow[], filter: JobFilter): number {
  if (filter === "All") {
    return jobs.length;
  }

  return jobs.filter((job) => job.status === filter).length;
}

function getVisibleJobs(jobs: JobRow[], filter: JobFilter): JobRow[] {
  return filter === "All"
    ? jobs
    : jobs.filter((job) => job.status === filter);
}

function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  return fetch(url, { signal }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }

    return (await response.json()) as T;
  });
}

function buildRoomSegments(room: RoomSummary) {
  return workerStatusOrder
    .map((key) => ({
      key,
      value: room.totals[key]
    }))
    .filter((segment) => segment.value > 0);
}

function MetricCard(props: {
  accent: "blue" | "green" | "red" | "yellow" | "slate";
  label: string;
  meta?: string;
  value: string;
}) {
  return (
    <article className={`metric-card accent-${props.accent}`}>
      <span className="metric-label">{props.label}</span>
      <strong className="metric-value">{props.value}</strong>
      {props.meta ? <span className="metric-meta">{props.meta}</span> : null}
    </article>
  );
}

function StatusBadge(props: {
  tone: "danger" | "neutral" | "success" | "warning";
  value: string;
}) {
  return <span className={`status-badge tone-${props.tone}`}>{props.value}</span>;
}

function RoomCard({
  compact = false,
  room
}: {
  compact?: boolean;
  room: RoomSummary;
}) {
  const segments = buildRoomSegments(room);

  return (
    <article className={compact ? "room-card compact" : "room-card"}>
      <header className="room-card-header">
        <div>
          <h3>{compact ? formatRoomLabel(room.displayName) : room.displayName}</h3>
          {!compact ? <p>{room.poolName}</p> : null}
        </div>
        {compact ? (
          <span
            aria-label={`Room health ${room.health}`}
            className={`room-health-dot room-health-${room.health}`}
          />
        ) : (
          <StatusBadge
            tone={
              room.health === "red"
                ? "danger"
                : room.health === "yellow"
                  ? "warning"
                  : "success"
            }
            value={room.health}
          />
        )}
      </header>
      <div className="room-segment-bar" aria-hidden="true">
        {segments.length > 0 ? (
          segments.map((segment) => (
            <span
              key={segment.key}
              className={`segment segment-${segment.key}`}
              style={{
                width: `${(segment.value / room.totals.total) * 100}%`
              }}
            />
          ))
        ) : (
          <span className="segment segment-empty" style={{ width: "100%" }} />
        )}
      </div>
      <dl className="room-stats">
        {workerStatusOrder.map((key) => (
          <div key={key}>
            <dt>{workerStatusLabels[key]}</dt>
            <dd>{room.totals[key]}</dd>
          </div>
        ))}
      </dl>
      <div className="room-notes">
        <p className="room-note">
          {compact ? `Disabled ${room.disabledWorkers}` : `Disabled workers: ${room.disabledWorkers}`}
        </p>
        {room.unmatchedWorkerCount > 0 ? (
          <p className="room-note warning">
            {compact
              ? `${room.unmatchedWorkerCount} fallback`
              : `${room.unmatchedWorkerCount} worker${room.unmatchedWorkerCount === 1 ? "" : "s"} assigned via group fallback`}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function RoomsPanel({
  compact = false,
  rooms,
  unassignedWorkersCount
}: {
  compact?: boolean;
  rooms: RoomSummary[];
  unassignedWorkersCount: number;
}) {
  return (
    <section className={compact ? "panel rooms-panel compact" : "panel rooms-panel"}>
      <div className="panel-header">
        <div>
          <span className="panel-kicker">Rooms</span>
          <h2>Room and pool availability</h2>
        </div>
        <div className="panel-summary">
          <span>{rooms.length} configured rooms</span>
          <strong>
            {unassignedWorkersCount} unassigned worker
            {unassignedWorkersCount === 1 ? "" : "s"}
          </strong>
        </div>
      </div>
      <div className={compact ? "room-grid compact" : "room-grid"}>
        {rooms.map((room) => (
          <RoomCard compact={compact} key={room.roomKey} room={room} />
        ))}
      </div>
    </section>
  );
}

function WorkerBreakdown({
  totals
}: {
  totals: WorkerStatusTotals;
}) {
  const segments = workerStatusOrder
    .map((key) => ({
      color: workerStatusColors[key],
      key,
      value: totals[key]
    }))
    .filter((segment) => segment.value > 0);
  let currentAngle = 0;
  const gradientStops =
    segments.length > 0
      ? segments
          .map((segment) => {
            const start = currentAngle;
            const slice = (segment.value / totals.total) * 360;
            currentAngle += slice;
            return `${segment.color} ${start}deg ${currentAngle}deg`;
          })
          .join(", ")
      : "#202631 0deg 360deg";

  return (
    <div className="breakdown-chart-layout">
      <div className="donut-wrap">
        <div
          aria-hidden="true"
          className="donut-chart"
          style={{
            background: `conic-gradient(${gradientStops})`
          }}
        />
        <div className="donut-center">
          <strong>{totals.total}</strong>
          <span>Workers</span>
        </div>
      </div>
      <div className="breakdown-list">
        {workerStatusOrder.map((key) => {
          const value = totals[key];
          const share =
            totals.total > 0 ? `${Math.round((value / totals.total) * 100)}%` : "0%";

          return (
            <div className="breakdown-row" key={key}>
              <div className="breakdown-label-row">
                <div className="breakdown-label-with-dot">
                  <span
                    className={`legend-dot segment-${key}`}
                  />
                  <span>{workerStatusLabels[key]}</span>
                </div>
                <strong>{value}</strong>
              </div>
              <span className="breakdown-share">{share}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkerIssuesPanel({
  issues,
  lookbackMinutes
}: {
  issues: WorkerIssue[];
  lookbackMinutes: number;
}) {
  const pageCount = Math.max(1, Math.ceil(issues.length / ISSUE_ROWS_PER_PAGE));
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [issues.length]);

  useEffect(() => {
    if (pageCount <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setPageIndex((current) => (current + 1) % pageCount);
    }, ISSUE_PAGE_ROTATION_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [pageCount]);

  const visibleIssues = issues.slice(
    pageIndex * ISSUE_ROWS_PER_PAGE,
    (pageIndex + 1) * ISSUE_ROWS_PER_PAGE
  );

  return (
    <section className="panel service-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker"></span>
          <h2>Machines needing attention</h2>
          <p className="panel-caption">
        Recent worker errors seen in the last {lookbackMinutes} minutes.
      </p>
        </div>
        <strong>{issues.length}</strong>
        
      </div>
      
      {issues.length === 0 ? (
        <div className="issues-empty">
          <p>No recent worker errors were found in the current lookback window.</p>
        </div>
      ) : (
        <>
          <div className="issues-list paged">
            {visibleIssues.map((issue) => (
              <article className="issue-row compact" key={issue.workerName}>
                <div className="issue-primary">
                  <strong>{issue.workerName}</strong>
                  <span>{formatIssueRoom(issue.roomKey)}</span>
                  {issue.disabled ? (
                    <span className="issue-flag">Disabled</span>
                  ) : null}
                </div>
                <div className="issue-secondary">
                  <span>{formatRelativeFreshness(issue.lastErrorAt)}</span>
                  <StatusBadge
                    tone={issue.level === "critical" ? "danger" : "warning"}
                    value={`${issue.errorCount} error${issue.errorCount === 1 ? "" : "s"}`}
                  />
                </div>
              </article>
            ))}
          </div>
          <div className="issues-pagination">
            {pageCount > 1 ? (
              <span>
                Page {pageIndex + 1}/{pageCount}
              </span>
            ) : (
              <span>Page 1/1</span>
            )}
            <span>
              {issues.length} machine{issues.length === 1 ? "" : "s"} total
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function JobsTable({
  jobs,
  selectedFilter,
  onFilterChange
}: {
  jobs: JobRow[];
  onFilterChange: (filter: JobFilter) => void;
  selectedFilter: JobFilter;
}) {
  const visibleJobs = getVisibleJobs(jobs, selectedFilter);

  return (
    <section className="panel jobs-panel">
      <div className="panel-header panel-header-wrap">
        <div>
          <span className="panel-kicker">Jobs</span>
          <h2>Queue and Render Activity</h2>
        </div>
        <div className="filter-row">
          {jobFilters.map((filter) => (
            <button
              key={filter}
              className={
                filter === selectedFilter ? "filter-chip active" : "filter-chip"
              }
              onClick={() => onFilterChange(filter)}
              type="button"
            >
              {filter}
              <span>{getJobCount(jobs, filter)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="table-scroll">
        <table className="jobs-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Status</th>
              <th>Comment</th>
              <th>Progress</th>
              <th>Runtime</th>
              <th>Remaining</th>
              <th>Pool</th>
              <th>Workers</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {visibleJobs.map((job) => (
              <tr key={job.jobId}>
                <td>
                  <div className="job-primary">
                    <strong>{job.name}</strong>
                    <span>{job.jobId}</span>
                  </div>
                </td>
                <td>
                  <span
                    className={`table-status status-${job.status.toLowerCase()}`}
                  >
                    {job.status}
                  </span>
                </td>
                <td>{job.comment ?? "No comment"}</td>
                <td>
                  <div className="progress-cell">
                    <span>{formatProgress(job.progressPercent)}</span>
                    <div className="progress-track">
                      <span
                        className={`progress-fill status-${job.status.toLowerCase()}`}
                        style={{
                          width: `${job.progressPercent ?? 0}%`
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td>{formatDuration(job.runtimeSeconds)}</td>
                <td>{formatDuration(job.estimatedRemainingSeconds)}</td>
                <td>{job.pool ?? "Unknown"}</td>
                <td>{job.activeWorkersCount ?? "N/A"}</td>
                <td>{formatDateTime(job.submittedAt)}</td>
              </tr>
            ))}
            {visibleJobs.length === 0 ? (
              <tr>
                <td className="empty-cell" colSpan={9}>
                  No jobs in the queue right now.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function App() {
  const [state, setState] = useState<DashboardDataState>({
    dashboard: null,
    error: null,
    health: null,
    isLoading: true,
    isRefreshing: false
  });
  const [selectedFilter, setSelectedFilter] = useState<JobFilter>("All");

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    const loadData = async (background: boolean) => {
      if (background) {
        setState((current) => ({ ...current, isRefreshing: true }));
      } else {
        setState((current) => ({ ...current, error: null, isLoading: true }));
      }

      try {
        const [dashboard, health] = await Promise.all([
          fetchJson<DashboardViewResponse>("/api/dashboard", controller.signal),
          fetchJson<HealthCheckResponse>("/api/health", controller.signal)
        ]);

        if (!mounted) {
          return;
        }

        startTransition(() => {
          setState({
            dashboard,
            error: null,
            health,
            isLoading: false,
            isRefreshing: false
          });
        });
      } catch (error) {
        if (!mounted || controller.signal.aborted) {
          return;
        }

        setState((current) => ({
          ...current,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load dashboard data.",
          health: current.health,
          isLoading: false,
          isRefreshing: false
        }));
      }
    };

    void loadData(false);
    const interval = window.setInterval(() => {
      void loadData(true);
    }, (state.health?.cache.pollIntervalSeconds ?? 15) * 1000);

    return () => {
      mounted = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [state.health?.cache.pollIntervalSeconds]);

  if (state.isLoading && !state.dashboard) {
    return (
      <main className="loading-shell">
        <section className="loading-card">
          <span className="panel-kicker">Deadline Dashboard</span>
          <h1>Loading farm data</h1>
          <p>Connecting to the backend and shaping the latest farm snapshot.</p>
        </section>
      </main>
    );
  }

  if (!state.dashboard || !state.health) {
    return (
      <main className="loading-shell">
        <section className="loading-card">
          <span className="panel-kicker">Deadline Dashboard</span>
          <h1>Dashboard unavailable</h1>
          <p>{state.error ?? "No data has been loaded yet."}</p>
        </section>
      </main>
    );
  }

  const { dashboard, health } = state;
  const sourceTone =
    dashboard.source === "live" && !dashboard.summary.isStale
      ? "success"
      : dashboard.summary.isStale
        ? "warning"
        : "neutral";

  return (
    <div className="dashboard-shell">
      <main className="content">
        <header className="topbar">
          <div>
            <span className="panel-kicker"></span>
            <h1>Deadline Farm Status</h1>
            <p>
              Updated {formatDateTime(dashboard.capturedAt)}. Polling every{" "}
              {health.cache.pollIntervalSeconds}s.
            </p>
          </div>
          <div className="topbar-actions">
            <StatusBadge tone={sourceTone} value={dashboard.summary.isStale ? "Stale" : dashboard.source} />
            <StatusBadge
              tone={health.deadline.reachable ? "success" : "danger"}
              value={health.deadline.reachable ? "Deadline reachable" : "Deadline offline"}
            />
            <button
              className="refresh-button"
              onClick={() => window.location.reload()}
              type="button"
            >
              {state.isRefreshing ? "Refreshing..." : "Reload"}
            </button>
          </div>
        </header>

        {state.error ? (
          <section className="alert-banner">
            <strong>Refresh issue</strong>
            <span>{state.error}</span>
          </section>
        ) : null}

        {health.deadline.lastError ? (
          <section className="alert-banner warning">
            <strong>Deadline response warning</strong>
            <span>{health.deadline.lastError}</span>
          </section>
        ) : null}

        <section className="metrics-grid">
          <MetricCard
            accent="green"
            label="Rendering Workers"
            meta={`${dashboard.summary.onlineWorkers} online`}
            value={formatNumber(dashboard.summary.totals.rendering)}
          />
          <MetricCard
            accent="slate"
            label="Idle Capacity"
            meta="Ready to pick up work"
            value={formatNumber(dashboard.summary.totals.idle)}
          />
          <MetricCard
            accent="yellow"
            label="Queued Jobs"
            meta={`${dashboard.summary.jobs.pending} pending`}
            value={formatNumber(dashboard.summary.jobs.queued)}
          />
          <MetricCard
            accent="red"
            label="Failed Jobs"
            meta="Needs operator review"
            value={formatNumber(dashboard.summary.jobs.failed)}
          />
          <MetricCard
            accent="red"
            label="Stalled Workers"
            meta={`${dashboard.summary.roomsWithIssues.length} rooms with issues`}
            value={formatNumber(dashboard.summary.totals.stalled)}
          />
        </section>

        <section className="content-grid">
          <JobsTable
            jobs={dashboard.jobs}
            onFilterChange={setSelectedFilter}
            selectedFilter={selectedFilter}
          />

          <div className="side-column">
            <section className="panel service-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Farm status</span>
                  <h2>Worker breakdown</h2>
                </div>
                <strong>{formatNumber(dashboard.summary.totals.total)}</strong>
              </div>
              <WorkerBreakdown totals={dashboard.summary.totals} />
            </section>

            <WorkerIssuesPanel
              issues={dashboard.workerIssues}
              lookbackMinutes={dashboard.workerIssuesLookbackMinutes}
            />

            <RoomsPanel
              compact
              rooms={dashboard.rooms}
              unassignedWorkersCount={dashboard.unassignedWorkersCount}
            />
          </div>
        </section>

        <footer className="dashboard-footer">
          <span>{dashboardMeta.version}</span>
          <span>Made by {dashboardMeta.madeBy}</span>
          <span>Kristiania 2026</span>

        </footer>
      </main>
    </div>
  );
}
