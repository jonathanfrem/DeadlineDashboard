import type {
  DashboardRoomsResponse,
  DashboardSnapshot,
  FarmOverviewSummary,
  HealthCheckResponse,
  JobRow
} from "@deadline-dashboard/contracts";
import type { AppConfig } from "../../config/env.js";
import { CacheRepository, type DashboardCacheBundle } from "../../db/cacheRepository.js";
import { DeadlineApiClient } from "../deadline/client.js";
import { markSnapshotAsStale, normalizeDeadlineData } from "../deadline/normalizers.js";

export interface DashboardDataPayload {
  jobs: JobRow[];
  roomsResponse: DashboardRoomsResponse;
  snapshot: DashboardSnapshot;
  summary: FarmOverviewSummary;
}

export class DashboardRefreshService {
  private inFlightRefresh: Promise<DashboardDataPayload> | null = null;
  private lastAttemptedRefreshAt: string | null = null;
  private lastError: string | null = null;
  private lastSuccessfulRefreshAt: string | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly cacheRepository: CacheRepository,
    private readonly deadlineClient: DeadlineApiClient,
    private readonly appStartedAt = Date.now()
  ) {}

  async getDashboardData(): Promise<DashboardDataPayload> {
    const cachedBundle = this.cacheRepository.readDashboardBundle();
    const now = Date.now();

    if (cachedBundle && Date.parse(cachedBundle.expiresAt) > now) {
      return this.hydrateFromCache(cachedBundle.payload, false);
    }

    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    this.inFlightRefresh = this.refreshFromDeadline(cachedBundle?.payload).finally(() => {
      this.inFlightRefresh = null;
    });

    return this.inFlightRefresh;
  }

  async getHealth(): Promise<HealthCheckResponse> {
    const cachedBundle = this.cacheRepository.readDashboardBundle();

    if (!cachedBundle && this.deadlineClient.isConfigured) {
      try {
        await this.getDashboardData();
      } catch {
        // The detailed error is already tracked on the service.
      }
    }

    const hasSnapshot = this.cacheRepository.readDashboardBundle() !== null;
    const cacheHealthy =
      !this.lastError &&
      (!this.lastSuccessfulRefreshAt ||
        Date.now() - Date.parse(this.lastSuccessfulRefreshAt) <=
          this.config.staleAfterSeconds * 1000);

    return {
      app: {
        uptimeSeconds: Math.floor((Date.now() - this.appStartedAt) / 1000)
      },
      cache: {
        hasSnapshot,
        lastAttemptedRefreshAt: this.lastAttemptedRefreshAt,
        lastSuccessfulRefreshAt: this.lastSuccessfulRefreshAt,
        pollIntervalSeconds: this.config.pollIntervalSeconds,
        staleAfterSeconds: this.config.staleAfterSeconds
      },
      database: {
        connected: true,
        path: this.config.databasePath
      },
      deadline: {
        configured: this.deadlineClient.isConfigured,
        lastError: this.lastError,
        reachable: this.deadlineClient.isConfigured && cacheHealthy
      },
      status:
        !this.deadlineClient.isConfigured || cacheHealthy ? "ok" : "degraded"
    };
  }

  private hydrateFromCache(
    bundle: DashboardCacheBundle,
    stale: boolean
  ): DashboardDataPayload {
    if (!stale) {
      return {
        jobs: bundle.jobs,
        roomsResponse: {
          ...bundle.rooms,
          source: "cache"
        },
        snapshot: {
          ...bundle.snapshot,
          source: "cache",
          summary: {
            ...bundle.summary,
            isStale: false
          }
        },
        summary: {
          ...bundle.summary,
          isStale: false
        }
      };
    }

    return markSnapshotAsStale(bundle.snapshot, bundle.jobs, bundle.rooms);
  }

  private async refreshFromDeadline(
    cachedBundle: DashboardCacheBundle | undefined
  ): Promise<DashboardDataPayload> {
    this.lastAttemptedRefreshAt = new Date().toISOString();

    try {
      const responses = await this.deadlineClient.fetchCurrentState();
      const normalized = normalizeDeadlineData(responses, {
        pollIntervalSeconds: this.config.pollIntervalSeconds,
        roomKeys: this.config.roomKeys,
        source: "live",
        stale: false
      });
      const fetchedAt = normalized.snapshot.capturedAt;
      const expiresAt = new Date(
        Date.parse(fetchedAt) + this.config.pollIntervalSeconds * 1000
      ).toISOString();

      this.cacheRepository.writeDashboardBundle(
        {
          jobs: normalized.jobs,
          rooms: normalized.roomsResponse,
          snapshot: normalized.snapshot,
          summary: normalized.summary
        },
        fetchedAt,
        expiresAt
      );
      this.cacheRepository.appendFarmSnapshot(fetchedAt, normalized.summary);
      this.lastSuccessfulRefreshAt = fetchedAt;
      this.lastError = null;

      return {
        jobs: normalized.jobs,
        roomsResponse: normalized.roomsResponse,
        snapshot: normalized.snapshot,
        summary: normalized.summary
      };
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : "Unknown dashboard refresh error.";

      if (cachedBundle) {
        return this.hydrateFromCache(cachedBundle, true);
      }

      throw error;
    }
  }
}

