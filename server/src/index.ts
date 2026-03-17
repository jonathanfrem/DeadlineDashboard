import { loadConfig } from "./config/env.js";
import { createDatabase } from "./db/database.js";
import { CacheRepository } from "./db/cacheRepository.js";
import { createApp } from "./app.js";
import { DeadlineApiClient } from "./services/deadline/client.js";
import { DashboardRefreshService } from "./services/dashboard/refreshService.js";

const config = loadConfig();
const database = createDatabase(config.databasePath);
const cacheRepository = new CacheRepository(database);
const deadlineClient = new DeadlineApiClient(
  config.deadlineBaseUrl,
  config.deadlineRequestTimeoutMs
);
const refreshService = new DashboardRefreshService(
  config,
  cacheRepository,
  deadlineClient
);
const app = createApp(refreshService);

const server = app.listen(config.port, () => {
  console.log(`Deadline Dashboard backend listening on http://localhost:${config.port}`);
});

function shutdown(): void {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

