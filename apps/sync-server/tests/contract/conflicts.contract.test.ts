import { afterEach, describe, expect, it } from "vitest";
import { createTestServer, encode, registerClient } from "./helpers.js";

describe("conflict contract", () => {
  const servers: Array<Awaited<ReturnType<typeof createTestServer>>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()?.close();
    }
  });

  it("creates and resolves conflict set", async () => {
    const app = await createTestServer();
    servers.push(app);
    const spaceId = "space-conflict";
    const clientA = await registerClient(app, spaceId, "device-a");
    const clientB = await registerClient(app, spaceId, "device-b");

    const firstPush = await app.inject({
      method: "POST",
      url: `/v1/spaces/${spaceId}/changes`,
      headers: { authorization: `Bearer ${clientA.access_token}` },
      payload: {
        client_id: clientA.client_id,
        idempotency_key: "idem-a",
        base_version: 0,
        expected_head: 0,
        ops: [{ op_type: "upsert", path: "note.md", content_b64: encode("A") }]
      }
    });
    expect(firstPush.statusCode).toBe(200);

    const secondPush = await app.inject({
      method: "POST",
      url: `/v1/spaces/${spaceId}/changes`,
      headers: { authorization: `Bearer ${clientB.access_token}` },
      payload: {
        client_id: clientB.client_id,
        idempotency_key: "idem-b",
        base_version: 0,
        expected_head: 1,
        ops: [{ op_type: "upsert", path: "note.md", content_b64: encode("B") }]
      }
    });

    expect(secondPush.statusCode).toBe(200);
    const pushPayload = secondPush.json();
    expect(pushPayload.merge_result).toBe("conflict");
    expect(pushPayload.conflict_set_id).toBeTruthy();

    const conflictSetId = pushPayload.conflict_set_id as string;
    const query = await app.inject({
      method: "GET",
      url: `/v1/spaces/${spaceId}/conflicts/${conflictSetId}`,
      headers: { authorization: `Bearer ${clientB.access_token}` }
    });

    expect(query.statusCode).toBe(200);
    const conflictPayload = query.json();
    expect(conflictPayload.status).toBe("open");
    expect(conflictPayload.items.length).toBeGreaterThan(0);

    const resolve = await app.inject({
      method: "POST",
      url: `/v1/spaces/${spaceId}/conflicts/${conflictSetId}/resolutions`,
      headers: { authorization: `Bearer ${clientB.access_token}` },
      payload: {
        expected_head: pushPayload.new_head_version,
        resolutions: [
          {
            path: "note.md",
            strategy: "manual",
            content_b64: encode("merged")
          }
        ]
      }
    });

    expect(resolve.statusCode).toBe(200);
    expect(resolve.json().resolved).toBe(true);
  });
});
