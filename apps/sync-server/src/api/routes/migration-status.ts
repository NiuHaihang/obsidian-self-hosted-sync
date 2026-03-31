import { readdir } from "node:fs/promises";
import type { FastifyInstance } from "fastify";

async function listExpectedVersions(): Promise<string[]> {
  const files = await readdir("apps/sync-server/src/repository/migrations");
  return files
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .map((name) => name.replace(/\.sql$/, ""))
    .sort();
}

export async function registerMigrationStatusRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/admin/migrations/status", async () => {
    const expected = await listExpectedVersions();
    return app.syncContext.migrationStatusService.getStatus(expected);
  });
}
