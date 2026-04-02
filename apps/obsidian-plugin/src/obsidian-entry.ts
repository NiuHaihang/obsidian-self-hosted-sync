import { Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { SelfHostedSyncPlugin } from "./main.js";
import type { PluginSettings, PluginSettingsStore } from "./storage/settings-store.js";
import { SettingsTabModel } from "./ui/settings-tab.js";
import { registerClientAndPersist } from "./sync/register-client.js";
import { SyncApiClient } from "./sync/sync-api-client.js";

type VaultAdapterWithBasePath = {
  getBasePath?: () => string;
};

const DEFAULT_SETTINGS: PluginSettings = {
  serverUrl: "",
  spaceId: "",
  clientId: "",
  accessToken: ""
};

function normalizeSettings(raw: unknown): PluginSettings {
  const next = typeof raw === "object" && raw !== null ? raw as Partial<PluginSettings> : {};
  return {
    ...DEFAULT_SETTINGS,
    ...next
  };
}

class ObsidianSettingsStore implements PluginSettingsStore {
  private saveChain: Promise<void> = Promise.resolve();

  constructor(private readonly plugin: Plugin) {}

  async load(): Promise<PluginSettings> {
    return normalizeSettings(await this.plugin.loadData());
  }

  async save(next: PluginSettings): Promise<void> {
    const run = this.saveChain.then(() => this.plugin.saveData(next));
    this.saveChain = run.then(() => undefined, () => undefined);
    await run;
  }
}

class ObsidianSyncSettingTab extends PluginSettingTab {
  private readonly model: SettingsTabModel;

  constructor(app: Plugin["app"], plugin: Plugin, private readonly settingsStore: PluginSettingsStore) {
    super(app, plugin);
    this.model = new SettingsTabModel(settingsStore);
  }

  display(): void {
    void this.render();
  }

  private async render(): Promise<void> {
    const container = this.containerEl;
    container.replaceChildren();

    const loaded = await this.settingsStore.load();
    let draft = { ...loaded };
    let registerDeviceId = loaded.clientId || `device-${Date.now()}`;
    let registerClientName = "Obsidian";

    new Setting(container)
      .setName("Server URL")
      .setDesc("示例: http://127.0.0.1:8787")
      .addText((text) => {
        text.setPlaceholder("http://127.0.0.1:8787").setValue(draft.serverUrl).onChange((value) => {
          draft.serverUrl = value.trim();
        });
      });

    new Setting(container)
      .setName("Space ID")
      .setDesc("服务端空间标识")
      .addText((text) => {
        text.setPlaceholder("space-id").setValue(draft.spaceId).onChange((value) => {
          draft.spaceId = value.trim();
        });
      });

    new Setting(container)
      .setName("Access Token")
      .setDesc("客户端访问令牌")
      .addText((text) => {
        text.setPlaceholder("token").setValue(draft.accessToken).onChange((value) => {
          draft.accessToken = value.trim();
        });
      });

    new Setting(container)
      .setName("Client ID")
      .setDesc("当前客户端标识")
      .addText((text) => {
        text.setPlaceholder("client-id").setValue(draft.clientId).onChange((value) => {
          draft.clientId = value.trim();
        });
      });

    new Setting(container)
      .setName("Register Device ID")
      .setDesc("用于向服务端注册客户端")
      .addText((text) => {
        text.setPlaceholder("device-id").setValue(registerDeviceId).onChange((value) => {
          registerDeviceId = value.trim();
        });
      });

    new Setting(container)
      .setName("Register Client Name")
      .setDesc("展示给服务端的客户端名称")
      .addText((text) => {
        text.setPlaceholder("Obsidian").setValue(registerClientName).onChange((value) => {
          registerClientName = value.trim() || "Obsidian";
        });
      });

    new Setting(container)
      .setName("保存配置")
      .setDesc("保存当前连接与凭据")
      .addButton((button) => {
        button.setButtonText("保存").setCta().onClick(async () => {
          try {
            await this.model.saveSettings({
              serverUrl: draft.serverUrl,
              spaceId: draft.spaceId,
              accessToken: draft.accessToken,
              clientId: draft.clientId
            });
            new Notice("配置已保存");
          } catch (error) {
            new Notice(error instanceof Error ? error.message : "配置保存失败");
          }
        });
      })
      .addButton((button) => {
        button.setButtonText("测试连接").onClick(async () => {
          try {
            await this.model.saveSettings({
              serverUrl: draft.serverUrl,
              spaceId: draft.spaceId,
              accessToken: draft.accessToken,
              clientId: draft.clientId
            });
            const ok = await this.model.testConnection();
            new Notice(ok ? "连接成功" : "连接失败");
          } catch (error) {
            new Notice(error instanceof Error ? error.message : "连接失败");
          }
        });
      });

    new Setting(container)
      .setName("注册客户端")
      .setDesc("从服务端获取 client_id 与 access_token")
      .addButton((button) => {
        button.setButtonText("注册").onClick(async () => {
          if (!draft.serverUrl || !draft.spaceId || !registerDeviceId) {
            new Notice("请先填写 Server URL / Space ID / Register Device ID");
            return;
          }

          try {
            const apiClient = new SyncApiClient(draft.serverUrl, () => draft.accessToken);
            await registerClientAndPersist(apiClient, this.settingsStore, {
              spaceId: draft.spaceId,
              deviceId: registerDeviceId,
              clientName: registerClientName
            });
            const refreshed = await this.settingsStore.load();
            draft = { ...refreshed };
            new Notice(`注册成功: ${refreshed.clientId}`);
            await this.render();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : "注册失败");
          }
        });
      });
  }
}

