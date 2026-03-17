import type {
  DashboardRoomsResponse,
  DashboardSnapshot,
  FarmOverviewSummary,
  JobRow,
  RoomSummary
} from "@deadline-dashboard/contracts";
import { calculateRoomHealth } from "../../config/roomHealth.js";
import {
  calculateUtilization,
  countActiveWorkers,
  countJobsByStatus,
  createEmptyWorkerTotals,
  extractIsoDate,
  extractNumber,
  extractString,
  extractStringArray,
  getJobStatus,
  getWorkerName,
  getWorkerStatusBucket,
  normalizeProgressPercent,
  sortJobs,
  totalsFromAssignments
} from "./mappers.js";
import type {
  DeadlineApiResponses,
  DeadlineRecord,
  NormalizedDashboardData,
  WorkerAssignment
} from "./types.js";

interface NormalizerConfig {
  capturedAt?: string;
  pollIntervalSeconds: number;
  roomKeys: string[];
  source: "cache" | "live";
  stale: boolean;
}

function mergeWorkerRecords(
  workerInfo: DeadlineRecord[],
  workerInfoSettings: DeadlineRecord[]
): WorkerAssignment[] {
  const settingsByName = new Map<string, DeadlineRecord>();

  for (const settings of workerInfoSettings) {
    const name = getWorkerName(settings);

    if (name) {
      settingsByName.set(name.toLowerCase(), settings);
    }
  }

  return workerInfo.map((info) => {
    const name = getWorkerName(info) ?? "unknown-worker";
    const settings = settingsByName.get(name.toLowerCase()) ?? {};
    const pools = Array.from(
      new Set([...extractStringArray(info, "Pools", "Pool"), ...extractStringArray(settings, "Pools", "Pool")])
    );
    const groups = Array.from(
      new Set([...extractStringArray(info, "Groups", "Group"), ...extractStringArray(settings, "Groups", "Group")])
    );

    return {
      groups,
      name,
      pools,
      roomKey: null,
      source: "unassigned",
      statusBucket: getWorkerStatusBucket(info)
    };
  });
}

function assignRoomKeys(
  assignments: WorkerAssignment[],
  roomKeys: string[]
): WorkerAssignment[] {
  const normalizedRoomKeys = roomKeys.map((roomKey) => roomKey.toLowerCase());

  return assignments.map((assignment) => {
    const poolMatch = assignment.pools.find((pool) =>
      normalizedRoomKeys.includes(pool.toLowerCase())
    );

    if (poolMatch) {
      return {
        ...assignment,
        roomKey: roomKeys.find(
          (roomKey) => roomKey.toLowerCase() === poolMatch.toLowerCase()
        )!,
        source: "pool"
      };
    }

    const groupMatch = assignment.groups.find((group) =>
      normalizedRoomKeys.includes(group.toLowerCase())
    );

    if (groupMatch) {
      return {
        ...assignment,
        roomKey: roomKeys.find(
          (roomKey) => roomKey.toLowerCase() === groupMatch.toLowerCase()
        )!,
        source: "group"
      };
    }

    return assignment;
  });
}

function normalizeJobs(jobs: DeadlineRecord[]): JobRow[] {
  return sortJobs(
    jobs.map((job) => {
      const { status, statusCode } = getJobStatus(job);

      return {
        activeWorkersCount: countActiveWorkers(job),
        estimatedCompletionAt: extractIsoDate(
          job,
          "EstimatedCompletionDate",
          "EstimatedCompletionTime"
        ),
        group: extractString(job, "Group"),
        jobId: extractString(job, "_id", "JobID", "Id") ?? "unknown-job",
        name: extractString(job, "Name") ?? "Unnamed Job",
        pool: extractString(job, "Pool"),
        progressPercent: normalizeProgressPercent(job),
        renderingChunks: extractNumber(job, "RenderingChunks"),
        status,
        statusCode,
        submittedAt: extractIsoDate(
          job,
          "DateSubmitted",
          "SubmittedDate",
          "SubmitDate"
        ),
        user: extractString(job, "UserName", "User")
      };
    })
  );
}

