import { getWorkerName } from "./mappers.js";
import { DEADLINE_ENDPOINTS, getWorkerReportsEndpoint } from "./queries.js";
import type {
  DeadlineApiResponses,
  DeadlineRecord,
  WorkerReportListing
} from "./types.js";

export class DeadlineApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "DeadlineApiError";
  }
}

export class DeadlineApiClient {
  private readonly baseUrl: string | null;

  constructor(
    baseUrl: string | null,
    private readonly timeoutMs: number
  ) {
    this.baseUrl = baseUrl ? baseUrl.replace(/\/$/, "") : null;
  }

  get isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  async fetchCurrentState(): Promise<DeadlineApiResponses> {
    const [groups, jobs, pools, workerInfo, workerInfoSettings] = await Promise.all([
      this.getStringArray(DEADLINE_ENDPOINTS.groups),
      this.getRecords(DEADLINE_ENDPOINTS.jobs),
      this.getStringArray(DEADLINE_ENDPOINTS.pools),
      this.getRecords(DEADLINE_ENDPOINTS.workerInfo),
      this.getRecords(DEADLINE_ENDPOINTS.workerInfoSettings)
    ]);

    const workerReports = await this.getWorkerReports(workerInfo, workerInfoSettings);

    return {
      groups,
      jobs,
      pools,
      workerInfo,
      workerInfoSettings,
      workerReports
    };
  }

  private coerceRecords(value: unknown): DeadlineRecord[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (entry): entry is DeadlineRecord =>
        typeof entry === "object" && entry !== null && !Array.isArray(entry)
    );
  }

  private parseWorkerReportsPayload(
    workerName: string,
    payload: unknown
  ): WorkerReportListing[] {
    const directReports = this.coerceRecords(payload);

    if (directReports.length > 0) {
      return [{ reports: directReports, workerName }];
    }

    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return [];
    }

    const payloadRecord = payload as Record<string, unknown>;
    const nestedDirectReports = this.coerceRecords(
      payloadRecord.Reports ?? payloadRecord.WorkerReports ?? payloadRecord.results
    );

    if (nestedDirectReports.length > 0) {
      return [{ reports: nestedDirectReports, workerName }];
    }

    return Object.entries(payloadRecord).flatMap(([entryKey, entryValue]) => {
      const reports = this.coerceRecords(entryValue);

      if (reports.length > 0) {
        return [{ reports, workerName: entryKey }];
      }

      if (
        typeof entryValue === "object" &&
        entryValue !== null &&
        !Array.isArray(entryValue)
      ) {
        const nestedEntry = entryValue as Record<string, unknown>;
        const nestedReports = this.coerceRecords(
          nestedEntry.Reports ??
            nestedEntry.WorkerReports ??
            nestedEntry.results
        );

        if (nestedReports.length > 0) {
          return [{ reports: nestedReports, workerName: entryKey }];
        }
      }

      return [];
    });
  }

  private async getWorkerReports(
    workerInfo: DeadlineRecord[],
    workerInfoSettings: DeadlineRecord[]
  ): Promise<WorkerReportListing[]> {
    const workerNames = Array.from(
      new Set(
        [...workerInfo, ...workerInfoSettings]
          .map((record) => getWorkerName(record))
          .filter((workerName): workerName is string => Boolean(workerName))
      )
    );

    if (workerNames.length === 0) {
      return [];
    }

    const reportResponses = await Promise.allSettled(
      workerNames.map(async (workerName) =>
        this.parseWorkerReportsPayload(
          workerName,
          await this.getJson(getWorkerReportsEndpoint(workerName))
        )
      )
    );

    return reportResponses.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );
  }

  private async getStringArray(pathname: string): Promise<string[]> {
    const payload = await this.getJson(pathname);

    if (Array.isArray(payload)) {
      return payload.filter((value): value is string => typeof value === "string");
    }

    throw new DeadlineApiError(`Expected an array response from ${pathname}.`);
  }

  private async getRecords(pathname: string): Promise<DeadlineRecord[]> {
    const payload = await this.getJson(pathname);

    if (Array.isArray(payload)) {
      return payload.filter(
        (value): value is DeadlineRecord =>
          typeof value === "object" && value !== null && !Array.isArray(value)
      );
    }

    throw new DeadlineApiError(`Expected an array of records from ${pathname}.`);
  }

  private async getJson(pathname: string): Promise<unknown> {
    if (!this.baseUrl) {
      throw new DeadlineApiError(
        "DEADLINE_BASE_URL is not configured. Set it before requesting dashboard data."
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${pathname}`, {
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new DeadlineApiError(
          `Deadline request failed for ${pathname}: ${response.status} ${response.statusText}`,
          response.status
        );
      }

      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof DeadlineApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new DeadlineApiError(
          `Deadline request timed out after ${this.timeoutMs}ms for ${pathname}.`
        );
      }

      throw new DeadlineApiError(
        error instanceof Error
          ? error.message
          : `Unknown Deadline request failure for ${pathname}.`
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
