import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { mergeSnapshots } from "../../src/merge/three-way-merge.js";
import { InMemorySyncRepository } from "../../src/repository/sync-repository.js";
import { SyncAuditService } from "../../src/service/sync-audit-service.js";
import { SyncCommitService } from "../../src/service/sync-commit-service.js";

function encode(content: string): string {
  return Buffer.from(content, "utf8").toString("base64");
}

describe("three-way merge safety", () => {
  it("keeps conflict suffix on filename when parent directory contains a dot", () => {
    const merged = mergeSnapshots(
      { "my.folder/file": "base" },
      { "my.folder/file": "local" },
      { "my.folder/file": "remote" },
      {
        clientId: "client-12345678",
        timestamp: new Date("2026-03-31T12:34:56.789Z")
      }
    );

    expect(merged.mergeResult).toBe("conflict");
    const conflictPath = merged.conflicts[0]?.conflict_path;
    expect(conflictPath).toBeTruthy();
    expect(conflictPath?.startsWith("my.folder/file.conflict.")).toBe(true);
    expect(conflictPath?.startsWith("my.conflict")).toBe(false);
  });

  it("returns fast_forward only when base and remote are identical", () => {
    const fastForward = mergeSnapshots(
      { "note.md": "v1" },
      { "note.md": "v2" },
      { "note.md": "v1" },
      { clientId: "client-a" }
    );
    expect(fastForward.mergeResult).toBe("fast_forward");

    const merged = mergeSnapshots(
      { "note.md": "v1" },
      { "note.md": "v1", "todo.md": "local" },
      { "note.md": "remote" },
      { clientId: "client-a" }
    );
    expect(merged.mergeResult).toBe("merged");
  });
});

