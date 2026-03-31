import { afterEach, describe, expect, it } from "vitest";
import { createTestServer, registerClient } from "./helpers.js";

describe("pull changes pg contract", () => {
  const servers: Array<Awaited<ReturnType<typeof createTestServer>>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()?.close();
    }
  });

  it("returns incremental response shape for pg mode", async () => {
    process.env.SYNC_STORAGE_BACKEND = "memory";
    const app = await createTestServer();
    servers.push(app);

    const registration = await registerClient(app, "space-pg-pull", "device-pg-pull");
    const response = await app.inject({
      method: "GET",
      url: "/v1/spaces/space-pg-pull/changes?from_version=0",
      headers: {
        authorization: `Bearer ${registration.access_token}`
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty("head_version");
    expect(body).toHaveProperty("changes");
    expect(body).toHaveProperty("has_more");
  });
});
