import { readdir } from "node:fs/promises";
import { InMemorySyncRepository } from "../repository/sync-repository.js";
import type { SyncRepository } from "../repository/sync-repository.interface.js";
import { loadDatabaseConfig } from "../config/database.js";
import { checkPgConnection, createPgPool } from "../repository/postgres/pool.js";
import { MigrationStatusService } from "../service/migration-status-service.js";
import { PostgresSyncWriteRepository } from "../repository/postgres/postgres-sync-write-repository.js";

export interface RepositoryContext {
  repository: SyncRepository;
  backend: "memory" | "postgres";
  dbReady: boolean;
  migrationStatusService: MigrationStatusService;
}

async function listExpectedMigrationVersions(): Promise<string[]> {
  const files = await readdir("apps/sync-server/src/repository/migrations");
  return files
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .map((name) => name.replace(/\.sql$/, ""))
    .sort();
}

export async function createRepositoryContext(): Promise<RepositoryContext> {
  const config = loadDatabaseConfig();

  if (config.backend === "postgres") {
    const pool = createPgPool(config);
    const dbReady = await checkPgConnection(pool);
    const migrationStatusService = new MigrationStatusService(pool);
    const expected = await listExpectedMigrationVersions();
    const status = await migrationStatusService.getStatus(expected);

    if (!dbReady || !status.db_connected) {
      return {
        repository: new PostgresSyncWriteRepository(),
        backend: "postgres",
        dbReady: false,
        migrationStatusService
      };
    }

    return {
      repository: new PostgresSyncWriteRepository(),
      backend: "postgres",
      dbReady: true,
      migrationStatusService
    };
  }

  return {
    repository: new InMemorySyncRepository(),
    backend: "memory",
    dbReady: true,
    migrationStatusService: new MigrationStatusService(null)
  };
}
