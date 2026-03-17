import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CacheRepository } from "../src/db/cacheRepository.js";
import { createDatabase } from "../src/db/database.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("sqlite foundation", () => {
  it("creates the expected cache tables and supports JSON cache roundtrips", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "deadline-dashboard-"));
    tempDirectories.push(tempDir);
    const databasePath = path.join(tempDir, "dashboard.sqlite");
    const db = createDatabase(databasePath);
    const cacheRepository = new CacheRepository(db);

    const tables = db
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
          ORDER BY name
        `
      )
      .all() as Array<{ name: string }>;

    expect(tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(["farm_snapshots", "resource_cache"])
    );

    cacheRepository.write(
      "summary",
      {
        lastUpdatedAt: "2026-03-17T12:00:00.000Z",
        utilization: 0.5
      },
      "2026-03-17T12:00:00.000Z",
      "2026-03-17T12:00:15.000Z"
    );

    expect(cacheRepository.read("summary")?.payload).toEqual({
      lastUpdatedAt: "2026-03-17T12:00:00.000Z",
      utilization: 0.5
    });

    db.close();
  });
});

