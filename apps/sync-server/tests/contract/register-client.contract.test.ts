import { afterEach, describe, expect, it } from "vitest";
import { createTestServer } from "./helpers.js";

describe("register client contract", () => {
  const servers: Array<Awaited<ReturnType<typeof createTestServer>>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()?.close();
    }
  });

  it("returns client and tokens", async () => {
    const app = await createTestServer();
    servers.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/spaces/space-register/clients",
      payload: {
        device_id: "device-register",
        client_name: "register-client"
      }
    });

    expect(response.statusCode).toBe(201);
    const payload = response.json();
    expect(payload.client_id).toBeTruthy();
    expect(payload.access_token).toBeTruthy();
    expect(payload.refresh_token).toBeTruthy();
  });

  it("handles CORS preflight for registration endpoint", async () => {
    const app = await createTestServer();
    servers.push(app);

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/spaces/space-register/clients",
      headers: {
        origin: "app://obsidian.md",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
  });

  it("returns 413 instead of 500 for oversized body", async () => {
    const original = process.env.SYNC_BODY_LIMIT_BYTES;
    try {
      process.env.SYNC_BODY_LIMIT_BYTES = "256";

      const app = await createTestServer();
      servers.push(app);

      const response = await app.inject({
        method: "POST",
        url: "/v1/spaces/space-register/clients",
        payload: {
          device_id: "device-register",
          client_name: "x".repeat(4096)
        }
      });

      expect(response.statusCode).toBe(413);
      const payload = response.json();
      expect(payload.error.code).toBe("INVALID_CHANGESET");
    } finally {
      if (original === undefined) {
        delete process.env.SYNC_BODY_LIMIT_BYTES;
      } else {
        process.env.SYNC_BODY_LIMIT_BYTES = original;
      }
    }
  });
});
