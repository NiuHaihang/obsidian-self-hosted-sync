import Fastify, {
  type FastifyInstance,
  type FastifyError,
  type FastifyReply,
  type FastifyRequest
} from "fastify";
import { toErrorEnvelope, AppError } from "./error.js";
import { registerRoutes } from "./routes/index.js";
import type { SyncRepository } from "../repository/sync-repository.interface.js";
import { SyncCommitService } from "../service/sync-commit-service.js";
import { SyncAuditService } from "../service/sync-audit-service.js";
import { ConflictResolutionService } from "../service/conflict-resolution-service.js";
import { createRepositoryContext } from "../bootstrap/repository-provider.js";
import type { MigrationStatusService } from "../service/migration-status-service.js";

export interface SyncContext {
  jwtSecret: string;
  repository: SyncRepository;
  syncCommitService: SyncCommitService;
  auditService: SyncAuditService;
  conflictResolutionService: ConflictResolutionService;
  backend: "memory" | "postgres";
  dbReady: boolean;
  migrationStatusService: MigrationStatusService;
}

declare module "fastify" {
  interface FastifyInstance {
    syncContext: SyncContext;
  }
}

export interface CreateServerOptions {
  jwtSecret?: string;
}

export async function createServer(options: CreateServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  const repositoryContext = await createRepositoryContext();
  const repository = repositoryContext.repository;
  const auditService = new SyncAuditService();
  const syncCommitService = new SyncCommitService(repository as never, auditService);
  const conflictResolutionService = new ConflictResolutionService(syncCommitService);

  app.decorate("syncContext", {
    jwtSecret: options.jwtSecret ?? "dev-secret",
    repository,
    syncCommitService,
    auditService,
    conflictResolutionService,
    backend: repositoryContext.backend,
    dbReady: repositoryContext.dbReady,
    migrationStatusService: repositoryContext.migrationStatusService
  });

  app.setErrorHandler((error: FastifyError | AppError, request: FastifyRequest, reply: FastifyReply) => {
    const envelope = toErrorEnvelope(error, request.id);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    reply.status(statusCode).send(envelope);
  });

  await registerRoutes(app);
  return app;
}
