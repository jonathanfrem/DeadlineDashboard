import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createDashboardRouter } from "./routes/dashboard.js";
import { createHealthRouter } from "./routes/health.js";
import type { DashboardRefreshService } from "./services/dashboard/refreshService.js";

export function createApp(refreshService: DashboardRefreshService): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.get("/", (_request, response) => {
    response.json({
      message: "Deadline Dashboard backend foundation is running.",
      routes: [
        "/api/health",
        "/api/dashboard/summary",
        "/api/dashboard/jobs",
        "/api/dashboard/rooms"
      ]
    });
  });

  app.use("/api/health", createHealthRouter(refreshService));
  app.use("/api/dashboard", createDashboardRouter(refreshService));

  app.use((_request, response) => {
    response.status(404).json({
      error: "Not Found"
    });
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction
    ) => {
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof (error as { status?: unknown }).status === "number"
          ? ((error as { status: number }).status ?? 500)
          : 500;

      response.status(statusCode).json({
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error while processing the request."
      });
    }
  );

  return app;
}

