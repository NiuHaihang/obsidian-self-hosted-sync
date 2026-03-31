import { afterEach, describe, expect, it } from "vitest";
import { createTestServer, encode, registerClient } from "./helpers.js";

describe("push changes contract", () => {
  const servers: Array<Awaited<ReturnType<typeof createTestServer>>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()?.close();
    }
  });

  it("accepts push payload with merge preconditions", async () => {
    const app = await createTestServer();
    servers.push(app);
    const spaceId = "space-push";
    const registration = await registerClient(app, spaceId, "device-a");

    const response = await app.inject({
      method: "POST",
      url: `/v1/spaces/${spaceId}/changes`,
      headers: {
        authorization: `Bearer ${registration.access_token}`
      },
      payload: {
        client_id: registration.client_id,
        idempotency_key: "idem-001",
        base_version: 0,
        expected_head: 0,
        ops: [
          {
            op_type: "upsert",
            path: "abc.md",
            content_b64: encode("hello")
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.applied).toBe(true);
    expect(payload).toHaveProperty("new_head_version");
    expect(payload).toHaveProperty("merge_result");
  });
});
