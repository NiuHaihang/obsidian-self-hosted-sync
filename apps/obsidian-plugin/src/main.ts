import { SettingsStore } from "./storage/settings-store.js";
import { FileSystemVaultAdapter } from "./storage/vault-file-adapter.js";
import { SyncApiClient, type ConflictSetItem } from "./sync/sync-api-client.js";
import { SyncOrchestrator, type PullResponse } from "./sync/sync-orchestrator.js";
import { SyncStatusViewModel } from "./ui/sync-status-view.js";
import { formatConflictNotice, type ConflictNotice } from "./ui/conflict-notice.js";
import type { PluginSettings, PluginSettingsStore } from "./storage/settings-store.js";
import type { ContentEncoding } from "./sync/content-encoding.js";

type ManifestItem = { path: string; hash: string; content: string };

interface ManualSyncHooks {
  applyPulledChanges?: (pull: PullResponse) => Promise<void> | void;
  collectManifest?: () => Promise<ManifestItem[]> | ManifestItem[];
}

export interface PendingConflictPreview {
  conflictSetId: string;
  expectedHead: number;
  notices: ConflictNotice[];
  items: ConflictSetItem[];
  summary: {
    total: number;
    byType: Record<string, number>;
  };
}

export type ConflictBatchStrategy = "ours" | "theirs";

type ConflictResolution = {
  path: string;
  strategy: "ours" | "theirs" | "manual";
  content_b64?: string;
  content_encoding?: ContentEncoding;
  delete?: boolean;
};

function isConflictSetGoneError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /(?:get conflict set failed|resolve failed):\s*(404|422)\b/.test(error.message);
}

export class SelfHostedSyncPlugin {
  private readonly settingsStore: PluginSettingsStore;
  private readonly statusView = new SyncStatusViewModel();

  constructor(settingsStore: PluginSettingsStore = new SettingsStore(".obsidian-self-hosted-sync.json")) {
    this.settingsStore = settingsStore;
  }

  async runManualSyncWithVault(vaultPath: string): Promise<void> {
    const adapter = new FileSystemVaultAdapter(vaultPath);

    try {
      const currentManifest = await adapter.collectManifest();
      await this.runManualSync(currentManifest, {
        applyPulledChanges: (pull) => adapter.applyPulledChanges(pull),
        collectManifest: () => adapter.collectManifest()
      });
    } catch (error) {
      this.statusView.setError(error instanceof Error ? error.message : "unknown error");
    }
  }

  async runManualSync(currentManifest: ManifestItem[], hooks?: ManualSyncHooks): Promise<void> {
    const settings = await this.settingsStore.load();
    const apiClient = new SyncApiClient(settings.serverUrl, () => settings.accessToken);
    const orchestrator = new SyncOrchestrator(apiClient);
    const syncState = settings.syncState ?? {
      baseVersion: 0,
      expectedHead: 0,
      baseManifest: []
    };

    if (syncState.pendingConflict) {
      this.statusView.setConflict(
        syncState.pendingConflict.conflictSetId,
        `存在未解决冲突（${syncState.pendingConflict.conflictSetId}），请先完成冲突处理`
      );
      return;
    }

    this.statusView.setSyncing();

    try {
      const result = await orchestrator.sync(
        settings.spaceId,
        settings.clientId,
        syncState.baseVersion,
        syncState.expectedHead,
        syncState.baseManifest,
        currentManifest
      );

      if (result.push.merge_result === "conflict") {
        const conflictSetId = result.push.conflict_set_id;
        const conflictHead = Number(result.push.new_head_version ?? result.pull.head_version ?? syncState.expectedHead);
        if (conflictSetId) {
          await this.settingsStore.save({
            ...settings,
            syncState: {
              ...syncState,
              pendingConflict: {
                conflictSetId,
                expectedHead: conflictHead
              }
            }
          });
        }
        this.statusView.setConflict(
          conflictSetId,
          conflictSetId
            ? `同步检测到冲突（${conflictSetId}），已保留本地内容，请先完成冲突处理`
            : "同步检测到冲突，已保留本地内容，请先完成冲突处理"
        );
        return;
      }

      if (hooks?.applyPulledChanges) {
        await hooks.applyPulledChanges(result.pull);
      }

      const persistedManifest = hooks?.collectManifest
        ? await hooks.collectManifest()
        : result.rebasedCurrentManifest;

      const nextHead = Number(result.push.new_head_version ?? result.pull.head_version ?? syncState.expectedHead);
      await this.settingsStore.save({
        ...settings,
        syncState: {
          baseVersion: nextHead,
          expectedHead: nextHead,
          baseManifest: persistedManifest,
          pendingConflict: undefined
        }
      });

      this.statusView.setSuccess();
    } catch (error) {
      this.statusView.setError(error instanceof Error ? error.message : "unknown error");
    }
  }

