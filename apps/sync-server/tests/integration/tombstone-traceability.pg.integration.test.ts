import { describe, expect, it } from "vitest";
import { createTombstone, shouldPurgeTombstone } from "../../src/merge/tombstone-policy.js";

describe("tombstone traceability pg integration", () => {
  it("keeps tombstone metadata and delays purge before expiry", () => {
    const createdAt = new Date("2026-03-31T00:00:00.000Z");
    const tombstone = createTombstone("note.md", 12, "device-x", 45, createdAt);

    expect(tombstone.path).toBe("note.md");
    expect(tombstone.delete_version).toBe(12);
    expect(tombstone.deleted_by_device_id).toBe("device-x");
    expect(shouldPurgeTombstone(tombstone, new Date("2026-04-01T00:00:00.000Z"))).toBe(false);
  });
});
