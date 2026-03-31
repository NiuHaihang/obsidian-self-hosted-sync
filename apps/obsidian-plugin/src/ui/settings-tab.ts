import type { PluginSettingsStore } from "../storage/settings-store.js";
import { SyncApiClient } from "../sync/sync-api-client.js";

export class SettingsTabModel {
  constructor(private readonly settingsStore: PluginSettingsStore) {}

  async saveSettings(payload: {
    serverUrl: string;
    spaceId: string;
    accessToken: string;
    clientId: string;
  }): Promise<void> {
    const current = await this.settingsStore.load();
    const identityChanged = current.serverUrl !== payload.serverUrl
      || current.spaceId !== payload.spaceId
      || current.clientId !== payload.clientId;

    await this.settingsStore.save({
      ...current,
      ...payload,
      syncState: identityChanged ? undefined : current.syncState
    });
  }

  async testConnection(): Promise<boolean> {
    const settings = await this.settingsStore.load();
    if (!settings.serverUrl || !settings.spaceId) {
      return false;
    }

    try {
      const api = new SyncApiClient(settings.serverUrl, () => settings.accessToken);
      await api.pullChanges(settings.spaceId, 0);
      return true;
    } catch {
      return false;
    }
  }
}
