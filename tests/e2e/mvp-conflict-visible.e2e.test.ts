import { describe, expect, it } from "vitest";
import { mergeSnapshots } from "../../apps/sync-server/src/merge/three-way-merge.js";

describe("mvp conflict visible e2e", () => {
  it("produces conflict item and conflict file", () => {
    const base = { "note.md": "same" };
    const local = { "note.md": "local-change" };
    const remote = { "note.md": "remote-change" };
    const result = mergeSnapshots(base, local, remote, { clientId: "client-b" });

    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0].conflict_path).toBeTruthy();
    expect(result.mergeResult).toBe("conflict");
  });
});
