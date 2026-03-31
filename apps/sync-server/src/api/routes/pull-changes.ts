import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authPreHandler } from "../../auth/jwt.js";
import { AppError } from "../error.js";
import { ERROR_CODES } from "../../../../../packages/shared-contracts/types/errors.js";

export async function registerPullChangesRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { spaceId: string }; Querystring: { from_version: string; limit?: string; cursor?: string } }>(
    "/v1/spaces/:spaceId/changes",
    {
      preHandler: (request: FastifyRequest, reply: FastifyReply) =>
        authPreHandler(request, reply, app.syncContext.jwtSecret)
    },
    async (
      request: FastifyRequest<{
        Params: { spaceId: string };
        Querystring: { from_version: string; limit?: string; cursor?: string };
      }>
    ) => {
      if (
        app.syncContext.backend === "postgres" &&
        !app.syncContext.dbReady &&
        process.env.SYNC_ALLOW_DEGRADED_POSTGRES !== "1"
      ) {
        throw new AppError(503, ERROR_CODES.DB_NOT_READY, "PostgreSQL not ready", true);
      }

      const fromVersion = Number.parseInt(request.query.from_version, 10);
      const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : 200;
      return app.syncContext.syncCommitService.pull(
        request.params.spaceId,
        Number.isFinite(fromVersion) ? fromVersion : 0,
        Number.isFinite(limit) ? limit : 200,
        request.query.cursor
      );
    }
  );
}
