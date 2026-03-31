import { describe, expect, it } from "vitest";
import { calculateManifestDelta } from "../../src/sync/sync-orchestrator.js";

describe("manifest delta integration", () => {
  it("detects upserts and deletes", () => {
    const base = [
      { path: "def.md", hash: "h1", content: "def-old" },
      { path: "old.md", hash: "h2", content: "old" }
    ];
    const current = [
      { path: "def.md", hash: "h3", content: "def-new" },
      { path: "abc.md", hash: "h4", content: "abc" }
    ];

    const delta = calculateManifestDelta(base, current);
    expect(delta.upserts.map((item) => item.path).sort()).toEqual(["abc.md", "def.md"]);
    expect(delta.deletes).toEqual(["old.md"]);
  });
});
