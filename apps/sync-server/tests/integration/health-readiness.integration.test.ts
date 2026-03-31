import { afterEach, describe, expect, it } from "vitest";
import { createTestServer } from "../contract/helpers.js";

describe("health readiness integration", () => {
  const servers: Array<Awaited<ReturnType<typeof createTestServer>>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()?.close();
    }
  });

  it("responds health and readiness", async () => {
    const app = await createTestServer();
    servers.push(app);

    const health = await app.inject({ method: "GET", url: "/healthz" });
    const ready = await app.inject({ method: "GET", url: "/readyz" });

    expect(health.statusCode).toBe(200);
    expect(health.json().status).toBe("ok");
    expect(ready.statusCode).toBe(200);
    expect(ready.json().status).toBe("ready");
  });
});
