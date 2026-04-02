import { Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { SelfHostedSyncPlugin } from "./main.js";
import type { PluginSettings, PluginSettingsStore } from "./storage/settings-store.js";
import { SettingsTabModel } from "./ui/settings-tab.js";
import { registerClientAndPersist } from "./sync/register-client.js";
import { SyncApiClient } from "./sync/sync-api-client.js";
import { BINARY_MARKER_PREFIX } from "./sync/content-encoding.js";

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

  constructor(
    app: Plugin["app"],
    plugin: Plugin,
    private readonly settingsStore: PluginSettingsStore,
    private readonly syncCore: SelfHostedSyncPlugin,
    private readonly resolveVaultPath: () => string | null
  ) {
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

    await this.renderConflictSection(container);
  }

  private async renderConflictSection(container: HTMLElement): Promise<void> {
    const title = document.createElement("h3");
    title.textContent = "冲突处理";
    container.appendChild(title);

    const helper = document.createElement("p");
    helper.textContent = "检测到冲突后，可在这里查看冲突项并选择保留本地（ours）或服务端（theirs）。";
    container.appendChild(helper);

    const preview = await this.syncCore.getPendingConflictPreview();
    if (!preview) {
      const empty = document.createElement("p");
      empty.textContent = "当前没有待处理冲突。";
      container.appendChild(empty);
      return;
    }

    const summary = document.createElement("p");
    const typeSummary = Object.entries(preview.summary.byType)
      .map(([type, count]) => `${type}:${count}`)
      .join(", ");
    summary.textContent = `冲突集 ${preview.conflictSetId}，共 ${preview.summary.total} 项${typeSummary ? `（${typeSummary}）` : ""}`;
    container.appendChild(summary);

    type Strategy = "ours" | "theirs" | "manual";
    type Draft = {
      strategy: Strategy;
      manualContent: string;
      delete: boolean;
      manualEditable: boolean;
    };

    const list = document.createElement("div");
    const drafts = new Map<string, Draft>();
    for (const item of preview.items) {
      const serverBinary = typeof item.server_content === "string" && item.server_content.startsWith(BINARY_MARKER_PREFIX);
      const clientBinary = typeof item.client_content === "string" && item.client_content.startsWith(BINARY_MARKER_PREFIX);
      const manualEditable = !serverBinary && !clientBinary;
      const defaultManual = item.client_content ?? item.server_content ?? "";
      drafts.set(item.path, {
        strategy: "ours",
        manualContent: defaultManual,
        delete: false,
        manualEditable
      });

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "8px";
      row.style.alignItems = "center";
      row.style.marginBottom = "6px";

      const label = document.createElement("span");
      label.style.flex = "1";
      label.textContent = `${item.path} (${item.conflict_type})`;
      row.appendChild(label);

      const select = document.createElement("select");
      const ours = document.createElement("option");
      ours.value = "ours";
      ours.text = "保留本地";
      const theirs = document.createElement("option");
      theirs.value = "theirs";
      theirs.text = "保留服务端";
      const manual = document.createElement("option");
      manual.value = "manual";
      manual.text = "手动编辑";
      if (!manualEditable) {
        manual.disabled = true;
      }
      select.appendChild(ours);
      select.appendChild(theirs);
      select.appendChild(manual);
      select.value = "ours";

      const manualWrap = document.createElement("div");
      manualWrap.style.display = "none";
      manualWrap.style.margin = "8px 0 12px 0";

      const manualText = document.createElement("textarea");
      manualText.value = defaultManual;
      manualText.rows = 5;
      manualText.style.width = "100%";
      manualText.style.fontFamily = "monospace";
      manualText.oninput = () => {
        const draft = drafts.get(item.path);
        if (draft) {
          draft.manualContent = manualText.value;
        }
      };

      const deleteWrap = document.createElement("label");
      deleteWrap.style.display = "block";
      deleteWrap.style.marginBottom = "6px";
      const deleteBox = document.createElement("input");
      deleteBox.type = "checkbox";
      deleteBox.onchange = () => {
        const draft = drafts.get(item.path);
        if (draft) {
          draft.delete = deleteBox.checked;
        }
        manualText.disabled = deleteBox.checked;
      };
      deleteWrap.appendChild(deleteBox);
      deleteWrap.append(" 手动解决为删除该文件");

      if (!manualEditable) {
        const hint = document.createElement("div");
        hint.textContent = "该冲突涉及二进制内容，暂不支持手动编辑，请使用保留本地/服务端。";
        hint.style.opacity = "0.8";
        manualWrap.appendChild(hint);
      } else {
        manualWrap.appendChild(deleteWrap);
        manualWrap.appendChild(manualText);
      }

      select.onchange = () => {
        const draft = drafts.get(item.path);
        if (draft) {
          draft.strategy = select.value === "theirs"
            ? "theirs"
            : (select.value === "manual" ? "manual" : "ours");
        }
        manualWrap.style.display = select.value === "manual" ? "block" : "none";
      };
      row.appendChild(select);

      list.appendChild(row);
      list.appendChild(manualWrap);
    }
    container.appendChild(list);

    new Setting(container)
      .setName("快速处理")
      .setDesc("一键按统一策略解决全部冲突")
      .addButton((button) => {
        button.setButtonText("全部保留本地").onClick(async () => {
          await this.resolveAllConflicts("ours");
        });
      })
      .addButton((button) => {
        button.setButtonText("全部保留服务端").onClick(async () => {
          await this.resolveAllConflicts("theirs");
        });
      })
      .addButton((button) => {
        button.setButtonText("刷新冲突").onClick(async () => {
          await this.render();
        });
      });

    new Setting(container)
      .setName("逐条处理")
      .setDesc("按上方每一条选择的策略提交冲突解决")
      .addButton((button) => {
        button.setButtonText("提交逐条解决").setCta().onClick(async () => {
          const vaultPath = this.resolveVaultPath();
          if (!vaultPath) {
            new Notice("当前 Vault 适配器不支持本地文件路径，仅桌面模式可用");
            return;
          }

          try {
            const resolutions = preview.items.map((item) => {
              const draft = drafts.get(item.path);
              if (!draft || draft.strategy === "ours" || draft.strategy === "theirs") {
                return {
                  path: item.path,
                  strategy: draft?.strategy ?? "ours"
                };
              }

              if (draft.delete) {
                return {
                  path: item.path,
                  strategy: "manual" as const,
                  delete: true
                };
              }

              return {
                path: item.path,
                strategy: "manual" as const,
                content_b64: Buffer.from(draft.manualContent, "utf8").toString("base64"),
                content_encoding: "utf8" as const
              };
            });
            await this.syncCore.resolvePendingConflictWithVault(vaultPath, resolutions);
            new Notice(this.syncCore.getStatus().message);
            await this.render();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : "冲突解决失败");
          }
        });
      });
  }

  private async resolveAllConflicts(strategy: "ours" | "theirs"): Promise<void> {
    const vaultPath = this.resolveVaultPath();
    if (!vaultPath) {
      new Notice("当前 Vault 适配器不支持本地文件路径，仅桌面模式可用");
      return;
    }

    try {
      await this.syncCore.resolvePendingConflictByStrategyWithVault(vaultPath, strategy);
      new Notice(this.syncCore.getStatus().message);
      await this.render();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "冲突解决失败");
    }
  }
}

export default class SelfHostedSyncObsidianPlugin extends Plugin {
  private settingsStore!: PluginSettingsStore;
  private syncCore!: SelfHostedSyncPlugin;

  async onload(): Promise<void> {
    this.settingsStore = new ObsidianSettingsStore(this);
    this.syncCore = new SelfHostedSyncPlugin(this.settingsStore);

    this.addSettingTab(
      new ObsidianSyncSettingTab(this.app, this, this.settingsStore, this.syncCore, () => this.getVaultPath())
    );
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