function createRoomSummaries(
  assignments: WorkerAssignment[],
  roomKeys: string[]
): { roomSummaries: RoomSummary[]; unassignedWorkersCount: number } {
  const roomSummaries = roomKeys.map((roomKey) => {
    const roomAssignments = assignments.filter(
      (assignment) => assignment.roomKey === roomKey
    );
    const totals = totalsFromAssignments(roomAssignments);

    return {
      displayName: roomKey,
      health: calculateRoomHealth(totals),
      poolName: roomKey,
      roomKey,
      totals,
      unmatchedWorkerCount: roomAssignments.filter(
        (assignment) => assignment.source === "group"
      ).length,
      utilization: calculateUtilization(totals)
    };
  });

  return {
    roomSummaries,
    unassignedWorkersCount: assignments.filter(
      (assignment) => assignment.source === "unassigned"
    ).length
  };
}

function buildSummary(
  assignments: WorkerAssignment[],
  jobs: JobRow[],
  roomSummaries: RoomSummary[],
  capturedAt: string,
  pollIntervalSeconds: number,
  stale: boolean
): FarmOverviewSummary {
  const totals = totalsFromAssignments(assignments);
  const jobsTotals = countJobsByStatus(jobs);

  return {
    isStale: stale,
    jobs: jobsTotals,
    lastUpdatedAt: capturedAt,
    onlineWorkers: totals.rendering + totals.startingJob + totals.idle,
    pollIntervalSeconds,
    roomsWithIssues: roomSummaries
      .filter((room) => room.health !== "green")
      .map((room) => room.roomKey),
    totals,
    utilization: calculateUtilization(totals)
  };
}

function buildPoolValidationWarnings(
  configuredRoomKeys: string[],
  availablePools: string[]
): string[] {
  const normalizedPools = new Set(availablePools.map((pool) => pool.toLowerCase()));

  return configuredRoomKeys
    .filter((roomKey) => !normalizedPools.has(roomKey.toLowerCase()))
    .map(
      (roomKey) =>
        `Configured room pool "${roomKey}" was not returned by Deadline /api/pools.`
    );
}

export function normalizeDeadlineData(
  responses: DeadlineApiResponses,
  config: NormalizerConfig
): NormalizedDashboardData {
  const capturedAt = config.capturedAt ?? new Date().toISOString();
  const workerAssignments = assignRoomKeys(
    mergeWorkerRecords(responses.workerInfo, responses.workerInfoSettings),
    config.roomKeys
  );
  const jobs = normalizeJobs(responses.jobs);
  const { roomSummaries, unassignedWorkersCount } = createRoomSummaries(
    workerAssignments,
    config.roomKeys
  );
  const summary = buildSummary(
    workerAssignments,
    jobs,
    roomSummaries,
    capturedAt,
    config.pollIntervalSeconds,
    config.stale
  );
  const roomsResponse: DashboardRoomsResponse = {
    capturedAt,
    poolValidationWarnings: buildPoolValidationWarnings(
      config.roomKeys,
      responses.pools
    ),
    rooms: roomSummaries,
    source: config.source,
    unassignedWorkersCount
  };
  const snapshot: DashboardSnapshot = {
    capturedAt,
    jobs,
    rooms: roomSummaries,
    source: config.source,
    summary
  };

  return {
    jobs,
    roomsResponse,
    snapshot,
    summary,
    unassignedWorkersCount,
    workerAssignments
  };
}

export function markSnapshotAsStale(
  snapshot: DashboardSnapshot,
  jobs: JobRow[],
  roomsResponse: DashboardRoomsResponse
): { jobs: JobRow[]; roomsResponse: DashboardRoomsResponse; snapshot: DashboardSnapshot; summary: FarmOverviewSummary } {
  const summary: FarmOverviewSummary = {
    ...snapshot.summary,
    isStale: true
  };

  return {
    jobs,
    roomsResponse: {
      ...roomsResponse,
      source: "cache"
    },
    snapshot: {
      ...snapshot,
      source: "cache",
      summary
    },
    summary
  };
}

export function emptyWorkerTotals() {
  return createEmptyWorkerTotals();
}

