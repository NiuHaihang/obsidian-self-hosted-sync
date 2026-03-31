import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("docker bootstrap e2e", () => {
  it("contains required services in compose file", async () => {
    const compose = await readFile("infra/docker/docker-compose.yml", "utf8");
    expect(compose).toContain("sync-server:");
    expect(compose).toContain("db:");
    expect(compose).toContain("object-store:");
  });
});
