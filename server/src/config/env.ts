import fs from "node:fs";
import path from "node:path";

export interface AppConfig {
  databasePath: string;
  deadlineBaseUrl: string | null;
  deadlineRequestTimeoutMs: number;
  deadlineTlsInsecure: boolean;
  failedJobsLookbackHours: number;
  host: string;
  pollIntervalSeconds: number;
  port: number;
  roomKeys: string[];
  staleAfterSeconds: number;
  workerDisplayNames: Record<string, string>;
  workerIssuesLookbackMinutes: number;
}

function parsePositiveInt(
  rawValue: string | undefined,
  fallback: number,
  fieldName: string
): number {
  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return parsed;
}

function parseRoomKeys(rawValue: string | undefined): string[] {
  const defaultRoomKeys = ["ula-501b", "ula-501c", "ula-502"];

  if (!rawValue) {
    return defaultRoomKeys;
  }

  const roomKeys = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return roomKeys.length > 0 ? roomKeys : defaultRoomKeys;
}

function parseBoolean(rawValue: string | undefined, fallback: boolean): boolean {
  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(
    `Boolean value expected but received "${rawValue}" for DEADLINE_TLS_INSECURE.`
  );
}

function parseWorkerDisplayNames(
  rawValue: string | undefined,
  cwd = process.cwd()
): Record<string, string> {
  const configuredPath = rawValue?.trim();
  const fallbackPath = path.resolve(cwd, "./config/worker-display-names.json");
  const filePath = configuredPath
    ? path.resolve(cwd, configuredPath)
    : fallbackPath;

  if (!fs.existsSync(filePath)) {
    return {};
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      `WORKER_DISPLAY_NAMES_PATH must point to a JSON object of worker name mappings.`
    );
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([workerName, displayName]) => {
      if (typeof displayName !== "string" || displayName.trim() === "") {
        throw new Error(
          `Worker display name mapping for "${workerName}" must be a non-empty string.`
        );
      }

      return [workerName.trim().toLowerCase(), displayName.trim()];
    })
  );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    databasePath: path.resolve(
      process.cwd(),
      env.DATABASE_PATH ?? "./data/deadline-dashboard.sqlite"
    ),
    deadlineBaseUrl: env.DEADLINE_BASE_URL?.trim() || null,
    deadlineRequestTimeoutMs: parsePositiveInt(
      env.DEADLINE_REQUEST_TIMEOUT_MS,
      10_000,
      "DEADLINE_REQUEST_TIMEOUT_MS"
    ),
    deadlineTlsInsecure: parseBoolean(env.DEADLINE_TLS_INSECURE, false),
    failedJobsLookbackHours: parsePositiveInt(
      env.FAILED_JOBS_LOOKBACK_HOURS,
      12,
      "FAILED_JOBS_LOOKBACK_HOURS"
    ),
    host: env.HOST?.trim() || "0.0.0.0",
    pollIntervalSeconds: parsePositiveInt(
      env.POLL_INTERVAL_SECONDS,
      15,
      "POLL_INTERVAL_SECONDS"
    ),
    port: parsePositiveInt(env.PORT, 3001, "PORT"),
    roomKeys: parseRoomKeys(env.ROOM_KEYS),
    staleAfterSeconds: parsePositiveInt(
      env.STALE_AFTER_SECONDS,
      45,
      "STALE_AFTER_SECONDS"
    ),
    workerDisplayNames: parseWorkerDisplayNames(env.WORKER_DISPLAY_NAMES_PATH),
    workerIssuesLookbackMinutes: parsePositiveInt(
      env.WORKER_ISSUES_LOOKBACK_MINUTES,
      30,
      "WORKER_ISSUES_LOOKBACK_MINUTES"
    )
  };
}
