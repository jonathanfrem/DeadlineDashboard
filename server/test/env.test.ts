import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
});

describe("loadConfig", () => {
  it("resolves worker display-name mappings relative to the repo root", () => {
    process.chdir(path.join(originalCwd, "server"));

    const config = loadConfig({
      DATABASE_PATH: "./server/data/test.sqlite",
      WORKER_DISPLAY_NAMES_PATH: "./config/worker-display-names.example.json"
    });

    expect(config.workerDisplayNames["egmsu9-farm05"]).toBe("501B-05");
    expect(config.workerDisplayNames["egmsu9-farm21"]).toBe("502-01");
  });
});
