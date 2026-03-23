import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeDeadlineData } from "../src/services/deadline/normalizers.js";
import type { DeadlineRecord } from "../src/services/deadline/types.js";

function readFixture<T>(filename: string): T {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), "test/fixtures", filename), "utf8")
  ) as T;
}

describe("normalizeDeadlineData", () => {
  const workerInfo = readFixture<DeadlineRecord[]>("workers-info.json");
  const workerInfoSettings = readFixture<DeadlineRecord[]>(
    "workers-settings.json"
  );
  const jobs = readFixture<DeadlineRecord[]>("jobs.json");

  it("maps worker states, room assignments, and utilization", () => {
    const result = normalizeDeadlineData(
      {
        groups: ["ula-501b", "ula-501c", "ula-502"],
        jobs,
        pools: ["ula-501b", "ula-501c", "ula-502"],
        workerInfo,
        workerInfoSettings,
        workerReports: []
      },
      {
        failedJobsLookbackHours: 12,
        pollIntervalSeconds: 15,
        roomKeys: ["ula-501b", "ula-501c", "ula-502"],
        source: "live",
        stale: false,
        workerDisplayNames: {},
        workerIssuesLookbackMinutes: 30
      }
    );

    expect(result.summary.totals.rendering).toBe(1);
    expect(result.summary.totals.idle).toBe(1);
    expect(result.summary.totals.stalled).toBe(1);
    expect(result.summary.totals.startingJob).toBe(1);
    expect(result.summary.totals.offline).toBe(1);
    expect(result.summary.totals.unknown).toBe(0);
    expect(result.summary.utilization).toBeCloseTo(1 / 5, 4);
    expect(result.roomsResponse.unassignedWorkersCount).toBe(0);
    expect(
      result.roomsResponse.rooms.find((room) => room.roomKey === "ula-501b")
        ?.disabledWorkers
    ).toBe(1);
    expect(
      result.roomsResponse.rooms.find(
        (room: { roomKey: string; unmatchedWorkerCount: number }) =>
          room.roomKey === "ula-501c"
      )?.unmatchedWorkerCount
    ).toBe(1);
    expect(result.summary.roomsWithIssues).toContain("ula-501c");
  });

  it("maps jobs into dashboard-friendly statuses", () => {
    const result = normalizeDeadlineData(
      {
        groups: ["ula-501b", "ula-501c", "ula-502"],
        jobs,
        pools: ["ula-501b", "ula-501c", "ula-502"],
        workerInfo,
        workerInfoSettings,
        workerReports: []
      },
      {
        capturedAt: "2026-03-17T12:30:00Z",
        failedJobsLookbackHours: 12,
        pollIntervalSeconds: 15,
        roomKeys: ["ula-501b", "ula-501c", "ula-502"],
        source: "live",
        stale: false,
        workerDisplayNames: {},
        workerIssuesLookbackMinutes: 30
      }
    );

    expect(result.jobs[0]?.status).toBe("Failed");
    expect(result.jobs.find((job) => job.jobId === "job-rendering")?.status).toBe(
      "Rendering"
    );
    expect(result.jobs.find((job) => job.jobId === "job-queued")?.status).toBe(
      "Queued"
    );
    expect(result.summary.jobs.pending).toBe(1);
    expect(result.summary.jobs.suspended).toBe(0);
    expect(result.jobs.find((job) => job.jobId === "job-suspended")).toBeUndefined();
  });

  it("warns when configured pools are missing upstream", () => {
    const result = normalizeDeadlineData(
      {
        groups: [],
        jobs,
        pools: ["ula-501b", "ula-502"],
        workerInfo,
        workerInfoSettings,
        workerReports: []
      },
      {
        failedJobsLookbackHours: 12,
        pollIntervalSeconds: 15,
        roomKeys: ["ula-501b", "ula-501c", "ula-502"],
        source: "live",
        stale: false,
        workerDisplayNames: {},
        workerIssuesLookbackMinutes: 30
      }
    );

    expect(result.roomsResponse.poolValidationWarnings).toEqual([
      'Configured room pool "ula-501c" was not returned by Deadline /api/pools.'
    ]);
  });

  it("only includes failed jobs from the last 12 hours", () => {
    const result = normalizeDeadlineData(
      {
        groups: ["ula-501b", "ula-501c", "ula-502"],
        jobs: [
          ...jobs,
          {
            _id: "job-failed-old",
            Name: "Old Failure",
            UserName: "student",
            Stat: 4,
            DateCompleted: "2026-03-16T00:30:00Z",
            DateSubmitted: "2026-03-15T23:30:00Z",
            Pool: "ula-502",
            Group: "ula-502"
          }
        ],
        pools: ["ula-501b", "ula-501c", "ula-502"],
        workerInfo,
        workerInfoSettings,
        workerReports: []
      },
      {
        capturedAt: "2026-03-17T12:30:00Z",
        failedJobsLookbackHours: 12,
        pollIntervalSeconds: 15,
        roomKeys: ["ula-501b", "ula-501c", "ula-502"],
        source: "live",
        stale: false,
        workerDisplayNames: {},
        workerIssuesLookbackMinutes: 30
      }
    );

    expect(result.jobs.find((job) => job.jobId === "job-failed")).toBeDefined();
    expect(result.jobs.find((job) => job.jobId === "job-failed-old")).toBeUndefined();
    expect(result.summary.jobs.failed).toBe(1);
  });

  it("maps nested Deadline job props into dashboard fields", () => {
    const result = normalizeDeadlineData(
      {
        groups: ["ula-501b", "ula-501c", "ula-502"],
        jobs: [
          {
            _id: "job-props-shape",
            Stat: 1,
            RenderingChunks: 2,
            CompletedChunks: 5,
            Date: "2026-03-17T07:15:00Z",
            DateStart: "2026-03-17T12:25:00Z",
            Props: {
              Comment: "Shot 020 lighting pass",
              EstimatedJobTimeRemaining: "5m",
              Grp: "ula-501c",
              Name: "Comp Render",
              Pool: "ula-501c",
              Tasks: 10,
              User: "jofr018"
            },
            SlaveNames: ["worker-501c-01", "worker-501c-02"]
          }
        ],
        pools: ["ula-501b", "ula-501c", "ula-502"],
        workerInfo,
        workerInfoSettings,
        workerReports: []
      },
      {
        capturedAt: "2026-03-17T12:30:00Z",
        failedJobsLookbackHours: 12,
        pollIntervalSeconds: 15,
        roomKeys: ["ula-501b", "ula-501c", "ula-502"],
        source: "live",
        stale: false,
        workerDisplayNames: {},
        workerIssuesLookbackMinutes: 30
      }
    );

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      activeWorkersCount: 2,
      comment: "Shot 020 lighting pass",
      estimatedRemainingSeconds: 300,
      group: "ula-501c",
      name: "Comp Render",
      pool: "ula-501c",
      progressPercent: 50,
      runtimeSeconds: 300,
      startedAt: "2026-03-17T12:25:00.000Z",
      status: "Rendering",
      submittedAt: "2026-03-17T07:15:00.000Z",
      user: "jofr018"
    });
  });

  it("excludes disabled workers from nested info/settings payloads", () => {
    const result = normalizeDeadlineData(
      {
        groups: ["nuke", "maya", "blender"],
        jobs: [],
        pools: ["farm", "ula-501b", "ula-501c", "ula-502"],
        workerInfo: [
          {
            Info: {
              Name: "EGMSU9-FARM05",
              Stat: 2,
              State: "Disabled (Idle)"
            },
            Settings: {
              Enable: false,
              Grps: ["blender", "nuke", "maya"],
              Name: "EGMSU9-FARM05",
              Pools: ["ula-501b"]
            }
          },
          {
            Info: {
              Name: "EGMSU9-FARM06",
              Stat: 1
            },
            Settings: {
              Enable: true,
              Grps: ["blender"],
              Name: "EGMSU9-FARM06",
              Pools: ["ula-501b"]
            }
          }
        ],
        workerInfoSettings: [
          {
            Info: {
              Name: "EGMSU9-FARM05",
              Stat: 2,
              State: "Disabled (Idle)"
            },
            Settings: {
              Enable: false,
              Grps: ["blender", "nuke", "maya"],
              Name: "EGMSU9-FARM05",
              Pools: ["ula-501b"]
            }
          },
          {
            Info: {
              Name: "EGMSU9-FARM06",
              Stat: 1
            },
            Settings: {
              Enable: true,
              Grps: ["blender"],
              Name: "EGMSU9-FARM06",
              Pools: ["ula-501b"]
            }
          }
        ],
        workerReports: []
      },
      {
        failedJobsLookbackHours: 12,
        pollIntervalSeconds: 15,
        roomKeys: ["ula-501b", "ula-501c", "ula-502"],
        source: "live",
        stale: false,
        workerDisplayNames: {},
        workerIssuesLookbackMinutes: 30
      }
    );

    expect(result.summary.totals.total).toBe(1);
    expect(result.summary.totals.idle).toBe(0);
    expect(result.summary.totals.rendering).toBe(1);
    expect(
      result.roomsResponse.rooms.find((room) => room.roomKey === "ula-501b")
        ?.disabledWorkers
    ).toBe(1);
  });

  it("surfaces recent worker issues from the last 30 minutes", () => {
    const result = normalizeDeadlineData(
      {
        groups: ["ula-501b", "ula-501c", "ula-502"],
        jobs: [],
        pools: ["ula-501b", "ula-501c", "ula-502"],
        workerInfo: [
          { Name: "worker-a", Pools: ["ula-501b"], Stat: 1 },
          { Name: "worker-b", Pools: ["ula-501c"], Stat: 2 }
        ],
        workerInfoSettings: [
          { Name: "worker-a", Pools: ["ula-501b"], Enable: true },
          { Name: "worker-b", Pools: ["ula-501c"], Enable: false }
        ],
        workerReports: [
          {
            workerName: "worker-a",
            reports: [
              {
                Date: "2026-03-17T12:25:00Z",
                Message: "Task failed with render exception",
                Type: "Error"
              },
              {
                Date: "2026-03-17T12:10:00Z",
                Message: "Worker error while loading plugin",
                Type: "Error"
              },
              {
                Date: "2026-03-17T11:40:00Z",
                Message: "Old error outside window",
                Type: "Error"
              }
            ]
          },
          {
            workerName: "worker-b",
            reports: [
              {
                Date: "2026-03-17T12:28:00Z",
                Message: "Fatal task exception",
                Type: "Error"
              },
              {
                Date: "2026-03-17T12:22:00Z",
                Message: "Another render failure",
                Type: "Error"
              },
              {
                Date: "2026-03-17T12:18:00Z",
                Message: "Third failure",
                Type: "Error"
              }
            ]
          }
        ]
      },
      {
        capturedAt: "2026-03-17T12:30:00Z",
        failedJobsLookbackHours: 12,
        pollIntervalSeconds: 15,
        roomKeys: ["ula-501b", "ula-501c", "ula-502"],
        source: "live",
        stale: false,
        workerDisplayNames: {},
        workerIssuesLookbackMinutes: 30
      }
    );

    expect(result.snapshot.workerIssues).toEqual([
      expect.objectContaining({
        disabled: true,
        errorCount: 3,
        level: "critical",
        roomKey: "ula-501c",
        workerDisplayName: "worker-b",
        workerName: "worker-b"
      }),
      expect.objectContaining({
        disabled: false,
        errorCount: 2,
        lastErrorMessage: "Task failed with render exception",
        level: "warning",
        roomKey: "ula-501b",
        workerDisplayName: "worker-a",
        workerName: "worker-a"
      })
    ]);
  });

  it("maps worker display names for the issue view without changing raw worker ids", () => {
    const result = normalizeDeadlineData(
      {
        groups: ["ula-501b", "ula-501c", "ula-502"],
        jobs: [],
        pools: ["ula-501b", "ula-501c", "ula-502"],
        workerInfo: [{ Name: "EGMSU9-FARM05", Pools: ["ula-501b"], Stat: 1 }],
        workerInfoSettings: [
          { Name: "EGMSU9-FARM05", Pools: ["ula-501b"], Enable: true }
        ],
        workerReports: [
          {
            workerName: "EGMSU9-FARM05",
            reports: [
              {
                Date: "2026-03-17T12:25:00Z",
                Message: "Task failed with render exception",
                Type: "Error"
              }
            ]
          }
        ]
      },
      {
        capturedAt: "2026-03-17T12:30:00Z",
        failedJobsLookbackHours: 12,
        pollIntervalSeconds: 15,
        roomKeys: ["ula-501b", "ula-501c", "ula-502"],
        source: "live",
        stale: false,
        workerDisplayNames: {
          "egmsu9-farm05": "501B-05"
        },
        workerIssuesLookbackMinutes: 30
      }
    );

    expect(result.snapshot.workerIssues).toEqual([
      expect.objectContaining({
        roomKey: "ula-501b",
        workerDisplayName: "501B-05",
        workerName: "EGMSU9-FARM05"
      })
    ]);
  });

  it("recognizes numeric Deadline worker report error types", () => {
    const result = normalizeDeadlineData(
      {
        groups: ["ula-501b", "ula-501c", "ula-502"],
        jobs: [],
        pools: ["ula-501b", "ula-501c", "ula-502"],
        workerInfo: [{ Name: "worker-a", Pools: ["ula-501b"], Stat: 1 }],
        workerInfoSettings: [{ Name: "worker-a", Pools: ["ula-501b"], Enable: true }],
        workerReports: [
          {
            workerName: "worker-a",
            reports: [
              {
                Date: "2026-03-17T12:25:00Z",
                Details: "Worker threw a render error",
                Type: 1
              }
            ]
          }
        ]
      },
      {
        capturedAt: "2026-03-17T12:30:00Z",
        failedJobsLookbackHours: 12,
        pollIntervalSeconds: 15,
        roomKeys: ["ula-501b", "ula-501c", "ula-502"],
        source: "live",
        stale: false,
        workerDisplayNames: {},
        workerIssuesLookbackMinutes: 30
      }
    );

    expect(result.snapshot.workerIssues).toEqual([
      expect.objectContaining({
        errorCount: 1,
        roomKey: "ula-501b",
        workerName: "worker-a"
      })
    ]);
  });

  it("falls back to TskFail from worker info when reports are unavailable", () => {
    const result = normalizeDeadlineData(
      {
        groups: ["ula-501b", "ula-501c", "ula-502"],
        jobs: [],
        pools: ["ula-501b", "ula-501c", "ula-502"],
        workerInfo: [
          {
            Info: {
              LastRenderTime: "2026-03-17T12:25:00Z",
              Msg: "",
              Name: "worker-a",
              Stat: 2,
              TskFail: 4
            },
            Settings: {
              Name: "worker-a",
              Pools: ["ula-501b"]
            }
          }
        ],
        workerInfoSettings: [
          {
            Settings: {
              Enable: true,
              Name: "worker-a",
              Pools: ["ula-501b"]
            }
          }
        ],
        workerReports: []
      },
      {
        capturedAt: "2026-03-17T12:30:00Z",
        failedJobsLookbackHours: 12,
        pollIntervalSeconds: 15,
        roomKeys: ["ula-501b", "ula-501c", "ula-502"],
        source: "live",
        stale: false,
        workerDisplayNames: {},
        workerIssuesLookbackMinutes: 30
      }
    );

    expect(result.snapshot.workerIssues).toEqual([
      expect.objectContaining({
        errorCount: 1,
        level: "warning",
        roomKey: "ula-501b",
        workerName: "worker-a"
      })
    ]);
  });

  it("does not count or surface unassigned workers anywhere", () => {
    const result = normalizeDeadlineData(
      {
        groups: ["ula-501b", "ula-501c", "ula-502"],
        jobs: [],
        pools: ["ula-501b", "ula-501c", "ula-502"],
        workerInfo: [
          { Name: "worker-assigned", Pools: ["ula-501b"], Stat: 1 },
          { Name: "worker-unassigned", Pools: ["general"], Stat: 4 }
        ],
        workerInfoSettings: [
          { Name: "worker-assigned", Pools: ["ula-501b"], Enable: true },
          { Name: "worker-unassigned", Pools: ["general"], Enable: true }
        ],
        workerReports: [
          {
            workerName: "worker-unassigned",
            reports: [
              {
                Date: "2026-03-17T12:25:00Z",
                Message: "Fatal task exception",
                Type: "Error"
              }
            ]
          }
        ]
      },
      {
        capturedAt: "2026-03-17T12:30:00Z",
        failedJobsLookbackHours: 12,
        pollIntervalSeconds: 15,
        roomKeys: ["ula-501b", "ula-501c", "ula-502"],
        source: "live",
        stale: false,
        workerDisplayNames: {},
        workerIssuesLookbackMinutes: 30
      }
    );

    expect(result.summary.totals.total).toBe(1);
    expect(result.summary.totals.rendering).toBe(1);
    expect(result.summary.totals.stalled).toBe(0);
    expect(result.roomsResponse.unassignedWorkersCount).toBe(0);
    expect(result.snapshot.workerIssues).toEqual([]);
  });
});
