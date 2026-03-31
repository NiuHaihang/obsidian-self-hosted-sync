import { afterEach, describe, expect, it } from "vitest";
import { createTestServer, registerClient } from "./helpers.js";

describe("pull changes contract", () => {
  const servers: Array<Awaited<ReturnType<typeof createTestServer>>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()?.close();
    }
  });

  it("returns incremental change envelope", async () => {
    const app = await createTestServer();
    servers.push(app);

    const spaceId = "space-pull";
    const registration = await registerClient(app, spaceId, "device-a");

    const response = await app.inject({
      method: "GET",
      url: `/v1/spaces/${spaceId}/changes?from_version=0`,
      headers: {
        authorization: `Bearer ${registration.access_token}`
      }
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload).toHaveProperty("head_version");
    expect(payload).toHaveProperty("changes");
    expect(Array.isArray(payload.changes)).toBe(true);
    expect(payload).toHaveProperty("has_more");
  });
});
