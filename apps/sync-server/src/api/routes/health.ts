import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/readyz", async (_, reply) => {
    if (app.syncContext.backend === "memory") {
      return {
        status: "ready",
        db: "up",
        objectStore: "up"
      };
    }

    const migration = await app.syncContext.migrationStatusService.getStatus();
    const ready = app.syncContext.dbReady && migration.db_connected;
    const body = {
      status: ready ? "ready" : "not_ready",
      db: ready ? "up" : "down",
      migration_version: migration.current_version
    };

    if (!ready) {
      return reply.status(503).send(body);
    }

    return body;
  });
}
