import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CacheRepository } from "../src/db/cacheRepository.js";
import { createDatabase } from "../src/db/database.js";
import type { AppConfig } from "../src/config/env.js";
import { DashboardRefreshService } from "../src/services/dashboard/refreshService.js";
import { DeadlineApiError } from "../src/services/deadline/client.js";
import type { DeadlineApiResponses } from "../src/services/deadline/types.js";

const tempDirectories: string[] = [];

function createConfig(databasePath: string): AppConfig {
  return {
    databasePath,
    deadlineBaseUrl: "http://deadline.local",
    deadlineRequestTimeoutMs: 2_000,
    pollIntervalSeconds: 15,
    port: 3001,
    roomKeys: ["ula-501b", "ula-501c", "ula-502"],
    staleAfterSeconds: 45
  };
}

function createFixtureResponses(): DeadlineApiResponses {
  return {
    groups: ["ula-501b", "ula-501c", "ula-502"],
    jobs: [
      {
        _id: "job-1",
        Name: "Render A",
        Stat: 1,
        RenderingChunks: 2,
        DateSubmitted: "2026-03-17T12:00:00Z",
        Pool: "ula-501b",
        Group: "ula-501b"
      }
    ],
    pools: ["ula-501b", "ula-501c", "ula-502"],
    workerInfo: [
      { Name: "worker-a", Pools: ["ula-501b"], Stat: 1 },
      { Name: "worker-b", Pools: ["ula-501c"], Stat: 2 }
    ],
    workerInfoSettings: [
      { Name: "worker-a", Pool: "ula-501b" },
      { Name: "worker-b", Pool: "ula-501c" }
    ]
  };
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("DashboardRefreshService", () => {
  it("refreshes from Deadline and serves cached data until TTL expires", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "deadline-dashboard-"));
    tempDirectories.push(tempDir);
    const databasePath = path.join(tempDir, "dashboard.sqlite");
    const db = createDatabase(databasePath);
    const cacheRepository = new CacheRepository(db);
    const client = {
      isConfigured: true,
      async fetchCurrentState() {
        return createFixtureResponses();
      }
    };
    const service = new DashboardRefreshService(
      createConfig(databasePath),
      cacheRepository,
      client as never
    );

    const first = await service.getDashboardData();
    const second = await service.getDashboardData();

    expect(first.snapshot.source).toBe("live");
    expect(second.snapshot.source).toBe("cache");
    expect(second.summary.lastUpdatedAt).toBe(first.summary.lastUpdatedAt);

    db.close();
  });

  it("falls back to stale cache when Deadline refresh fails", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "deadline-dashboard-"));
    tempDirectories.push(tempDir);
    const databasePath = path.join(tempDir, "dashboard.sqlite");
    const db = createDatabase(databasePath);
    const cacheRepository = new CacheRepository(db);
    let shouldFail = false;
    const client = {
      isConfigured: true,
      async fetchCurrentState() {
        if (shouldFail) {
          throw new DeadlineApiError("Deadline offline");
        }

        return createFixtureResponses();
      }
    };
    const service = new DashboardRefreshService(
      {
        ...createConfig(databasePath),
        pollIntervalSeconds: 0.001
      },
      cacheRepository,
      client as never
    );

    await service.getDashboardData();
    shouldFail = true;

    await new Promise((resolve) => setTimeout(resolve, 10));
    const fallback = await service.getDashboardData();

    expect(fallback.summary.isStale).toBe(true);
    expect(fallback.snapshot.source).toBe("cache");

    db.close();
  });

  it("returns health information even when Deadline is not configured", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "deadline-dashboard-"));
    tempDirectories.push(tempDir);
    const databasePath = path.join(tempDir, "dashboard.sqlite");
    const db = createDatabase(databasePath);
    const cacheRepository = new CacheRepository(db);
    const client = {
      isConfigured: false,
      async fetchCurrentState() {
        throw new Error("Should not be called");
      }
    };
    const service = new DashboardRefreshService(
      {
        ...createConfig(databasePath),
        deadlineBaseUrl: null
      },
      cacheRepository,
      client as never
    );

    const health = await service.getHealth();

    expect(health.status).toBe("ok");
    expect(health.deadline.configured).toBe(false);
    expect(health.cache.hasSnapshot).toBe(false);

    db.close();
  });
});

