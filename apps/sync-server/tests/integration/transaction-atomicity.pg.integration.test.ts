import { describe, expect, it } from "vitest";
import { createTestServer, encode, registerClient } from "../contract/helpers.js";

describe("transaction atomicity pg integration", () => {
  it("does not advance head when precondition fails", async () => {
    process.env.SYNC_STORAGE_BACKEND = "postgres";
    process.env.SYNC_ALLOW_DEGRADED_POSTGRES = "1";

    const app = await createTestServer();
    const spaceId = "space-tx-pg";
    const registration = await registerClient(app, spaceId, "device-tx-pg");

    const ok = await app.inject({
      method: "POST",
      url: `/v1/spaces/${spaceId}/changes`,
      headers: { authorization: `Bearer ${registration.access_token}` },
      payload: {
        client_id: registration.client_id,
        idempotency_key: "tx-idem-1",
        base_version: 0,
        expected_head: 0,
        ops: [{ op_type: "upsert", path: "tx.md", content_b64: encode("ok") }]
      }
    });
    expect(ok.statusCode).toBe(200);

    const fail = await app.inject({
      method: "POST",
      url: `/v1/spaces/${spaceId}/changes`,
      headers: { authorization: `Bearer ${registration.access_token}` },
      payload: {
        client_id: registration.client_id,
        idempotency_key: "tx-idem-2",
        base_version: 1,
        expected_head: 0,
        ops: [{ op_type: "upsert", path: "tx.md", content_b64: encode("should-fail") }]
      }
    });

    expect(fail.statusCode).toBe(412);

    const pull = await app.inject({
      method: "GET",
      url: `/v1/spaces/${spaceId}/changes?from_version=0`,
      headers: { authorization: `Bearer ${registration.access_token}` }
    });
    expect(pull.statusCode).toBe(200);
    expect((pull.json().changes as unknown[]).length).toBe(1);

    await app.close();
    delete process.env.SYNC_ALLOW_DEGRADED_POSTGRES;
  });
});
