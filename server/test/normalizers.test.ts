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
        workerInfoSettings
      },
      {
        pollIntervalSeconds: 15,
        roomKeys: ["ula-501b", "ula-501c", "ula-502"],
        source: "live",
        stale: false
      }
    );

    expect(result.summary.totals.rendering).toBe(1);
    expect(result.summary.totals.idle).toBe(1);
    expect(result.summary.totals.stalled).toBe(1);
    expect(result.summary.totals.startingJob).toBe(1);
    expect(result.summary.totals.offline).toBe(1);
    expect(result.summary.totals.unknown).toBe(1);
    expect(result.summary.utilization).toBeCloseTo(1 / 6, 4);
    expect(result.roomsResponse.unassignedWorkersCount).toBe(1);
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
        workerInfoSettings
      },
      {
        pollIntervalSeconds: 15,
        roomKeys: ["ula-501b", "ula-501c", "ula-502"],
        source: "live",
        stale: false
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
    expect(result.summary.jobs.suspended).toBe(1);
  });

  it("warns when configured pools are missing upstream", () => {
    const result = normalizeDeadlineData(
      {
        groups: [],
        jobs,
        pools: ["ula-501b", "ula-502"],
        workerInfo,
        workerInfoSettings
      },
      {
        pollIntervalSeconds: 15,
        roomKeys: ["ula-501b", "ula-501c", "ula-502"],
        source: "live",
        stale: false
      }
    );

    expect(result.roomsResponse.poolValidationWarnings).toEqual([
      'Configured room pool "ula-501c" was not returned by Deadline /api/pools.'
    ]);
  });
});
