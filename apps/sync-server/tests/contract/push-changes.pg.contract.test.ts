import { afterEach, describe, expect, it } from "vitest";
import { createTestServer, encode, registerClient } from "./helpers.js";

describe("push changes pg contract", () => {
  const servers: Array<Awaited<ReturnType<typeof createTestServer>>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()?.close();
    }
  });

  it("accepts transactional push payload", async () => {
    process.env.SYNC_STORAGE_BACKEND = "memory";
    const app = await createTestServer();
    servers.push(app);

    const registration = await registerClient(app, "space-pg-push", "device-pg-push");
    const response = await app.inject({
      method: "POST",
      url: "/v1/spaces/space-pg-push/changes",
      headers: {
        authorization: `Bearer ${registration.access_token}`
      },
      payload: {
        client_id: registration.client_id,
        idempotency_key: "pg-idem-1",
        base_version: 0,
        expected_head: 0,
        ops: [{ op_type: "upsert", path: "note.md", content_b64: encode("pg") }]
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.applied).toBe(true);
    expect(body).toHaveProperty("new_head_version");
    expect(body).toHaveProperty("merge_result");
  });
});
