import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelfHostedSyncPlugin } from "../src/main.js";
import { SettingsStore } from "../src/storage/settings-store.js";
import { SyncApiClient } from "../src/sync/sync-api-client.js";
import { SyncOrchestrator } from "../src/sync/sync-orchestrator.js";

describe("plugin sync state persistence", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("uses persisted sync baseline and stores next sync state", async () => {
    const loadMock = vi.spyOn(SettingsStore.prototype, "load").mockResolvedValue({
      serverUrl: "http://localhost:8787",
      spaceId: "space-a",
      clientId: "client-a",
      accessToken: "token-a",
      syncState: {
        baseVersion: 2,
        expectedHead: 2,
        baseManifest: [{ path: "note.md", hash: "h1", content: "old" }]
      }
    });
    const saveMock = vi.spyOn(SettingsStore.prototype, "save").mockResolvedValue();
    const syncMock = vi.spyOn(SyncOrchestrator.prototype, "sync").mockResolvedValue({
      pull: { head_version: 5, changes: [] },
      push: { new_head_version: 6, merge_result: "merged" },
      delta: { upserts: [], deletes: [] },
      rebasedBaseManifest: [{ path: "note.md", hash: "h2", content: "server" }],
      rebasedCurrentManifest: [{ path: "note.md", hash: "h3", content: "local" }],
      nextBaseVersion: 5
    });

    const plugin = new SelfHostedSyncPlugin();
    await plugin.runManualSync([{ path: "note.md", hash: "h3", content: "local" }]);

    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(syncMock).toHaveBeenCalledWith(
      "space-a",
      "client-a",
      2,
      2,
      [{ path: "note.md", hash: "h1", content: "old" }],
      [{ path: "note.md", hash: "h3", content: "local" }]
    );
    expect(saveMock).toHaveBeenCalledWith({
      serverUrl: "http://localhost:8787",
      spaceId: "space-a",
      clientId: "client-a",
      accessToken: "token-a",
      syncState: {
        baseVersion: 6,
        expectedHead: 6,
        baseManifest: [{ path: "note.md", hash: "h3", content: "local" }],
        pendingConflict: undefined
      }
    });
    expect(plugin.getStatus().state).toBe("success");
  });

  it("shows conflict notice message when push reports conflicts", async () => {
    vi.spyOn(SettingsStore.prototype, "load").mockResolvedValue({
      serverUrl: "http://localhost:8787",
      spaceId: "space-b",
      clientId: "client-b",
      accessToken: "token-b"
    });
    const saveMock = vi.spyOn(SettingsStore.prototype, "save").mockResolvedValue();
    vi.spyOn(SyncOrchestrator.prototype, "sync").mockResolvedValue({
      pull: { head_version: 3, changes: [] },
      push: { new_head_version: 4, merge_result: "conflict", conflict_set_id: "set-1" },
      delta: { upserts: [], deletes: [] },
      rebasedBaseManifest: [],
      rebasedCurrentManifest: [],
      nextBaseVersion: 3
    });

    const plugin = new SelfHostedSyncPlugin();
    await plugin.runManualSync([]);

    const status = plugin.getStatus();
    expect(status.state).toBe("conflict");
    expect(status.message).toContain("冲突");
    expect(status.message).toContain("set-1");
    expect(saveMock).toHaveBeenCalledWith({
      serverUrl: "http://localhost:8787",
      spaceId: "space-b",
      clientId: "client-b",
      accessToken: "token-b",
      syncState: {
        baseVersion: 0,
        expectedHead: 0,
        baseManifest: [],
        pendingConflict: {
          conflictSetId: "set-1",
          expectedHead: 4
        }
      }
    });
  });

  it("applies pulled changes via hook and persists refreshed manifest", async () => {
    vi.spyOn(SettingsStore.prototype, "load").mockResolvedValue({
      serverUrl: "http://localhost:8787",
      spaceId: "space-c",
      clientId: "client-c",
      accessToken: "token-c",
      syncState: {
        baseVersion: 1,
        expectedHead: 1,
        baseManifest: [{ path: "base.md", hash: "h-base", content: "base" }]
      }
    });
    const saveMock = vi.spyOn(SettingsStore.prototype, "save").mockResolvedValue();
    vi.spyOn(SyncOrchestrator.prototype, "sync").mockResolvedValue({
      pull: {
        head_version: 2,
        changes: [{ ops: [{ op_type: "upsert", path: "remote.md", content_b64: "cmVtb3Rl" }] }]
      },
      push: { new_head_version: 3, merge_result: "merged" },
      delta: { upserts: [], deletes: [] },
      rebasedBaseManifest: [],
      rebasedCurrentManifest: [{ path: "from-orchestrator.md", hash: "h-x", content: "x" }],
      nextBaseVersion: 2
    });

    const applyPulledChanges = vi.fn().mockResolvedValue(undefined);
    const collectManifest = vi.fn().mockResolvedValue([{ path: "vault.md", hash: "h-vault", content: "vault" }]);

    const plugin = new SelfHostedSyncPlugin();
    await plugin.runManualSync([], { applyPulledChanges, collectManifest });

    expect(applyPulledChanges).toHaveBeenCalledWith({
      head_version: 2,
      changes: [{ ops: [{ op_type: "upsert", path: "remote.md", content_b64: "cmVtb3Rl" }] }]
    });
    expect(collectManifest).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith({
      serverUrl: "http://localhost:8787",
      spaceId: "space-c",
      clientId: "client-c",
      accessToken: "token-c",
      syncState: {
        baseVersion: 3,
        expectedHead: 3,
        baseManifest: [{ path: "vault.md", hash: "h-vault", content: "vault" }],
        pendingConflict: undefined
      }
    });
  });

  it("does not apply pull hook on conflict to avoid overwriting local edits", async () => {
    vi.spyOn(SettingsStore.prototype, "load").mockResolvedValue({
      serverUrl: "http://localhost:8787",
      spaceId: "space-d",
      clientId: "client-d",
      accessToken: "token-d",
      syncState: {
        baseVersion: 8,
        expectedHead: 8,
        baseManifest: [{ path: "note.md", hash: "h-old", content: "old" }]
      }
    });
    const saveMock = vi.spyOn(SettingsStore.prototype, "save").mockResolvedValue();
    vi.spyOn(SyncOrchestrator.prototype, "sync").mockResolvedValue({
      pull: { head_version: 9, changes: [{ ops: [{ op_type: "upsert", path: "note.md", content_b64: "cmVtb3Rl" }] }] },
      push: { new_head_version: 10, merge_result: "conflict", conflict_set_id: "set-2" },
      delta: { upserts: [{ path: "note.md", hash: "h-local", content: "local" }], deletes: [] },
      rebasedBaseManifest: [{ path: "note.md", hash: "h-remote", content: "remote" }],
      rebasedCurrentManifest: [{ path: "note.md", hash: "h-local", content: "local" }],
      nextBaseVersion: 9
    });

    const applyPulledChanges = vi.fn();
    const collectManifest = vi.fn();
    const plugin = new SelfHostedSyncPlugin();

    await plugin.runManualSync([{ path: "note.md", hash: "h-local", content: "local" }], {
      applyPulledChanges,
      collectManifest
    });

    expect(applyPulledChanges).not.toHaveBeenCalled();
    expect(collectManifest).not.toHaveBeenCalled();
    expect(saveMock).toHaveBeenCalledWith({
      serverUrl: "http://localhost:8787",
      spaceId: "space-d",
      clientId: "client-d",
      accessToken: "token-d",
      syncState: {
        baseVersion: 8,
        expectedHead: 8,
        baseManifest: [{ path: "note.md", hash: "h-old", content: "old" }],
        pendingConflict: {
          conflictSetId: "set-2",
          expectedHead: 10
        }
      }
    });
  });

  it("syncs against filesystem vault and persists post-pull snapshot", async () => {
    const vaultPath = await mkdtemp(join(tmpdir(), "obsidian-vault-"));
    tempDirs.push(vaultPath);
    await mkdir(dirname(join(vaultPath, "local.md")), { recursive: true });
    await writeFile(join(vaultPath, "local.md"), "local", "utf8");

    vi.spyOn(SettingsStore.prototype, "load").mockResolvedValue({
      serverUrl: "http://localhost:8787",
      spaceId: "space-vault",
      clientId: "client-vault",
      accessToken: "token-vault",
      syncState: {
        baseVersion: 0,
        expectedHead: 0,
        baseManifest: []
      }
    });
    const saveMock = vi.spyOn(SettingsStore.prototype, "save").mockResolvedValue();
    const syncMock = vi.spyOn(SyncOrchestrator.prototype, "sync").mockResolvedValue({
      pull: {
        head_version: 1,
        changes: [{ ops: [{ op_type: "upsert", path: "remote.md", content_b64: "cmVtb3Rl" }] }]
      },
      push: { new_head_version: 2, merge_result: "merged" },
      delta: { upserts: [], deletes: [] },
      rebasedBaseManifest: [],
      rebasedCurrentManifest: [],
      nextBaseVersion: 1
    });

    const plugin = new SelfHostedSyncPlugin();
    await plugin.runManualSyncWithVault(vaultPath);

    expect(syncMock).toHaveBeenCalledTimes(1);
    const currentManifest = syncMock.mock.calls[0]?.[5] as Array<{ path: string }>;
    expect(currentManifest).toEqual(expect.arrayContaining([expect.objectContaining({ path: "local.md" })]));

    const remoteContent = await readFile(join(vaultPath, "remote.md"), "utf8");
    expect(remoteContent).toBe("remote");

    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({
      syncState: expect.objectContaining({
        baseVersion: 2,
        expectedHead: 2,
        pendingConflict: undefined,
        baseManifest: expect.arrayContaining([
          expect.objectContaining({ path: "local.md" }),
          expect.objectContaining({ path: "remote.md", content: "remote" })
        ])
      })
    }));
  });

  it("returns pending conflict preview from server", async () => {
    vi.spyOn(SettingsStore.prototype, "load").mockResolvedValue({
      serverUrl: "http://localhost:8787",
      spaceId: "space-preview",
      clientId: "client-preview",
      accessToken: "token-preview",
      syncState: {
        baseVersion: 1,
        expectedHead: 1,
        baseManifest: [],
        pendingConflict: {
          conflictSetId: "set-preview",
          expectedHead: 9
        }
      }
    });
    vi.spyOn(SyncApiClient.prototype, "getConflictSet").mockResolvedValue({
      conflict_set_id: "set-preview",
      status: "open",
      base_version: 1,
      head_version: 9,
      items: [
        {
          path: "note.md",
          conflict_type: "content_diverged",
          server_content: "server",
          client_content: "client",
          conflict_path: "note.conflict.md"
        }
      ]
    });

    const plugin = new SelfHostedSyncPlugin();
    const preview = await plugin.getPendingConflictPreview();

    expect(preview).toEqual({
      conflictSetId: "set-preview",
      expectedHead: 9,
      notices: [
        {
          path: "note.md",
          conflictPath: "note.conflict.md",
          message: "检测到冲突：note.md，已保留副本 note.conflict.md"
        }
      ],
      summary: {
        total: 1,
        byType: {
          content_diverged: 1
        }
      },
      items: [
        {
          path: "note.md",
          conflict_type: "content_diverged",
          server_content: "server",
          client_content: "client",
          conflict_path: "note.conflict.md"
        }
      ]
    });
  });

  it("clears stale pending conflict when conflict set is gone", async () => {
    vi.spyOn(SettingsStore.prototype, "load").mockResolvedValue({
      serverUrl: "http://localhost:8787",
      spaceId: "space-preview-gone",
      clientId: "client-preview-gone",
      accessToken: "token-preview-gone",
      syncState: {
        baseVersion: 5,
        expectedHead: 5,
        baseManifest: [{ path: "note.md", hash: "h", content: "v" }],
        pendingConflict: {
          conflictSetId: "set-gone",
          expectedHead: 9
        }
      }
    });
    const saveMock = vi.spyOn(SettingsStore.prototype, "save").mockResolvedValue();
    vi.spyOn(SyncApiClient.prototype, "getConflictSet").mockRejectedValue(new Error("get conflict set failed: 404"));

    const plugin = new SelfHostedSyncPlugin();
    const preview = await plugin.getPendingConflictPreview();

    expect(preview).toBeNull();
    expect(saveMock).toHaveBeenCalledWith({
      serverUrl: "http://localhost:8787",
      spaceId: "space-preview-gone",
      clientId: "client-preview-gone",
      accessToken: "token-preview-gone",
      syncState: {
        baseVersion: 5,
        expectedHead: 5,
        baseManifest: [{ path: "note.md", hash: "h", content: "v" }],
        pendingConflict: undefined
      }
    });
    expect(plugin.getStatus().state).toBe("error");
    expect(plugin.getStatus().message).toContain("已清理本地状态");
  });

  it("resolves pending conflict with hooks and advances sync state", async () => {
    vi.spyOn(SettingsStore.prototype, "load").mockResolvedValue({
      serverUrl: "http://localhost:8787",
      spaceId: "space-resolve",
      clientId: "client-resolve",
      accessToken: "token-resolve",
      syncState: {
        baseVersion: 3,
        expectedHead: 3,
        baseManifest: [{ path: "note.md", hash: "h-old", content: "old" }],
        pendingConflict: {
          conflictSetId: "set-resolve",
          expectedHead: 7
        }
      }
    });
    const saveMock = vi.spyOn(SettingsStore.prototype, "save").mockResolvedValue();
    const resolveMock = vi.spyOn(SyncApiClient.prototype, "resolveConflicts").mockResolvedValue({
      resolved: true,
      new_head_version: 8
    });
    const pullMock = vi.spyOn(SyncApiClient.prototype, "pullChanges").mockResolvedValue({
      head_version: 8,
      changes: [{ ops: [{ op_type: "upsert", path: "note.md", content_b64: "bWVyZ2Vk" }] }]
    });

    const applyPulledChanges = vi.fn().mockResolvedValue(undefined);
    const collectManifest = vi.fn().mockResolvedValue([{ path: "note.md", hash: "h-new", content: "merged" }]);
    const plugin = new SelfHostedSyncPlugin();

    await plugin.resolvePendingConflict(
      [{ path: "note.md", strategy: "manual", content_b64: "bWVyZ2Vk" }],
      { applyPulledChanges, collectManifest }
    );

    expect(resolveMock).toHaveBeenCalledWith("space-resolve", "set-resolve", {
      expected_head: 7,
      resolutions: [{ path: "note.md", strategy: "manual", content_b64: "bWVyZ2Vk" }]
    });
    expect(pullMock).toHaveBeenCalledWith("space-resolve", 3);
    expect(applyPulledChanges).toHaveBeenCalledWith({
      head_version: 8,
      changes: [{ ops: [{ op_type: "upsert", path: "note.md", content_b64: "bWVyZ2Vk" }] }]
    });
    expect(collectManifest).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith({
      serverUrl: "http://localhost:8787",
      spaceId: "space-resolve",
      clientId: "client-resolve",
      accessToken: "token-resolve",
      syncState: {
        baseVersion: 8,
        expectedHead: 8,
        baseManifest: [{ path: "note.md", hash: "h-new", content: "merged" }],
        pendingConflict: undefined
      }
    });
    expect(plugin.getStatus().state).toBe("success");
  });

  it("clears pending conflict when server resolved but local pull/apply fails", async () => {
    vi.spyOn(SettingsStore.prototype, "load").mockResolvedValue({
      serverUrl: "http://localhost:8787",
      spaceId: "space-resolve-partial",
      clientId: "client-resolve-partial",
      accessToken: "token-resolve-partial",
      syncState: {
        baseVersion: 3,
        expectedHead: 3,
        baseManifest: [{ path: "note.md", hash: "h-old", content: "old" }],
        pendingConflict: {
          conflictSetId: "set-partial",
          expectedHead: 7
        }
      }
    });
    const saveMock = vi.spyOn(SettingsStore.prototype, "save").mockResolvedValue();
    vi.spyOn(SyncApiClient.prototype, "resolveConflicts").mockResolvedValue({
      resolved: true,
      new_head_version: 8
    });
    vi.spyOn(SyncApiClient.prototype, "pullChanges").mockRejectedValue(new Error("pull failed: 503"));

    const applyPulledChanges = vi.fn().mockResolvedValue(undefined);
    const collectManifest = vi.fn().mockResolvedValue([]);
    const plugin = new SelfHostedSyncPlugin();

    await plugin.resolvePendingConflict(
      [{ path: "note.md", strategy: "manual", content_b64: "bWVyZ2Vk" }],
      { applyPulledChanges, collectManifest }
    );

    expect(saveMock).toHaveBeenCalledWith({
      serverUrl: "http://localhost:8787",
      spaceId: "space-resolve-partial",
      clientId: "client-resolve-partial",
      accessToken: "token-resolve-partial",
      syncState: {
        baseVersion: 3,
        expectedHead: 8,
        baseManifest: [{ path: "note.md", hash: "h-old", content: "old" }],
        pendingConflict: undefined
      }
    });
    expect(applyPulledChanges).not.toHaveBeenCalled();
    expect(collectManifest).not.toHaveBeenCalled();
    expect(plugin.getStatus().state).toBe("error");
    expect(plugin.getStatus().message).toContain("服务端冲突已解决");
  });

  it("blocks new sync while pending conflict exists", async () => {
    vi.spyOn(SettingsStore.prototype, "load").mockResolvedValue({
      serverUrl: "http://localhost:8787",
      spaceId: "space-block",
      clientId: "client-block",
      accessToken: "token-block",
      syncState: {
        baseVersion: 2,
        expectedHead: 2,
        baseManifest: [],
        pendingConflict: {
          conflictSetId: "set-block",
          expectedHead: 4
        }
      }
    });
    const syncMock = vi.spyOn(SyncOrchestrator.prototype, "sync");

    const plugin = new SelfHostedSyncPlugin();
    await plugin.runManualSync([]);

    expect(syncMock).not.toHaveBeenCalled();
    expect(plugin.getStatus().state).toBe("conflict");
    expect(plugin.getStatus().message).toContain("set-block");
  });

  it("resolves pending conflict by strategy", async () => {
    vi.spyOn(SettingsStore.prototype, "load").mockResolvedValue({
      serverUrl: "http://localhost:8787",
      spaceId: "space-strategy",
      clientId: "client-strategy",
      accessToken: "token-strategy",
      syncState: {
        baseVersion: 3,
        expectedHead: 3,
        baseManifest: [],
        pendingConflict: {
          conflictSetId: "set-strategy",
          expectedHead: 6
        }
      }
    });
    vi.spyOn(SyncApiClient.prototype, "getConflictSet").mockResolvedValue({
      conflict_set_id: "set-strategy",
      status: "open",
      base_version: 3,
      head_version: 6,
      items: [
        {
          path: "a.md",
          conflict_type: "content_diverged",
          server_content: "a-server",
          client_content: "a-client"
        },
        {
          path: "b.md",
          conflict_type: "delete_vs_modify",
          server_content: null,
          client_content: "b-client"
        }
      ]
    });
    const resolveSpy = vi.spyOn(SelfHostedSyncPlugin.prototype, "resolvePendingConflict").mockResolvedValue();

    const plugin = new SelfHostedSyncPlugin();
    await plugin.resolvePendingConflictByStrategy("theirs");

    expect(resolveSpy).toHaveBeenCalledWith(
      [
        { path: "a.md", strategy: "theirs" },
        { path: "b.md", strategy: "theirs" }
      ],
      undefined
    );
  });

  it("shows actionable message when auth is expired", async () => {
    vi.spyOn(SettingsStore.prototype, "load").mockResolvedValue({
      serverUrl: "http://localhost:8787",
      spaceId: "space-auth",
      clientId: "client-auth",
      accessToken: "token-auth",
      syncState: {
        baseVersion: 0,
        expectedHead: 0,
        baseManifest: []
      }
    });
    vi.spyOn(SyncOrchestrator.prototype, "sync").mockRejectedValue(
      new Error("pull failed: 401 {\"error\":{\"code\":\"AUTH_FAILED\"}}")
    );

    const plugin = new SelfHostedSyncPlugin();
    await plugin.runManualSync([]);

    expect(plugin.getStatus().state).toBe("error");
    expect(plugin.getStatus().message).toContain("认证已过期");
  });
});
