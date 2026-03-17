import { Router } from "express";
import type { DashboardRefreshService } from "../services/dashboard/refreshService.js";

export function createHealthRouter(refreshService: DashboardRefreshService): Router {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      const payload = await refreshService.getHealth();
      response.json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

