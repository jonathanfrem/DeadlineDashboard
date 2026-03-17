import path from "node:path";

export interface AppConfig {
  databasePath: string;
  deadlineBaseUrl: string | null;
  deadlineRequestTimeoutMs: number;
  pollIntervalSeconds: number;
  port: number;
  roomKeys: string[];
  staleAfterSeconds: number;
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
    )
  };
}

