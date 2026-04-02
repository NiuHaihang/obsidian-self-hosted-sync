import Fastify, {
  type FastifyInstance,
  type FastifyError,
  type FastifyReply,
  type FastifyRequest
} from "fastify";
import { toErrorEnvelope, AppError } from "./error.js";
import { ERROR_CODES } from "../../../../packages/shared-contracts/types/errors.js";
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

function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function resolveCorsOrigin(requestOrigin: string | undefined, configuredOrigins: string[]): string | null {
  if (configuredOrigins.includes("*")) {
    return "*";
  }

  if (!requestOrigin) {
    return null;
  }

  return configuredOrigins.includes(requestOrigin) ? requestOrigin : null;
}

export async function createServer(options: CreateServerOptions = {}): Promise<FastifyInstance> {
  const configuredBodyLimit = Number.parseInt(process.env.SYNC_BODY_LIMIT_BYTES ?? "52428800", 10);
  const bodyLimit = Number.isFinite(configuredBodyLimit) && configuredBodyLimit > 0
    ? configuredBodyLimit
    : 52428800;
  const app = Fastify({ logger: true, bodyLimit });
  const corsOrigins = parseCorsOrigins(process.env.SYNC_CORS_ORIGIN ?? "*");
  const corsMethods = process.env.SYNC_CORS_METHODS ?? "GET,POST,OPTIONS";
  const corsHeaders = process.env.SYNC_CORS_HEADERS ?? "Content-Type, Authorization";

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

  app.addHook("onClose", async () => {
    if (repositoryContext.close) {
      await repositoryContext.close();
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    const requestOrigin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
    const allowedOrigin = resolveCorsOrigin(requestOrigin, corsOrigins);

    if (allowedOrigin) {
      reply.header("Access-Control-Allow-Origin", allowedOrigin);
      if (allowedOrigin !== "*") {
        reply.header("Vary", "Origin");
      }
    }

    reply.header("Access-Control-Allow-Methods", corsMethods);
    reply.header("Access-Control-Allow-Headers", corsHeaders);
    reply.header("Access-Control-Max-Age", "86400");

    if (request.method === "OPTIONS") {
      void reply.code(204).send();
      return;
    }
  });

  app.setErrorHandler((error: FastifyError | AppError, request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = error instanceof AppError
      ? error.statusCode
      : (typeof error.statusCode === "number" ? error.statusCode : 500);

    if (!(error instanceof AppError) && statusCode >= 500) {
      app.log.error({ err: error, reqId: request.id }, "Unhandled server error");
    }

    const normalizedError = statusCode >= 400 && statusCode < 500 && !(error instanceof AppError)
      ? new AppError(statusCode, ERROR_CODES.INVALID_CHANGESET, error.message || "Invalid request payload")
      : error;
    const envelope = toErrorEnvelope(normalizedError, request.id);
    reply.status(statusCode).send(envelope);
  });

  await registerRoutes(app);
  return app;
}
