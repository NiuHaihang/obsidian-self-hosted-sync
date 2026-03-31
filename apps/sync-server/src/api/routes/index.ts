import type { FastifyInstance } from "fastify";
import { getOpenApiContractFile } from "../../../../../packages/shared-contracts/openapi/generated.js";
import { registerHealthRoutes } from "./health.js";
import { registerMigrationStatusRoutes } from "./migration-status.js";
import { registerClientRoutes } from "./register-client.js";
import { registerPullChangesRoutes } from "./pull-changes.js";
import { registerPushChangesRoutes } from "./push-changes.js";
import { registerConflictRoutes } from "./conflicts.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await registerHealthRoutes(app);
  await registerMigrationStatusRoutes(app);
  await registerClientRoutes(app);
  await registerPullChangesRoutes(app);
  await registerPushChangesRoutes(app);
  await registerConflictRoutes(app);

  app.get("/v1/meta/openapi-source", async () => {
    return { file: getOpenApiContractFile() };
  });
}
