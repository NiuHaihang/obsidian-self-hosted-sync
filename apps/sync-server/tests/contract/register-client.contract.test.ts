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
});
