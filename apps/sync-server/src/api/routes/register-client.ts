import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { signAccessToken, signRefreshToken } from "../../auth/jwt.js";

interface RegisterBody {
  device_id: string;
  client_name: string;
  capabilities?: string[];
  last_known_version?: number;
}

export async function registerClientRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { spaceId: string }; Body: RegisterBody }>(
    "/v1/spaces/:spaceId/clients",
    async (
      request: FastifyRequest<{ Params: { spaceId: string }; Body: RegisterBody }>,
      reply: FastifyReply
    ) => {
      const { spaceId } = request.params;
      const body = request.body;
      const clientId = app.syncContext.repository.registerClient(spaceId, body.device_id || randomUUID());
      const sid = randomUUID();

      const accessToken = signAccessToken(
        { sub: spaceId, did: clientId, sid },
        app.syncContext.jwtSecret
      );
      const refreshToken = signRefreshToken(
        { sub: spaceId, did: clientId, sid },
        app.syncContext.jwtSecret,
        "7d"
      );

      return reply.code(201).send({
        client_id: clientId,
        access_token: accessToken,
        refresh_token: refreshToken,
        server_head: app.syncContext.repository.getHeadVersion(spaceId),
        snapshot_required: body.last_known_version === undefined
      });
    }
  );
}
