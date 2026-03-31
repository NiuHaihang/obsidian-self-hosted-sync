import { describe, expect, it } from "vitest";
import { mergeSnapshots } from "../../apps/sync-server/src/merge/three-way-merge.js";

describe("mvp non-delete e2e", () => {
  it("keeps abc and ghk after merge", () => {
    const base = { "def.md": "def" };
    const local = { "abc.md": "abc", "def.md": "def" };
    const remote = { "def.md": "def", "ghk.md": "ghk" };

    const result = mergeSnapshots(base, local, remote, { clientId: "client-a" });
    expect(Object.keys(result.snapshot).sort()).toEqual(["abc.md", "def.md", "ghk.md"]);
  });
});
