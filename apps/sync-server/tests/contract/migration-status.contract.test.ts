import { afterEach, describe, expect, it } from "vitest";
import { createTestServer } from "./helpers.js";

describe("migration status contract", () => {
  const servers: Array<Awaited<ReturnType<typeof createTestServer>>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()?.close();
    }
  });

  it("returns migration status structure", async () => {
    process.env.SYNC_STORAGE_BACKEND = "postgres";
    const app = await createTestServer();
    servers.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/migrations/status"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty("current_version");
    expect(body).toHaveProperty("pending_count");
    expect(body).toHaveProperty("db_connected");
  });
});
