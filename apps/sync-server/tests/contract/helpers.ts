import { createServer } from "../../src/api/server.js";

export async function createTestServer() {
  const app = await createServer({ jwtSecret: "test-secret" });
  await app.ready();
  return app;
}

export function encode(content: string): string {
  return Buffer.from(content, "utf8").toString("base64");
}

export async function registerClient(app: Awaited<ReturnType<typeof createTestServer>>, spaceId: string, deviceId: string) {
  const response = await app.inject({
    method: "POST",
    url: `/v1/spaces/${spaceId}/clients`,
    payload: {
      device_id: deviceId,
      client_name: deviceId
    }
  });

  return response.json() as {
    client_id: string;
    access_token: string;
    refresh_token: string;
    server_head: number;
  };
}
