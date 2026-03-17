import type {
  FarmJobTotals,
  JobRow,
  JobStatus,
  WorkerStatusTotals
} from "@deadline-dashboard/contracts";
import type { DeadlineRecord, WorkerAssignment } from "./types.js";

const workerStatusBuckets: (keyof WorkerStatusTotals)[] = [
  "rendering",
  "startingJob",
  "idle",
  "offline",
  "stalled",
  "unknown"
];

const jobStatuses: JobStatus[] = [
  "Failed",
  "Rendering",
  "Queued",
  "Pending",
  "Suspended",
  "Unknown"
];

export function createEmptyWorkerTotals(): WorkerStatusTotals {
  return {
    total: 0,
    rendering: 0,
    startingJob: 0,
    idle: 0,
    offline: 0,
    stalled: 0,
    unknown: 0
  };
}

export function createEmptyJobTotals(): FarmJobTotals {
  return {
    total: 0,
    rendering: 0,
    queued: 0,
    pending: 0,
    failed: 0,
    suspended: 0,
    unknown: 0
  };
}

export function extractString(
  record: DeadlineRecord,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return null;
}

export function extractNumber(
  record: DeadlineRecord,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

export function extractStringArray(
  record: DeadlineRecord,
  ...keys: string[]
): string[] {
  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      const normalized = value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean);

      if (normalized.length > 0) {
        return normalized;
      }
    }

    if (typeof value === "string" && value.trim() !== "") {
      return value
        .split(/[;,]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }

  return [];
}

export function extractIsoDate(
  record: DeadlineRecord,
  ...keys: string[]
): string | null {
  const rawValue = extractString(record, ...keys);

  if (!rawValue) {
    return null;
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function getWorkerName(record: DeadlineRecord): string | null {
  return extractString(record, "Name", "SlaveName", "WorkerName");
}

export function getWorkerStatusBucket(
  record: DeadlineRecord
): keyof WorkerStatusTotals {
  const statusCode = extractNumber(record, "Stat", "SlaveStatus");

  switch (statusCode) {
    case 1:
      return "rendering";
    case 2:
      return "idle";
    case 3:
      return "offline";
    case 4:
      return "stalled";
    case 8:
      return "startingJob";
    default:
      return "unknown";
  }
}

export function getJobStatus(record: DeadlineRecord): {
  status: JobStatus;
  statusCode: number | null;
} {
  const statusCode = extractNumber(record, "Stat", "JobStatus");
  const renderingChunks = extractNumber(record, "RenderingChunks");

  if (statusCode === 4) {
    return { status: "Failed", statusCode };
  }

  if (statusCode === 6) {
    return { status: "Pending", statusCode };
  }

  if (statusCode === 2) {
    return { status: "Suspended", statusCode };
  }

  if (statusCode === 1) {
    return {
      status:
        renderingChunks !== null && renderingChunks > 0
          ? "Rendering"
          : "Queued",
      statusCode
    };
  }

  return { status: "Unknown", statusCode };
}

export function countActiveWorkers(record: DeadlineRecord): number | null {
  const slaveNames = extractStringArray(
    record,
    "SlaveNames",
    "WorkerNames",
    "MachineNames"
  );

  if (slaveNames.length > 0) {
    return slaveNames.length;
  }

  return extractNumber(record, "TaskCount", "RenderNodeCount");
}

export function normalizeProgressPercent(record: DeadlineRecord): number | null {
  const value = extractNumber(
    record,
    "CompletedPercentage",
    "Progress",
    "ProgressPercent"
  );

  if (value === null) {
    return null;
  }

  return Math.max(0, Math.min(100, value));
}

export function sortJobs(jobs: JobRow[]): JobRow[] {
  const statusPriority: Record<JobStatus, number> = {
    Failed: 0,
    Rendering: 1,
    Queued: 2,
    Pending: 3,
    Suspended: 4,
    Unknown: 5
  };

  return [...jobs].sort((left, right) => {
    const statusDelta = statusPriority[left.status] - statusPriority[right.status];

    if (statusDelta !== 0) {
      return statusDelta;
    }

    const rightTime = right.submittedAt ? Date.parse(right.submittedAt) : 0;
    const leftTime = left.submittedAt ? Date.parse(left.submittedAt) : 0;
    return rightTime - leftTime;
  });
}

export function totalsFromAssignments(
  assignments: WorkerAssignment[]
): WorkerStatusTotals {
  const totals = createEmptyWorkerTotals();

  for (const assignment of assignments) {
    totals.total += 1;
    totals[assignment.statusBucket] += 1;
  }

  return totals;
}

export function countJobsByStatus(jobs: JobRow[]): FarmJobTotals {
  const totals = createEmptyJobTotals();

  for (const status of jobStatuses) {
    void status;
  }

  for (const job of jobs) {
    totals.total += 1;

    switch (job.status) {
      case "Failed":
        totals.failed += 1;
        break;
      case "Rendering":
        totals.rendering += 1;
        break;
      case "Queued":
        totals.queued += 1;
        break;
      case "Pending":
        totals.pending += 1;
        break;
      case "Suspended":
        totals.suspended += 1;
        break;
      default:
        totals.unknown += 1;
        break;
    }
  }

  return totals;
}

export function calculateUtilization(totals: WorkerStatusTotals): number {
  if (totals.total === 0) {
    return 0;
  }

  return Number((totals.rendering / totals.total).toFixed(4));
}

