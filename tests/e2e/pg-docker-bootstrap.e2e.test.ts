import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("pg docker bootstrap e2e", () => {
  it("contains db, migrate and sync-server services", async () => {
    const compose = await readFile("infra/docker/docker-compose.yml", "utf8");
    expect(compose).toContain("db:");
    expect(compose).toContain("sync-server:");
    expect(compose).toContain("migrate:");
  });
});
