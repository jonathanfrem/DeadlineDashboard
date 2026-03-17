import { Router } from "express";
import type { DashboardRefreshService } from "../services/dashboard/refreshService.js";

export function createDashboardRouter(
  refreshService: DashboardRefreshService
): Router {
  const router = Router();

  router.use(async (_request, response, next) => {
    try {
      const dashboardData = await refreshService.getDashboardData();
      response.locals.dashboardData = dashboardData;
      response.setHeader(
        "X-Dashboard-Captured-At",
        dashboardData.snapshot.capturedAt
      );
      response.setHeader("X-Dashboard-Source", dashboardData.snapshot.source);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get("/summary", (_request, response) => {
    response.json(response.locals.dashboardData.summary);
  });

  router.get("/jobs", (_request, response) => {
    response.json(response.locals.dashboardData.jobs);
  });

  router.get("/rooms", (_request, response) => {
    response.json(response.locals.dashboardData.roomsResponse);
  });

  return router;
}

