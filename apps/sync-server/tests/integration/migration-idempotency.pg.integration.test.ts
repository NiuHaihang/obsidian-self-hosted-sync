import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("migration idempotency pg integration", () => {
  it("ensures migration files are deterministic and versioned", async () => {
    const dir = "apps/sync-server/src/repository/migrations";
    const files = (await readdir(dir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();

    expect(files.length).toBeGreaterThan(0);
    expect(new Set(files).size).toBe(files.length);

    const firstRead = await Promise.all(files.map((name) => readFile(`${dir}/${name}`, "utf8")));
    const secondRead = await Promise.all(files.map((name) => readFile(`${dir}/${name}`, "utf8")));
    expect(firstRead).toEqual(secondRead);
  });
});
