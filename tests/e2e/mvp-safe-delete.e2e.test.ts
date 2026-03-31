import { describe, expect, it } from "vitest";
import { mergeSnapshots } from "../../apps/sync-server/src/merge/three-way-merge.js";

describe("mvp safe delete e2e", () => {
  it("keeps modified content when delete conflicts with modify", () => {
    const base = { "def.md": "base" };
    const local = {};
    const remote = { "def.md": "remote-modified" };

    const result = mergeSnapshots(base, local, remote, { clientId: "client-c" });
    expect(result.snapshot["def.md"]).toBe("remote-modified");
    expect(result.conflicts.some((item) => item.conflict_type === "delete_vs_modify")).toBe(true);
  });
});
