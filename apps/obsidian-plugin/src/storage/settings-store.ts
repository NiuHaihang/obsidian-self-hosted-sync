import { readFile, writeFile } from "node:fs/promises";

export interface PluginSettings {
  serverUrl: string;
  spaceId: string;
  clientId: string;
  accessToken: string;
  syncState?: {
    baseVersion: number;
    expectedHead: number;
    baseManifest: Array<{
      path: string;
      hash: string;
      content: string;
    }>;
    pendingConflict?: {
      conflictSetId: string;
      expectedHead: number;
    };
  };
}

export interface PluginSettingsStore {
  load(): Promise<PluginSettings>;
  save(next: PluginSettings): Promise<void>;
}

const DEFAULT_SETTINGS: PluginSettings = {
  serverUrl: "",
  spaceId: "",
  clientId: "",
  accessToken: ""
};

export class SettingsStore implements PluginSettingsStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<PluginSettings> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PluginSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async save(next: PluginSettings): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(next, null, 2), "utf8");
  }
}