describe("sync commit service safety", () => {
  it("allows manual conflict resolution to delete target file", async () => {
    const repository = new InMemorySyncRepository();
    const service = new SyncCommitService(repository, new SyncAuditService());
    const spaceId = "space-manual-delete";

    const firstPush = await service.push(
      spaceId,
      {
        client_id: "client-a",
        idempotency_key: "idem-a",
        base_version: 0,
        expected_head: 0,
        ops: [{ op_type: "upsert", path: "note.md", content_b64: encode("A") }]
      },
      "req-a"
    );

    const secondPush = await service.push(
      spaceId,
      {
        client_id: "client-b",
        idempotency_key: "idem-b",
        base_version: 0,
        expected_head: firstPush.new_head_version,
        ops: [{ op_type: "upsert", path: "note.md", content_b64: encode("B") }]
      },
      "req-b"
    );

    expect(secondPush.merge_result).toBe("conflict");
    expect(secondPush.conflict_set_id).toBeTruthy();

    const conflictSet = await repository.getConflictSet(spaceId, secondPush.conflict_set_id as string);
    const conflictPath = conflictSet?.items[0]?.conflict_path;

    const resolved = await service.resolveConflicts(
      spaceId,
      secondPush.conflict_set_id as string,
      {
        expected_head: secondPush.new_head_version,
        resolutions: [{ path: "note.md", strategy: "manual" }]
      },
      "req-c"
    );

    const snapshot = (await repository.getSnapshot(spaceId, resolved.new_head_version)) ?? {};
    expect(snapshot).not.toHaveProperty("note.md");
    if (conflictPath) {
      expect(snapshot).not.toHaveProperty(conflictPath);
    }
  });

  it("reuses idempotent result for concurrent same-key push", async () => {
    const repository = new InMemorySyncRepository();
    const service = new SyncCommitService(repository, new SyncAuditService());
    const spaceId = "space-idempotent";
    const payload = {
      client_id: "client-a",
      idempotency_key: "same-key",
      base_version: 0,
      expected_head: 0,
      ops: [{ op_type: "upsert" as const, path: "note.md", content_b64: encode("hello") }]
    };

    const [first, second] = await Promise.all([
      service.push(spaceId, payload, "req-1"),
      service.push(spaceId, payload, "req-2")
    ]);

    expect(first.new_head_version).toBe(second.new_head_version);
    expect(await repository.getHeadVersion(spaceId)).toBe(1);
    expect((await repository.pullChanges(spaceId, 0)).changes).toHaveLength(1);
  });

  it("stores effective merged ops for conflict commits", async () => {
    const repository = new InMemorySyncRepository();
    const service = new SyncCommitService(repository, new SyncAuditService());
    const spaceId = "space-merge-ops";

    await service.push(
      spaceId,
      {
        client_id: "client-a",
        idempotency_key: "ops-a",
        base_version: 0,
        expected_head: 0,
        ops: [{ op_type: "upsert", path: "note.md", content_b64: encode("A") }]
      },
      "req-ops-a"
    );

    const secondPush = await service.push(
      spaceId,
      {
        client_id: "client-b",
        idempotency_key: "ops-b",
        base_version: 0,
        expected_head: 1,
        ops: [{ op_type: "upsert", path: "note.md", content_b64: encode("B") }]
      },
      "req-ops-b"
    );

    expect(secondPush.merge_result).toBe("conflict");

    const pulled = (await repository.pullChanges(spaceId, 1)).changes;
    expect(pulled).toHaveLength(1);

    const ops = pulled[0]?.ops ?? [];
    expect(ops.some((op) => op.path === "note.md" && op.op_type === "upsert")).toBe(false);
    expect(ops.some((op) => op.path.includes("note.conflict.") && op.op_type === "upsert")).toBe(true);
  });

  it("stores conflict resolution ops for downstream pull replay", async () => {
    const repository = new InMemorySyncRepository();
    const service = new SyncCommitService(repository, new SyncAuditService());
    const spaceId = "space-resolution-ops";

    const firstPush = await service.push(
      spaceId,
      {
        client_id: "client-a",
        idempotency_key: "res-a",
        base_version: 0,
        expected_head: 0,
        ops: [{ op_type: "upsert", path: "note.md", content_b64: encode("A") }]
      },
      "req-res-a"
    );

    const secondPush = await service.push(
      spaceId,
      {
        client_id: "client-b",
        idempotency_key: "res-b",
        base_version: 0,
        expected_head: firstPush.new_head_version,
        ops: [{ op_type: "upsert", path: "note.md", content_b64: encode("B") }]
      },
      "req-res-b"
    );

    const conflictSetId = secondPush.conflict_set_id as string;
    const beforeResolveHead = secondPush.new_head_version;
    await service.resolveConflicts(
      spaceId,
      conflictSetId,
      {
        expected_head: beforeResolveHead,
        resolutions: [{ path: "note.md", strategy: "manual", content_b64: encode("merged") }]
      },
      "req-res-c"
    );

    const pulled = (await repository.pullChanges(spaceId, beforeResolveHead)).changes;
    expect(pulled).toHaveLength(1);
    expect(pulled[0]?.ops).toContainEqual({
      op_type: "upsert",
      path: "note.md",
      content_b64: encode("merged"),
      content_encoding: "utf8"
    });
  });

  it("roundtrips binary upsert with explicit content encoding", async () => {
    const repository = new InMemorySyncRepository();
    const service = new SyncCommitService(repository, new SyncAuditService());
    const spaceId = "space-binary-encoding";

    const pushed = await service.push(
      spaceId,
      {
        client_id: "client-a",
        idempotency_key: "binary-1",
        base_version: 0,
        expected_head: 0,
        ops: [{
          op_type: "upsert",
          path: "asset.png",
          content_b64: "AAEC",
          content_encoding: "binary_base64"
        }]
      },
      "req-binary"
    );

    const snapshot = (await repository.getSnapshot(spaceId, pushed.new_head_version)) ?? {};
    expect(snapshot["asset.png"]).toBe("__SHS_BINARY_B64__:AAEC");

    const pulled = (await repository.pullChanges(spaceId, 0)).changes;
    expect(pulled).toHaveLength(1);
    expect(pulled[0]?.ops).toContainEqual({
      op_type: "upsert",
      path: "asset.png",
      content_b64: "AAEC",
      content_encoding: "binary_base64"
    });
  });

  it("auto-treats null-byte utf8 payload as binary content", async () => {
    const repository = new InMemorySyncRepository();
    const service = new SyncCommitService(repository, new SyncAuditService());
    const spaceId = "space-null-byte-fallback";

    const pushed = await service.push(
      spaceId,
      {
        client_id: "client-a",
        idempotency_key: "null-fallback-1",
        base_version: 0,
        expected_head: 0,
        ops: [{
          op_type: "upsert",
          path: "rawdata",
          content_b64: "YQBi",
          content_encoding: "utf8"
        }]
      },
      "req-null-fallback"
    );

    const snapshot = (await repository.getSnapshot(spaceId, pushed.new_head_version)) ?? {};
    expect(snapshot["rawdata"]).toBe("__SHS_BINARY_B64__:YQBi");

    const pulled = (await repository.pullChanges(spaceId, 0)).changes;
    expect(pulled[0]?.ops).toContainEqual({
      op_type: "upsert",
      path: "rawdata",
      content_b64: "YQBi",
      content_encoding: "binary_base64"
    });
  });
});
