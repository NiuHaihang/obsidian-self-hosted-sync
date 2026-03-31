import { SyncApiClient } from "./sync-api-client.js";
import type { PluginSettingsStore } from "../storage/settings-store.js";

export async function registerClientAndPersist(
  apiClient: SyncApiClient,
  settingsStore: PluginSettingsStore,
  payload: { spaceId: string; deviceId: string; clientName: string }
): Promise<void> {
  const registration = await apiClient.registerClient(payload.spaceId, {
    device_id: payload.deviceId,
    client_name: payload.clientName
  });

  const current = await settingsStore.load();
  await settingsStore.save({
    ...current,
    spaceId: payload.spaceId,
    clientId: registration.client_id,
    accessToken: registration.access_token,
    syncState: undefined
  });
}
