import { afterEach, describe, expect, it } from "vitest";
import { createTestServer, encode, registerClient } from "./helpers.js";

describe("conflicts pg contract", () => {
  const servers: Array<Awaited<ReturnType<typeof createTestServer>>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()?.close();
    }
  });

  it("creates conflict set and resolves it", async () => {
    process.env.SYNC_STORAGE_BACKEND = "memory";
    const app = await createTestServer();
    servers.push(app);
    const spaceId = "space-pg-conflict";
    const a = await registerClient(app, spaceId, "device-pga");
    const b = await registerClient(app, spaceId, "device-pgb");

    await app.inject({
      method: "POST",
      url: `/v1/spaces/${spaceId}/changes`,
      headers: { authorization: `Bearer ${a.access_token}` },
      payload: {
        client_id: a.client_id,
        idempotency_key: "pg-a-1",
        base_version: 0,
        expected_head: 0,
        ops: [{ op_type: "upsert", path: "same.md", content_b64: encode("A") }]
      }
    });

    const second = await app.inject({
      method: "POST",
      url: `/v1/spaces/${spaceId}/changes`,
      headers: { authorization: `Bearer ${b.access_token}` },
      payload: {
        client_id: b.client_id,
        idempotency_key: "pg-b-1",
        base_version: 0,
        expected_head: 1,
        ops: [{ op_type: "upsert", path: "same.md", content_b64: encode("B") }]
      }
    });

    expect(second.statusCode).toBe(200);
    const pushPayload = second.json();
    expect(pushPayload.conflict_set_id).toBeTruthy();

    const query = await app.inject({
      method: "GET",
      url: `/v1/spaces/${spaceId}/conflicts/${pushPayload.conflict_set_id}`,
      headers: { authorization: `Bearer ${b.access_token}` }
    });
    expect(query.statusCode).toBe(200);
  });
});
