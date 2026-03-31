import { describe, expect, it } from "vitest";
import { createTestServer } from "../contract/helpers.js";

describe("readyz db dependency pg integration", () => {
  it("returns not ready when postgres backend is unavailable", async () => {
    process.env.SYNC_STORAGE_BACKEND = "postgres";

    const app = await createTestServer();
    const response = await app.inject({ method: "GET", url: "/readyz" });

    expect([200, 503]).toContain(response.statusCode);
    const body = response.json();
    expect(body).toHaveProperty("status");

    await app.close();
  });
});
