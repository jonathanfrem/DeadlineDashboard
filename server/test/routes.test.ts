import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { DashboardRefreshService } from "../src/services/dashboard/refreshService.js";

interface MockResponse extends EventEmitter {
  body: unknown | undefined;
  headers: Record<string, string>;
  json: (payload: unknown) => MockResponse;
  locals: Record<string, unknown>;
  setHeader: (name: string, value: string) => void;
  status: (code: number) => MockResponse;
  statusCode: number;
}

function invokeApp(
  app: ReturnType<typeof createApp>,
  method: string,
  url: string
): Promise<MockResponse> {
  return new Promise((resolve, reject) => {
    const request = {
      app,
      headers: {},
      method,
      originalUrl: url,
      path: url,
      url
    } as never;
    const response = new EventEmitter() as MockResponse;
    response.body = undefined;
    response.headers = {};
    response.locals = {};
    response.statusCode = 200;
    response.setHeader = (name: string, value: string) => {
      response.headers[name.toLowerCase()] = value;
    };
    response.status = (code: number) => {
      response.statusCode = code;
      return response;
    };
    response.json = (payload: unknown) => {
      response.body = payload;
      resolve(response);
      return response;
    };

    (app as unknown as { handle: Function }).handle(
      request,
      response as never,
      (error: unknown) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(response);
      }
    );
  });
}

function createRefreshServiceStub(): DashboardRefreshService {
  return {
    async getDashboardData() {
      return {
        jobs: [
          {
            activeWorkersCount: 1,
            estimatedCompletionAt: null,
            group: "ula-501b",
            jobId: "job-1",
            name: "Render A",
            pool: "ula-501b",
            progressPercent: 25,
            renderingChunks: 1,
            status: "Rendering",
            statusCode: 1,
            submittedAt: "2026-03-17T12:00:00.000Z",
            user: "jonathan"
          }
        ],
        roomsResponse: {
          capturedAt: "2026-03-17T12:00:00.000Z",
          poolValidationWarnings: [],
          rooms: [
            {
              displayName: "ula-501b",
              health: "green",
              poolName: "ula-501b",
              roomKey: "ula-501b",
              totals: {
                idle: 0,
                offline: 0,
                rendering: 1,
                stalled: 0,
                startingJob: 0,
                total: 1,
                unknown: 0
              },
              unmatchedWorkerCount: 0,
              utilization: 1
            }
          ],
          source: "live",
          unassignedWorkersCount: 0
        },
        snapshot: {
          capturedAt: "2026-03-17T12:00:00.000Z",
          jobs: [],
          rooms: [],
          source: "live",
          summary: {
            isStale: false,
            jobs: {
              failed: 0,
              pending: 0,
              queued: 0,
              rendering: 1,
              suspended: 0,
              total: 1,
              unknown: 0
            },
            lastUpdatedAt: "2026-03-17T12:00:00.000Z",
            onlineWorkers: 1,
            pollIntervalSeconds: 15,
            roomsWithIssues: [],
            totals: {
              idle: 0,
              offline: 0,
              rendering: 1,
              stalled: 0,
              startingJob: 0,
              total: 1,
              unknown: 0
            },
            utilization: 1
          }
        },
        summary: {
          isStale: false,
          jobs: {
            failed: 0,
            pending: 0,
            queued: 0,
            rendering: 1,
            suspended: 0,
            total: 1,
            unknown: 0
          },
          lastUpdatedAt: "2026-03-17T12:00:00.000Z",
          onlineWorkers: 1,
          pollIntervalSeconds: 15,
          roomsWithIssues: [],
          totals: {
            idle: 0,
            offline: 0,
            rendering: 1,
            stalled: 0,
            startingJob: 0,
            total: 1,
            unknown: 0
          },
          utilization: 1
        }
      };
    },
    async getHealth() {
      return {
        app: { uptimeSeconds: 10 },
        cache: {
          hasSnapshot: true,
          lastAttemptedRefreshAt: "2026-03-17T12:00:00.000Z",
          lastSuccessfulRefreshAt: "2026-03-17T12:00:00.000Z",
          pollIntervalSeconds: 15,
          staleAfterSeconds: 45
        },
        database: {
          connected: true,
          path: "/tmp/deadline-dashboard.sqlite"
        },
        deadline: {
          configured: true,
          lastError: null,
          reachable: true
        },
        status: "ok"
      };
    }
  } as unknown as DashboardRefreshService;
}

describe("app routes", () => {
  const app = createApp(createRefreshServiceStub());

  it("serves health data", async () => {
    const response = await invokeApp(app, "GET", "/api/health");

    expect(response.statusCode).toBe(200);
    expect((response.body as { status: string }).status).toBe("ok");
  });

  it("serves summary, jobs, and rooms with aligned capture headers", async () => {
    const summaryResponse = await invokeApp(app, "GET", "/api/dashboard/summary");
    const jobsResponse = await invokeApp(app, "GET", "/api/dashboard/jobs");
    const roomsResponse = await invokeApp(app, "GET", "/api/dashboard/rooms");

    expect(summaryResponse.statusCode).toBe(200);
    expect(jobsResponse.statusCode).toBe(200);
    expect(roomsResponse.statusCode).toBe(200);
    expect(summaryResponse.headers["x-dashboard-captured-at"]).toBe(
      jobsResponse.headers["x-dashboard-captured-at"]
    );
    expect(jobsResponse.headers["x-dashboard-captured-at"]).toBe(
      roomsResponse.headers["x-dashboard-captured-at"]
    );
    expect(Array.isArray(jobsResponse.body)).toBe(true);
    expect(
      Array.isArray((roomsResponse.body as { rooms: unknown[] }).rooms)
    ).toBe(true);
  });

  it("rejects unknown routes", async () => {
    const response = await invokeApp(app, "GET", "/api/does-not-exist");
    expect(response.statusCode).toBe(404);
  });
});
