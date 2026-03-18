import type {
  FarmJobTotals,
  JobRow,
  JobStatus,
  WorkerStatusTotals
} from "@deadline-dashboard/contracts";
import type { DeadlineRecord, WorkerAssignment } from "./types.js";

type KeyPath = readonly string[];

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

function getValueByPath(
  record: DeadlineRecord,
  path: string | KeyPath
): unknown {
  const segments = Array.isArray(path) ? path : [path];
  let currentValue: unknown = record;

  for (const segment of segments) {
    if (
      typeof currentValue !== "object" ||
      currentValue === null ||
      Array.isArray(currentValue) ||
      !(segment in currentValue)
    ) {
      return undefined;
    }

    currentValue = (currentValue as Record<string, unknown>)[segment];
  }

  return currentValue;
}

export function extractString(
  record: DeadlineRecord,
  ...keys: Array<string | KeyPath>
): string | null {
  for (const key of keys) {
    const value = getValueByPath(record, key);

    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return null;
}

export function extractNumber(
  record: DeadlineRecord,
  ...keys: Array<string | KeyPath>
): number | null {
  for (const key of keys) {
    const value = getValueByPath(record, key);

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
  ...keys: Array<string | KeyPath>
): string[] {
  for (const key of keys) {
    const value = getValueByPath(record, key);

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
  ...keys: Array<string | KeyPath>
): string | null {
  const rawValue = extractString(record, ...keys);

  if (!rawValue) {
    return null;
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function extractDurationSeconds(
  record: DeadlineRecord,
  ...keys: Array<string | KeyPath>
): number | null {
  for (const key of keys) {
    const value = getValueByPath(record, key);

    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }

    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim();

    if (!normalized) {
      continue;
    }

    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
      return Number.parseFloat(normalized);
    }

    const colonParts = normalized.split(":").map((part) => Number.parseFloat(part));

    if (
      colonParts.length >= 2 &&
      colonParts.every((part) => Number.isFinite(part) && part >= 0)
    ) {
      let multiplier = 1;
      let totalSeconds = 0;

      for (const part of [...colonParts].reverse()) {
        totalSeconds += part * multiplier;
        multiplier *= 60;
      }

      return totalSeconds;
    }

    const unitMatches = Array.from(
      normalized.matchAll(/(\d+(?:\.\d+)?)\s*(d|h|m|s)/gi)
    );

    if (unitMatches.length > 0) {
      let totalSeconds = 0;

      for (const match of unitMatches) {
        const amount = Number.parseFloat(match[1]);
        const unit = match[2].toLowerCase();

        if (unit === "d") {
          totalSeconds += amount * 86_400;
        } else if (unit === "h") {
          totalSeconds += amount * 3_600;
        } else if (unit === "m") {
          totalSeconds += amount * 60;
        } else if (unit === "s") {
          totalSeconds += amount;
        }
      }

      return totalSeconds;
    }
  }

  return null;
}

export function extractBoolean(
  record: DeadlineRecord,
  ...keys: Array<string | KeyPath>
): boolean | null {
  for (const key of keys) {
    const value = getValueByPath(record, key);

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      if (value === 1) {
        return true;
      }

      if (value === 0) {
        return false;
      }
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      if (["true", "yes", "on", "enabled", "disabled", "1", "0", "false", "no", "off"].includes(normalized)) {
        if (["true", "yes", "on", "enabled", "1"].includes(normalized)) {
          return true;
        }

        if (["false", "no", "off", "disabled", "0"].includes(normalized)) {
          return false;
        }
      }
    }
  }

  return null;
}

export function getWorkerName(record: DeadlineRecord): string | null {
  return extractString(
    record,
    "Name",
    "SlaveName",
    "WorkerName",
    ["Info", "Name"],
    ["Settings", "Name"]
  );
}

export function getWorkerStatusBucket(
  record: DeadlineRecord
): keyof WorkerStatusTotals {
  const statusCode = extractNumber(
    record,
    "Stat",
    "SlaveStatus",
    ["Info", "Stat"],
    ["Info", "SlaveStatus"]
  );

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
  const renderingChunks = extractNumber(record, "RenderingChunks", "RenderChunks");

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
    "MachineNames",
    ["Props", "SlaveNames"]
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
    "ProgressPercent",
    "Prog",
    ["Props", "Prog"]
  );

  if (value !== null) {
    return Math.max(0, Math.min(100, value));
  }

  const completedChunks = extractNumber(record, "CompletedChunks");
  const taskCount = extractNumber(record, ["Props", "Tasks"], "Tasks");

  if (completedChunks !== null && taskCount !== null && taskCount > 0) {
    return Math.max(0, Math.min(100, (completedChunks / taskCount) * 100));
  }

  return null;
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
