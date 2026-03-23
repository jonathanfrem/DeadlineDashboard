export type DashboardSource = "live" | "cache";
export type RoomHealth = "green" | "yellow" | "red";
export type JobStatus =
  | "Failed"
  | "Pending"
  | "Queued"
  | "Rendering"
  | "Suspended"
  | "Unknown";

export interface WorkerStatusTotals {
  total: number;
  rendering: number;
  startingJob: number;
  idle: number;
  offline: number;
  stalled: number;
  unknown: number;
}

export interface FarmJobTotals {
  total: number;
  rendering: number;
  queued: number;
  pending: number;
  failed: number;
  suspended: number;
  unknown: number;
}

export interface FarmOverviewSummary {
  lastUpdatedAt: string;
  pollIntervalSeconds: number;
  isStale: boolean;
  totals: WorkerStatusTotals;
  onlineWorkers: number;
  utilization: number;
  jobs: FarmJobTotals;
  roomsWithIssues: string[];
}

export interface RoomSummary {
  roomKey: string;
  displayName: string;
  poolName: string;
  totals: WorkerStatusTotals;
  disabledWorkers: number;
  utilization: number;
  health: RoomHealth;
  unmatchedWorkerCount: number;
}

export interface JobRow {
  comment: string | null;
  jobId: string;
  name: string;
  user: string | null;
  status: JobStatus;
  statusCode: number | null;
  progressPercent: number | null;
  submittedAt: string | null;
  startedAt: string | null;
  pool: string | null;
  group: string | null;
  renderingChunks: number | null;
  activeWorkersCount: number | null;
  estimatedCompletionAt: string | null;
  runtimeSeconds: number | null;
  estimatedRemainingSeconds: number | null;
}

export interface WorkerIssue {
  disabled: boolean;
  errorCount: number;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  level: "critical" | "warning";
  roomKey: string | null;
  workerDisplayName: string;
  workerName: string;
}

export interface DashboardSnapshot {
  summary: FarmOverviewSummary;
  rooms: RoomSummary[];
  jobs: JobRow[];
  workerIssues: WorkerIssue[];
  capturedAt: string;
  source: DashboardSource;
}

export interface DashboardRoomsResponse {
  rooms: RoomSummary[];
  capturedAt: string;
  source: DashboardSource;
  unassignedWorkersCount: number;
  poolValidationWarnings: string[];
}

export interface DashboardViewResponse {
  capturedAt: string;
  jobs: JobRow[];
  poolValidationWarnings: string[];
  rooms: RoomSummary[];
  source: DashboardSource;
  summary: FarmOverviewSummary;
  unassignedWorkersCount: number;
  workerIssues: WorkerIssue[];
  workerIssuesLookbackMinutes: number;
}

export interface HealthCheckResponse {
  status: "ok" | "degraded";
  app: {
    uptimeSeconds: number;
  };
  database: {
    connected: boolean;
    path: string;
  };
  deadline: {
    configured: boolean;
    reachable: boolean;
    lastError: string | null;
  };
  cache: {
    lastSuccessfulRefreshAt: string | null;
    lastAttemptedRefreshAt: string | null;
    pollIntervalSeconds: number;
    staleAfterSeconds: number;
    hasSnapshot: boolean;
  };
}
