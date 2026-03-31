import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authPreHandler } from "../../auth/jwt.js";
import type { ResolveRequest } from "../../service/sync-commit-service.js";
import { AppError } from "../error.js";
import { ERROR_CODES } from "../../../../../packages/shared-contracts/types/errors.js";

export async function registerConflictRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { spaceId: string; conflictSetId: string } }>(
    "/v1/spaces/:spaceId/conflicts/:conflictSetId",
    {
      preHandler: (request: FastifyRequest, reply: FastifyReply) =>
        authPreHandler(request, reply, app.syncContext.jwtSecret)
    },
    async (request: FastifyRequest<{ Params: { spaceId: string; conflictSetId: string } }>) => {
      if (
        app.syncContext.backend === "postgres" &&
        !app.syncContext.dbReady &&
        process.env.SYNC_ALLOW_DEGRADED_POSTGRES !== "1"
      ) {
        throw new AppError(503, ERROR_CODES.DB_NOT_READY, "PostgreSQL not ready", true);
      }

      const set = app.syncContext.repository.getConflictSet(
        request.params.spaceId,
        request.params.conflictSetId
      );
      if (!set) {
        throw new AppError(404, ERROR_CODES.INVALID_CHANGESET, "Conflict set not found");
      }
      return set;
    }
  );

  app.post<{ Params: { spaceId: string; conflictSetId: string }; Body: ResolveRequest }>(
    "/v1/spaces/:spaceId/conflicts/:conflictSetId/resolutions",
    {
      preHandler: (request: FastifyRequest, reply: FastifyReply) =>
        authPreHandler(request, reply, app.syncContext.jwtSecret)
    },
    async (
      request: FastifyRequest<{
        Params: { spaceId: string; conflictSetId: string };
        Body: ResolveRequest;
      }>
    ) => {
      if (
        app.syncContext.backend === "postgres" &&
        !app.syncContext.dbReady &&
        process.env.SYNC_ALLOW_DEGRADED_POSTGRES !== "1"
      ) {
        throw new AppError(503, ERROR_CODES.DB_NOT_READY, "PostgreSQL not ready", true);
      }

      return app.syncContext.conflictResolutionService.resolve(
        request.params.spaceId,
        request.params.conflictSetId,
        request.body,
        request.id
      );
    }
  );
}