export default class SelfHostedSyncObsidianPlugin extends Plugin {
  private settingsStore!: PluginSettingsStore;
  private syncCore!: SelfHostedSyncPlugin;

  async onload(): Promise<void> {
    this.settingsStore = new ObsidianSettingsStore(this);
    this.syncCore = new SelfHostedSyncPlugin(this.settingsStore);

    this.addSettingTab(new ObsidianSyncSettingTab(this.app, this, this.settingsStore));
    this.addRibbonIcon("refresh-cw", "Self Hosted Sync: Run manual sync", async () => {
      await this.runManualSyncFromVault();
    });

    this.addCommand({
      id: "self-hosted-sync-run-now",
      name: "Self Hosted Sync: Run manual sync",
      callback: async () => {
        await this.runManualSyncFromVault();
      }
    });

    this.addCommand({
      id: "self-hosted-sync-show-conflicts",
      name: "Self Hosted Sync: Show pending conflicts",
      callback: async () => {
        const preview = await this.syncCore.getPendingConflictPreview();
        if (!preview) {
          new Notice("当前没有待处理冲突");
          return;
        }

        const typeSummary = Object.entries(preview.summary.byType)
          .map(([type, count]) => `${type}:${count}`)
          .join(", ");
        new Notice(
          `冲突集 ${preview.conflictSetId}，共 ${preview.summary.total} 项${typeSummary ? ` (${typeSummary})` : ""}`
        );
      }
    });

    this.addCommand({
      id: "self-hosted-sync-resolve-ours",
      name: "Self Hosted Sync: Resolve all conflicts (ours)",
      callback: async () => {
        const vaultPath = this.getVaultPath();
        if (!vaultPath) {
          new Notice("当前 Vault 适配器不支持本地文件路径，仅桌面模式可用");
          return;
        }

        await this.syncCore.resolvePendingConflictByStrategyWithVault(vaultPath, "ours");
        new Notice(this.syncCore.getStatus().message);
      }
    });

    this.addCommand({
      id: "self-hosted-sync-resolve-theirs",
      name: "Self Hosted Sync: Resolve all conflicts (theirs)",
      callback: async () => {
        const vaultPath = this.getVaultPath();
        if (!vaultPath) {
          new Notice("当前 Vault 适配器不支持本地文件路径，仅桌面模式可用");
          return;
        }

        await this.syncCore.resolvePendingConflictByStrategyWithVault(vaultPath, "theirs");
        new Notice(this.syncCore.getStatus().message);
      }
    });
  }

  private getVaultPath(): string | null {
    const adapter = this.app.vault.adapter as VaultAdapterWithBasePath;
    if (typeof adapter.getBasePath !== "function") {
      return null;
    }
    return adapter.getBasePath();
  }

  private async runManualSyncFromVault(): Promise<void> {
    const vaultPath = this.getVaultPath();
    if (!vaultPath) {
      new Notice("当前 Vault 适配器不支持本地文件路径，仅桌面模式可用");
      return;
    }

    await this.syncCore.runManualSyncWithVault(vaultPath);
    new Notice(this.syncCore.getStatus().message);
  }
}
