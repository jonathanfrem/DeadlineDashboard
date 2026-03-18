import type {
  DashboardRoomsResponse,
  DashboardSnapshot,
  FarmOverviewSummary,
  JobRow,
  RoomSummary,
  WorkerIssue
} from "@deadline-dashboard/contracts";
import { calculateRoomHealth } from "../../config/roomHealth.js";
import {
  calculateUtilization,
  countActiveWorkers,
  countJobsByStatus,
  createEmptyWorkerTotals,
  extractBoolean,
  extractDurationSeconds,
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
  failedJobsLookbackHours: number;
  pollIntervalSeconds: number;
  roomKeys: string[];
  source: "cache" | "live";
  stale: boolean;
  workerIssuesLookbackMinutes: number;
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
      new Set([
        ...extractStringArray(
          info,
          "Pools",
          "Pool",
          ["Info", "Pools"],
          ["Info", "Pool"],
          ["Settings", "Pools"],
          ["Settings", "Pool"]
        ),
        ...extractStringArray(
          settings,
          "Pools",
          "Pool",
          ["Info", "Pools"],
          ["Info", "Pool"],
          ["Settings", "Pools"],
          ["Settings", "Pool"]
        )
      ])
    );
    const groups = Array.from(
      new Set([
        ...extractStringArray(
          info,
          "Groups",
          "Group",
          "Grps",
          ["Info", "Groups"],
          ["Info", "Group"],
          ["Info", "Grps"],
          ["Settings", "Groups"],
          ["Settings", "Group"],
          ["Settings", "Grps"]
        ),
        ...extractStringArray(
          settings,
          "Groups",
          "Group",
          "Grps",
          ["Info", "Groups"],
          ["Info", "Group"],
          ["Info", "Grps"],
          ["Settings", "Groups"],
          ["Settings", "Group"],
          ["Settings", "Grps"]
        )
      ])
    );
    const disabledFromDisabledFlag = extractBoolean(
      settings,
      "Disabled",
      "IsDisabled",
      "SlaveDisabled",
      ["Props", "Disabled"],
      ["Settings", "Disabled"],
      ["Settings", "IsDisabled"],
      ["Settings", "SlaveDisabled"]
    );
    const enabledFlag = extractBoolean(
      settings,
      "Enabled",
      "Enable",
      "SlaveEnabled",
      "IsEnabled",
      ["Props", "Enabled"],
      ["Settings", "Enabled"],
      ["Settings", "Enable"],
      ["Settings", "SlaveEnabled"],
      ["Settings", "IsEnabled"]
    );
    const disabledStateText = extractString(
      info,
      "Status",
      "State",
      "SlaveState",
      "SlaveStatus",
      "StatName",
      "StatusText",
      "StatusMessage",
      "StateText",
      ["Info", "Status"],
      ["Info", "State"],
      ["Info", "StatName"],
      ["Info", "StatusText"],
      ["Info", "StatusMessage"],
      ["Info", "StateText"],
      ["Props", "State"],
      ["Props", "Status"],
      ["Props", "SlaveState"],
      ["Props", "StatusText"]
    );
    const disabledFromStateText =
      disabledStateText !== null &&
      disabledStateText.toLowerCase().includes("disabled");
    const disabled =
      disabledFromDisabledFlag === true ||
      disabledFromStateText ||
      (enabledFlag !== null ? enabledFlag === false : false);

    return {
      disabled,
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

function getFailedJobActivityTimestamp(job: DeadlineRecord): string | null {
  return extractIsoDate(
    job,
    "DateComp",
    "DateCompleted",
    "CompletedDate",
    "DateFinished",
    "LastWriteTime",
    "DateUpdated",
    "DateModified",
    "DateFailed",
    "DateStarted",
    "Date",
    "DateSubmitted",
    "SubmittedDate",
    "SubmitDate"
  );
}

function normalizeJobs(
  jobs: DeadlineRecord[],
  capturedAt: string,
  failedJobsLookbackHours: number
): JobRow[] {
  const lookbackThresholdMs =
    Date.parse(capturedAt) - failedJobsLookbackHours * 60 * 60 * 1000;
  const capturedAtMs = Date.parse(capturedAt);

  return sortJobs(
    jobs
      .map((job) => {
        const { status, statusCode } = getJobStatus(job);
        const submittedAt = extractIsoDate(
          job,
          "Date",
          "DateSubmitted",
          "SubmittedDate",
          "SubmitDate"
        );
        const startedAt = extractIsoDate(
          job,
          "DateStarted",
          "StartedDate",
          "DateStart",
          ["Props", "DateStarted"]
        );
        const progressPercent = normalizeProgressPercent(job);
        const explicitRuntimeSeconds = extractDurationSeconds(
          job,
          "ElapsedJobRenderTime",
          "ElapsedRenderTime",
          "ElapsedTime",
          "JobRenderTime",
          "RenderTime",
          "RunTime",
          "Runtime",
          ["Props", "ElapsedJobRenderTime"],
          ["Props", "RenderTime"]
        );
        const runtimeSeconds =
          explicitRuntimeSeconds !== null
            ? explicitRuntimeSeconds
            : startedAt !== null && Date.parse(startedAt) <= capturedAtMs
              ? Math.max(0, Math.floor((capturedAtMs - Date.parse(startedAt)) / 1000))
              : null;
        const explicitRemainingSeconds = extractDurationSeconds(
          job,
          "EstimatedJobTimeRemaining",
          "EstimatedTimeRemaining",
          "EstimatedRemaining",
          "RemainingTime",
          "TimeRemaining",
          "ETR",
          ["Props", "EstimatedJobTimeRemaining"],
          ["Props", "RemainingTime"]
        );
        const estimatedRemainingSeconds =
          explicitRemainingSeconds !== null
            ? explicitRemainingSeconds
            : runtimeSeconds !== null &&
                progressPercent !== null &&
                progressPercent > 0 &&
                progressPercent < 100
              ? Math.max(
                  0,
                  Math.round((runtimeSeconds * (100 - progressPercent)) / progressPercent)
                )
              : null;

        return {
          activeWorkersCount: countActiveWorkers(job),
          comment: extractString(
            job,
            "Comment",
            "Comments",
            ["Props", "Comment"],
            ["Props", "Comments"],
            ["Props", "Cmmt"]
          ),
          estimatedCompletionAt: extractIsoDate(
            job,
            "DateComp",
            "EstimatedCompletionDate",
            "EstimatedCompletionTime",
            "DateCompleted",
            "CompletedDate"
          ),
          group: extractString(job, "Group", ["Props", "Grp"], ["Props", "Group"]),
          jobId: extractString(job, "_id", "JobID", "Id") ?? "unknown-job",
          name: extractString(job, "Name", ["Props", "Name"]) ?? "Unnamed Job",
          pool: extractString(job, "Pool", ["Props", "Pool"]),
          progressPercent,
          renderingChunks: extractNumber(job, "RenderingChunks", "RenderChunks"),
          estimatedRemainingSeconds,
          runtimeSeconds,
          startedAt,
          status,
          statusCode,
          submittedAt,
          user: extractString(job, "UserName", "User", ["Props", "User"], [
            "Props",
            "UserName"
          ])
        };
      })
      .filter((job, index) => {
        if (job.status === "Suspended") {
          return false;
        }

        if (job.status !== "Failed") {
          return true;
        }

        const failedAt = getFailedJobActivityTimestamp(jobs[index]);

        if (!failedAt) {
          return true;
        }

        return Date.parse(failedAt) >= lookbackThresholdMs;
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
    const enabledRoomAssignments = roomAssignments.filter(
      (assignment) => !assignment.disabled
    );
    const totals = totalsFromAssignments(enabledRoomAssignments);

    return {
      disabledWorkers: roomAssignments.filter((assignment) => assignment.disabled).length,
      displayName: roomKey,
      health: calculateRoomHealth(totals),
      poolName: roomKey,
      roomKey,
      totals,
      unmatchedWorkerCount: roomAssignments.filter(
        (assignment) => assignment.source === "group" && !assignment.disabled
      ).length,
      utilization: calculateUtilization(totals)
    };
  });

  return {
    roomSummaries,
    unassignedWorkersCount: 0
  };
}

function getReportTimestamp(report: DeadlineRecord): string | null {
  return extractIsoDate(
    report,
    "Date",
    "DateTime",
    "Timestamp",
    "CreationDate",
    "CreatedAt",
    "ModifiedAt",
    "LastWriteTime",
    ["Props", "Date"],
    ["Props", "DateTime"],
    ["Info", "Date"],
    ["Info", "DateTime"]
  );
}

function getReportMessage(report: DeadlineRecord): string | null {
  return extractString(
    report,
    "Message",
    "Description",
    "Details",
    "Text",
    "Title",
    "Name",
    "Log",
    ["Props", "Message"],
    ["Props", "Description"],
    ["Props", "Details"],
    ["Info", "Message"],
    ["Info", "Description"]
  );
}

function isErrorReport(report: DeadlineRecord): boolean {
  const numericReportType = extractNumber(
    report,
    "Type",
    "ReportType",
    ["Props", "Type"],
    ["Props", "ReportType"],
    ["Info", "Type"],
    ["Info", "ReportType"]
  );

  if (numericReportType === 1) {
    return true;
  }

  const searchableFields = [
    extractString(
      report,
      "Type",
      "Category",
      "ReportType",
      "EventType",
      "Severity",
      "Level",
      "Result",
      ["Props", "Type"],
      ["Props", "Category"],
      ["Props", "ReportType"],
      ["Props", "Severity"]
    ),
    getReportMessage(report)
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  if (!searchableFields) {
    return false;
  }

  return /(error|exception|fatal|failed|failure)/.test(searchableFields);
}

function normalizeWorkerIssues(
  reportsByWorker: Map<string, DeadlineRecord[]>,
  workerInfo: DeadlineRecord[],
  assignments: WorkerAssignment[],
  capturedAt: string,
  lookbackMinutes: number
): WorkerIssue[] {
  const lookbackThresholdMs = Date.parse(capturedAt) - lookbackMinutes * 60 * 1000;
  const assignmentsByName = new Map(
    assignments.map((assignment) => [assignment.name.toLowerCase(), assignment])
  );
  const workerInfoByName = new Map(
    workerInfo
      .map((record) => {
        const workerName = getWorkerName(record);
        return workerName ? [workerName.toLowerCase(), record] : null;
      })
      .filter((entry): entry is [string, DeadlineRecord] => entry !== null)
  );

  const issues: WorkerIssue[] = [];
  const issueNames = new Set<string>();

  for (const [workerName, reports] of reportsByWorker.entries()) {
    const recentErrors = reports
      .filter((report) => isErrorReport(report))
      .map((report) => ({
        message: getReportMessage(report),
        timestamp: getReportTimestamp(report)
      }))
      .filter(
        (report): report is { message: string | null; timestamp: string } =>
          report.timestamp !== null &&
          Date.parse(report.timestamp) >= lookbackThresholdMs
      )
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));

    if (recentErrors.length === 0) {
      continue;
    }

    const assignment = assignmentsByName.get(workerName.toLowerCase());

    if (!assignment || assignment.source === "unassigned") {
      continue;
    }

    issues.push({
      disabled: assignment.disabled,
      errorCount: recentErrors.length,
      lastErrorAt: recentErrors[0]?.timestamp ?? null,
      lastErrorMessage: recentErrors[0]?.message ?? null,
      level: recentErrors.length >= 3 ? "critical" : "warning",
      roomKey: assignment.roomKey,
      workerName
    });
    issueNames.add(workerName.toLowerCase());
  }

  for (const assignment of assignments) {
    if (assignment.source === "unassigned" || issueNames.has(assignment.name.toLowerCase())) {
      continue;
    }

    const info = workerInfoByName.get(assignment.name.toLowerCase());

    if (!info) {
      continue;
    }

    const taskFailures = extractNumber(info, "TskFail", ["Info", "TskFail"]);

    if (taskFailures === null || taskFailures <= 0) {
      continue;
    }

    const fallbackTimestamp =
      extractIsoDate(info, "LastRenderTime", ["Info", "LastRenderTime"]) ??
      extractIsoDate(info, "StatDate", ["Info", "StatDate"]);

    if (!fallbackTimestamp || Date.parse(fallbackTimestamp) < lookbackThresholdMs) {
      continue;
    }

    issues.push({
      disabled: assignment.disabled,
      errorCount: 1,
      lastErrorAt: fallbackTimestamp,
      lastErrorMessage:
        extractString(info, "Msg", ["Info", "Msg"]) ||
        "Worker reported recent task failures. Exact count unavailable from live worker info.",
      level: "warning",
      roomKey: assignment.roomKey,
      workerName: assignment.name
    });
  }

  return issues.sort((left, right) => {
    if (left.level !== right.level) {
      return left.level === "critical" ? -1 : 1;
    }

    if (left.errorCount !== right.errorCount) {
      return right.errorCount - left.errorCount;
    }

    const leftTime = left.lastErrorAt ? Date.parse(left.lastErrorAt) : 0;
    const rightTime = right.lastErrorAt ? Date.parse(right.lastErrorAt) : 0;

    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return left.workerName.localeCompare(right.workerName);
  });
}

function buildSummary(
  assignments: WorkerAssignment[],
  jobs: JobRow[],
  roomSummaries: RoomSummary[],
  capturedAt: string,
  pollIntervalSeconds: number,
  stale: boolean
): FarmOverviewSummary {
  const totals = totalsFromAssignments(
    assignments.filter(
      (assignment) => !assignment.disabled && assignment.source !== "unassigned"
    )
  );
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
  const jobs = normalizeJobs(
    responses.jobs,
    capturedAt,
    config.failedJobsLookbackHours
  );
  const workerIssues = normalizeWorkerIssues(
    new Map(
      responses.workerReports.map((workerReport) => [
        workerReport.workerName.toLowerCase(),
        workerReport.reports
      ])
    ),
    responses.workerInfo,
    workerAssignments,
    capturedAt,
    config.workerIssuesLookbackMinutes
  );
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
    summary,
    workerIssues
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