  async getPendingConflictPreview(): Promise<PendingConflictPreview | null> {
    const settings = await this.settingsStore.load();
    const pendingConflict = settings.syncState?.pendingConflict;
    if (!pendingConflict) {
      return null;
    }

    try {
      const apiClient = new SyncApiClient(settings.serverUrl, () => settings.accessToken);
      const conflictSet = await apiClient.getConflictSet(settings.spaceId, pendingConflict.conflictSetId);
      const byType: Record<string, number> = {};
      for (const item of conflictSet.items) {
        byType[item.conflict_type] = (byType[item.conflict_type] ?? 0) + 1;
      }

      return {
        conflictSetId: pendingConflict.conflictSetId,
        expectedHead: pendingConflict.expectedHead,
        notices: conflictSet.items.map((item) => formatConflictNotice(item.path, item.conflict_path)),
        items: conflictSet.items,
        summary: {
          total: conflictSet.items.length,
          byType
        }
      };
    } catch (error) {
      if (isConflictSetGoneError(error) && settings.syncState) {
        await this.settingsStore.save({
          ...settings,
          syncState: {
            ...settings.syncState,
            pendingConflict: undefined
          }
        });
        this.statusView.setError("待处理冲突在服务端已失效，已清理本地状态，请重新同步");
        return null;
      }

      throw error;
    }
  }

  async resolvePendingConflictByStrategyWithVault(
    vaultPath: string,
    strategy: ConflictBatchStrategy
  ): Promise<void> {
    const adapter = new FileSystemVaultAdapter(vaultPath);
    await this.resolvePendingConflictByStrategy(strategy, {
      applyPulledChanges: (pull) => adapter.applyPulledChanges(pull),
      collectManifest: () => adapter.collectManifest()
    });
  }

  async resolvePendingConflictByStrategy(strategy: ConflictBatchStrategy, hooks?: ManualSyncHooks): Promise<void> {
    const preview = await this.getPendingConflictPreview();
    if (!preview) {
      this.statusView.setError("没有待处理冲突");
      return;
    }

    const resolutions: ConflictResolution[] = preview.items.map((item) => ({
      path: item.path,
      strategy
    }));

    await this.resolvePendingConflict(resolutions, hooks);
  }

  async resolvePendingConflictWithVault(vaultPath: string, resolutions: ConflictResolution[]): Promise<void> {
    const adapter = new FileSystemVaultAdapter(vaultPath);
    await this.resolvePendingConflict(resolutions, {
      applyPulledChanges: (pull) => adapter.applyPulledChanges(pull),
      collectManifest: () => adapter.collectManifest()
    });
  }

  async resolvePendingConflict(resolutions: ConflictResolution[], hooks?: ManualSyncHooks): Promise<void> {
    const settings = await this.settingsStore.load();
    const syncState = settings.syncState;
    const pendingConflict = syncState?.pendingConflict;
    if (!pendingConflict || !syncState) {
      this.statusView.setError("没有待处理冲突");
      return;
    }

    if (!hooks?.applyPulledChanges || !hooks.collectManifest) {
      this.statusView.setError("缺少本地落盘适配器，无法安全完成冲突解决");
      return;
    }

    this.statusView.setSyncing();

    let resolveHead: number | null = null;

    try {
      const apiClient = new SyncApiClient(settings.serverUrl, () => settings.accessToken);
      const resolveResult = await apiClient.resolveConflicts(settings.spaceId, pendingConflict.conflictSetId, {
        expected_head: pendingConflict.expectedHead,
        resolutions
      });
      resolveHead = Number(resolveResult.new_head_version ?? pendingConflict.expectedHead);

      const pullRaw = await apiClient.pullChanges(settings.spaceId, syncState.baseVersion);
      const pull = pullRaw as PullResponse;
      await hooks.applyPulledChanges(pull);
      const persistedManifest = await hooks.collectManifest();
      const nextHead = Number(resolveResult.new_head_version ?? pull.head_version ?? pendingConflict.expectedHead);

      await this.settingsStore.save({
        ...settings,
        syncState: {
          baseVersion: nextHead,
          expectedHead: nextHead,
          baseManifest: persistedManifest,
          pendingConflict: undefined
        }
      });

      this.statusView.setSuccess("冲突已解决并同步完成");
    } catch (error) {
      if (resolveHead !== null) {
        await this.clearPendingConflictAfterServerResolve(settings, syncState, resolveHead, error);
        return;
      }

      if (isConflictSetGoneError(error)) {
        await this.settingsStore.save({
          ...settings,
          syncState: {
            ...syncState,
            pendingConflict: undefined
          }
        });
        this.statusView.setError("冲突集在服务端已失效，已清理本地状态，请重新同步");
        return;
      }

      this.statusView.setError(error instanceof Error ? error.message : "unknown error");
    }
  }

  private async clearPendingConflictAfterServerResolve(
    settings: PluginSettings,
    syncState: NonNullable<PluginSettings["syncState"]>,
    resolveHead: number,
    error: unknown
  ): Promise<void> {
    try {
      await this.settingsStore.save({
        ...settings,
        syncState: {
          ...syncState,
          expectedHead: resolveHead,
          pendingConflict: undefined
        }
      });
      const suffix = error instanceof Error ? `：${error.message}` : "";
      this.statusView.setError(`服务端冲突已解决，但本地更新未完成，请重新同步${suffix}`);
    } catch (saveError) {
      const saveSuffix = saveError instanceof Error ? `；状态保存失败：${saveError.message}` : "";
      this.statusView.setError(`服务端冲突已解决，但本地状态清理失败${saveSuffix}`);
    }
  }

  getStatus() {
    return this.statusView.getStatus();
  }
}
