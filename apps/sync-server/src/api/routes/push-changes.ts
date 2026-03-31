import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authPreHandler } from "../../auth/jwt.js";
import type { PushChangesRequest } from "../../service/sync-commit-service.js";
import { AppError } from "../error.js";
import { ERROR_CODES } from "../../../../../packages/shared-contracts/types/errors.js";

export async function registerPushChangesRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { spaceId: string }; Body: PushChangesRequest }>(
    "/v1/spaces/:spaceId/changes",
    {
      preHandler: (request: FastifyRequest, reply: FastifyReply) =>
        authPreHandler(request, reply, app.syncContext.jwtSecret)
    },
    async (request: FastifyRequest<{ Params: { spaceId: string }; Body: PushChangesRequest }>) => {
      if (
        app.syncContext.backend === "postgres" &&
        !app.syncContext.dbReady &&
        process.env.SYNC_ALLOW_DEGRADED_POSTGRES !== "1"
      ) {
        throw new AppError(503, ERROR_CODES.DB_NOT_READY, "PostgreSQL not ready", true);
      }

      return app.syncContext.syncCommitService.push(
        request.params.spaceId,
        request.body,
        request.id
      );
    }
  );
}
