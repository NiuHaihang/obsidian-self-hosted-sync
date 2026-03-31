declare module "obsidian" {
  export interface Command {
    id: string;
    name: string;
    callback?: () => void | Promise<void>;
    checkCallback?: (checking: boolean) => boolean | void;
  }

  export class Notice {
    constructor(message: string, timeout?: number);
  }

  export interface Vault {
    adapter: unknown;
    getName(): string;
  }

  export interface App {
    vault: Vault;
  }

  export class Plugin {
    app: App;
    addCommand(command: Command): void;
    addSettingTab(settingTab: PluginSettingTab): void;
    loadData(): Promise<unknown>;
    saveData(data: unknown): Promise<void>;
  }

  export class PluginSettingTab {
    app: App;
    plugin: Plugin;
    containerEl: HTMLElement;
    constructor(app: App, plugin: Plugin);
    display(): void;
  }

  export interface TextComponent {
    setPlaceholder(value: string): this;
    setValue(value: string): this;
    onChange(callback: (value: string) => void): this;
  }

  export interface ButtonComponent {
    setButtonText(value: string): this;
    setCta(): this;
    onClick(callback: () => void | Promise<void>): this;
  }

  export class Setting {
    constructor(containerEl: HTMLElement);
    setName(name: string): this;
    setDesc(description: string): this;
    addText(callback: (component: TextComponent) => void): this;
    addButton(callback: (component: ButtonComponent) => void): this;
  }
}
