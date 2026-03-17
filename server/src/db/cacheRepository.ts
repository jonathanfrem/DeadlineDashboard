import type {
  DashboardRoomsResponse,
  DashboardSnapshot,
  FarmOverviewSummary,
  JobRow
} from "@deadline-dashboard/contracts";
import type { SqliteDatabase } from "./database.js";

export interface CachedRecord<T> {
  expiresAt: string;
  fetchedAt: string;
  payload: T;
}

export interface DashboardCacheBundle {
  jobs: JobRow[];
  rooms: DashboardRoomsResponse;
  snapshot: DashboardSnapshot;
  summary: FarmOverviewSummary;
}

export class CacheRepository {
  constructor(private readonly db: SqliteDatabase) {}

  read<T>(cacheKey: string): CachedRecord<T> | null {
    const row = this.db
      .prepare(
        `
          SELECT payload_json, fetched_at, expires_at
          FROM resource_cache
          WHERE cache_key = ?
        `
      )
      .get(cacheKey) as
      | { payload_json: string; fetched_at: string; expires_at: string }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      expiresAt: row.expires_at,
      fetchedAt: row.fetched_at,
      payload: JSON.parse(row.payload_json) as T
    };
  }

  write<T>(
    cacheKey: string,
    payload: T,
    fetchedAt: string,
    expiresAt: string
  ): void {
    this.db
      .prepare(
        `
          INSERT INTO resource_cache (cache_key, payload_json, fetched_at, expires_at)
          VALUES (@cacheKey, @payloadJson, @fetchedAt, @expiresAt)
          ON CONFLICT(cache_key) DO UPDATE SET
            payload_json = excluded.payload_json,
            fetched_at = excluded.fetched_at,
            expires_at = excluded.expires_at
        `
      )
      .run({
        cacheKey,
        payloadJson: JSON.stringify(payload),
        fetchedAt,
        expiresAt
      });
  }

  writeDashboardBundle(
    bundle: DashboardCacheBundle,
    fetchedAt: string,
    expiresAt: string
  ): void {
    this.write("dashboard_snapshot", bundle.snapshot, fetchedAt, expiresAt);
    this.write("summary", bundle.summary, fetchedAt, expiresAt);
    this.write("jobs", bundle.jobs, fetchedAt, expiresAt);
    this.write("rooms", bundle.rooms, fetchedAt, expiresAt);
  }

  readDashboardBundle(): CachedRecord<DashboardCacheBundle> | null {
    const snapshot = this.read<DashboardSnapshot>("dashboard_snapshot");
    const summary = this.read<FarmOverviewSummary>("summary");
    const jobs = this.read<JobRow[]>("jobs");
    const rooms = this.read<DashboardRoomsResponse>("rooms");

    if (!snapshot || !summary || !jobs || !rooms) {
      return null;
    }

    return {
      fetchedAt: snapshot.fetchedAt,
      expiresAt: snapshot.expiresAt,
      payload: {
        snapshot: snapshot.payload,
        summary: summary.payload,
        jobs: jobs.payload,
        rooms: rooms.payload
      }
    };
  }

  appendFarmSnapshot(capturedAt: string, summary: FarmOverviewSummary): void {
    this.db
      .prepare(
        `
          INSERT INTO farm_snapshots (captured_at, summary_json)
          VALUES (?, ?)
        `
      )
      .run(capturedAt, JSON.stringify(summary));
  }
}

