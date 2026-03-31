import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SyncApiClient } from "../../src/sync/sync-api-client.js";
import { BINARY_MARKER_PREFIX } from "../../src/sync/content-encoding.js";
import { SyncOrchestrator, type FileManifest } from "../../src/sync/sync-orchestrator.js";

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function createManifest(path: string, content: string): FileManifest {
  return { path, content, hash: hashContent(content) };
}

describe("sync orchestrator", () => {
  it("does not turn pulled remote-only files into delete operations", async () => {
    const pullChanges = vi.fn().mockResolvedValue({
      head_version: 3,
      changes: [
        {
          ops: [
            {
              op_type: "upsert",
              path: "remote.md",
              content_b64: Buffer.from("remote", "utf8").toString("base64")
            }
          ]
        }
      ]
    });
    const pushChanges = vi.fn().mockResolvedValue({
      applied: true,
      new_head_version: 4,
      merge_result: "fast_forward"
    });

    const apiClient = { pullChanges, pushChanges } as unknown as SyncApiClient;
    const orchestrator = new SyncOrchestrator(apiClient);

    await orchestrator.sync("space-a", "client-a", 0, 0, [], []);

    expect(pushChanges).toHaveBeenCalledTimes(1);
    const [, payload] = pushChanges.mock.calls[0] as [
      string,
      { base_version: number; expected_head: number; ops: Array<{ op_type: string; path: string }> }
    ];

    expect(payload.base_version).toBe(0);
    expect(payload.expected_head).toBe(3);
    expect(payload.ops).toEqual([]);
  });

  it("keeps explicit local deletes without deleting pulled additions", async () => {
    const pullChanges = vi.fn().mockResolvedValue({
      head_version: 5,
      changes: [
        {
          ops: [
            {
              op_type: "upsert",
              path: "remote.md",
              content_b64: Buffer.from("remote", "utf8").toString("base64")
            }
          ]
        }
      ]
    });
    const pushChanges = vi.fn().mockResolvedValue({
      applied: true,
      new_head_version: 6,
      merge_result: "merged"
    });

    const apiClient = { pullChanges, pushChanges } as unknown as SyncApiClient;
    const orchestrator = new SyncOrchestrator(apiClient);

    await orchestrator.sync(
      "space-a",
      "client-a",
      2,
      2,
      [createManifest("local.md", "local")],
      []
    );

    const [, payload] = pushChanges.mock.calls[0] as [
      string,
      { base_version: number; expected_head: number; ops: Array<{ op_type: string; path: string }> }
    ];

    expect(payload.base_version).toBe(2);
    expect(payload.expected_head).toBe(5);
    expect(payload.ops).toContainEqual({ op_type: "delete", path: "local.md" });
    expect(payload.ops).not.toContainEqual({ op_type: "delete", path: "remote.md" });
  });

  it("preserves binary content with explicit encoding", async () => {
    const pullChanges = vi.fn().mockResolvedValue({
      head_version: 7,
      changes: [
        {
          ops: [
            {
              op_type: "upsert",
              path: "remote.bin",
              content_b64: "AAEC",
              content_encoding: "binary_base64"
            }
          ]
        }
      ]
    });
    const pushChanges = vi.fn().mockResolvedValue({
      applied: true,
      new_head_version: 8,
      merge_result: "merged"
    });

    const apiClient = { pullChanges, pushChanges } as unknown as SyncApiClient;
    const orchestrator = new SyncOrchestrator(apiClient);

    const result = await orchestrator.sync(
      "space-a",
      "client-a",
      0,
      0,
      [],
      [createManifest("local.bin", `${BINARY_MARKER_PREFIX}AQID`)]
    );

    expect(result.rebasedBaseManifest).toContainEqual(
      expect.objectContaining({ path: "remote.bin", content: `${BINARY_MARKER_PREFIX}AAEC` })
    );

    const [, payload] = pushChanges.mock.calls[0] as [
      string,
      {
        ops: Array<{ op_type: string; path: string; content_b64?: string; content_encoding?: string }>;
      }
    ];

    expect(payload.ops).toContainEqual({
      op_type: "upsert",
      path: "local.bin",
      content_b64: "AQID",
      content_encoding: "binary_base64"
    });
  });
});
