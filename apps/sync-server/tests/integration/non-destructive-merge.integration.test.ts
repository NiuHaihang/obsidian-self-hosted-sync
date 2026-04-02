import { afterEach, describe, expect, it } from "vitest";
import { createTestServer, encode, registerClient } from "../contract/helpers.js";

describe("non-destructive merge integration", () => {
  const servers: Array<Awaited<ReturnType<typeof createTestServer>>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()?.close();
    }
  });

  it("keeps abc and ghk while syncing A and B", async () => {
    const app = await createTestServer();
    servers.push(app);
    const spaceId = "space-safe-merge";
    const a = await registerClient(app, spaceId, "client-a");
    const b = await registerClient(app, spaceId, "client-b");

    await app.inject({
      method: "POST",
      url: `/v1/spaces/${spaceId}/changes`,
      headers: { authorization: `Bearer ${a.access_token}` },
      payload: {
        client_id: a.client_id,
        idempotency_key: "a-1",
        base_version: 0,
        expected_head: 0,
        ops: [
          { op_type: "upsert", path: "abc.md", content_b64: encode("abc") },
          { op_type: "upsert", path: "def.md", content_b64: encode("def") }
        ]
      }
    });

    await app.inject({
      method: "POST",
      url: `/v1/spaces/${spaceId}/changes`,
      headers: { authorization: `Bearer ${b.access_token}` },
      payload: {
        client_id: b.client_id,
        idempotency_key: "b-1",
        base_version: 0,
        expected_head: 1,
        ops: [
          { op_type: "upsert", path: "def.md", content_b64: encode("def") },
          { op_type: "upsert", path: "ghk.md", content_b64: encode("ghk") }
        ]
      }
    });

    const head = await app.syncContext.repository.getHeadVersion(spaceId);
    const snapshot = await app.syncContext.repository.getSnapshot(spaceId, head);
    expect(snapshot).toBeTruthy();
    const keys = Object.keys(snapshot ?? {}).sort();
    expect(keys).toContain("abc.md");
    expect(keys).toContain("def.md");
    expect(keys).toContain("ghk.md");
  });
});
