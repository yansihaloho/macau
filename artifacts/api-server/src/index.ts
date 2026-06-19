import app from "./app";
import { logger } from "./lib/logger";
import { syncYearToDb } from "./routes/sync";
import { startScheduler } from "./scheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Auto-sync lottery data on startup (non-blocking)
  Promise.all([syncYearToDb(2025), syncYearToDb(2026)])
    .then(([r2025, r2026]) => {
      logger.info(
        { inserted2025: r2025.inserted, inserted2026: r2026.inserted },
        "Startup sync complete"
      );
    })
    .catch((err) => {
      logger.warn({ err }, "Startup sync failed — will retry on next request");
    });

  // Start auto-predict scheduler (every 30 min: sync + generate V4 for all sessions)
  startScheduler();
});
