import { describe, expect, it } from "vitest";
import { createTestServer, encode, registerClient } from "../contract/helpers.js";

describe("restart persistence pg integration", () => {
  it("keeps committed data after service restart in postgres backend", async () => {
    process.env.SYNC_STORAGE_BACKEND = "postgres";
    process.env.SYNC_ALLOW_DEGRADED_POSTGRES = "1";

    const first = await createTestServer();
    const spaceId = "space-restart-pg";
    const registration = await registerClient(first, spaceId, "device-restart-pg");

    const push = await first.inject({
      method: "POST",
      url: `/v1/spaces/${spaceId}/changes`,
      headers: { authorization: `Bearer ${registration.access_token}` },
      payload: {
        client_id: registration.client_id,
        idempotency_key: "restart-idem-1",
        base_version: 0,
        expected_head: 0,
        ops: [{ op_type: "upsert", path: "restart.md", content_b64: encode("persist") }]
      }
    });

    expect(push.statusCode).toBe(200);
    await first.close();

    const second = await createTestServer();
    const pull = await second.inject({
      method: "GET",
      url: `/v1/spaces/${spaceId}/changes?from_version=0`,
      headers: { authorization: `Bearer ${registration.access_token}` }
    });

    expect(pull.statusCode).toBe(200);
    expect((pull.json().changes as unknown[]).length).toBeGreaterThan(0);
    await second.close();
    delete process.env.SYNC_ALLOW_DEGRADED_POSTGRES;
  });
});
