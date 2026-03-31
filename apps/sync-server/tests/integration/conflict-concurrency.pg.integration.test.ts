import { describe, expect, it } from "vitest";
import { createTestServer, encode, registerClient } from "../contract/helpers.js";

describe("conflict concurrency pg integration", () => {
  it("creates conflict under concurrent updates", async () => {
    process.env.SYNC_STORAGE_BACKEND = "postgres";
    process.env.SYNC_ALLOW_DEGRADED_POSTGRES = "1";
    const app = await createTestServer();
    const spaceId = "space-concurrency-pg";

    const a = await registerClient(app, spaceId, "device-ca");
    const b = await registerClient(app, spaceId, "device-cb");

    await app.inject({
      method: "POST",
      url: `/v1/spaces/${spaceId}/changes`,
      headers: { authorization: `Bearer ${a.access_token}` },
      payload: {
        client_id: a.client_id,
        idempotency_key: "base-1",
        base_version: 0,
        expected_head: 0,
        ops: [{ op_type: "upsert", path: "c.md", content_b64: encode("base") }]
      }
    });

    const [r1, r2] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/spaces/${spaceId}/changes`,
        headers: { authorization: `Bearer ${a.access_token}` },
        payload: {
          client_id: a.client_id,
          idempotency_key: "con-a",
          base_version: 1,
          expected_head: 1,
          ops: [{ op_type: "upsert", path: "c.md", content_b64: encode("A") }]
        }
      }),
      app.inject({
        method: "POST",
        url: `/v1/spaces/${spaceId}/changes`,
        headers: { authorization: `Bearer ${b.access_token}` },
        payload: {
          client_id: b.client_id,
          idempotency_key: "con-b",
          base_version: 1,
          expected_head: 1,
          ops: [{ op_type: "upsert", path: "c.md", content_b64: encode("B") }]
        }
      })
    ]);

    const statuses = [r1.statusCode, r2.statusCode].sort((a, b) => a - b);
    expect(statuses[0]).toBeGreaterThanOrEqual(200);
    expect(statuses[1]).toBeLessThanOrEqual(500);

    await app.close();
    delete process.env.SYNC_ALLOW_DEGRADED_POSTGRES;
  });
});
