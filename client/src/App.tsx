import { useEffect, useState } from "react";
import type { HealthCheckResponse } from "@deadline-dashboard/contracts";

type HealthState =
  | { status: "loading" }
  | { status: "ready"; data: HealthCheckResponse }
  | { status: "error"; message: string };

export default function App() {
  const [healthState, setHealthState] = useState<HealthState>({
    status: "loading"
  });

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/health", {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Health check failed with ${response.status}`);
        }

        const data = (await response.json()) as HealthCheckResponse;
        setHealthState({ status: "ready", data });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setHealthState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to reach backend health endpoint."
        });
      }
    })();

    return () => controller.abort();
  }, []);

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Deadline Dashboard</p>
        <h1>Phase 1 foundation only</h1>
        <p className="lead">
          The backend integration, normalization layer, SQLite cache, and
          read-only API routes are ready for Phase 2 UI work.
        </p>
        <div className="status-row">
          <div className="status-card">
            <span>Backend</span>
            <strong>
              {healthState.status === "loading"
                ? "Checking"
                : healthState.status === "error"
                  ? "Unavailable"
                  : healthState.data.status === "ok"
                    ? "Healthy"
                    : "Degraded"}
            </strong>
          </div>
          <div className="status-card">
            <span>Deadline</span>
            <strong>
              {healthState.status === "ready" &&
              healthState.data.deadline.configured
                ? healthState.data.deadline.reachable
                  ? "Reachable"
                  : "Needs attention"
                : "Not configured"}
            </strong>
          </div>
          <div className="status-card">
            <span>SQLite</span>
            <strong>
              {healthState.status === "ready" &&
              healthState.data.database.connected
                ? "Ready"
                : "Pending"}
            </strong>
          </div>
        </div>
        <pre className="status-output">
          {healthState.status === "loading"
            ? "Fetching /api/health ..."
            : healthState.status === "error"
              ? healthState.message
              : JSON.stringify(healthState.data, null, 2)}
        </pre>
      </section>
    </main>
  );
}

