"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/obsidian-entry.ts
var obsidian_entry_exports = {};
__export(obsidian_entry_exports, {
  default: () => SelfHostedSyncObsidianPlugin
});
module.exports = __toCommonJS(obsidian_entry_exports);
var import_obsidian = require("obsidian");

// src/storage/settings-store.ts
var import_promises = require("node:fs/promises");
var DEFAULT_SETTINGS = {
  serverUrl: "",
  spaceId: "",
  clientId: "",
  accessToken: ""
};
var SettingsStore = class {
  constructor(filePath) {
    this.filePath = filePath;
  }
  async load() {
    try {
      const raw = await (0, import_promises.readFile)(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  async save(next) {
    await (0, import_promises.writeFile)(this.filePath, JSON.stringify(next, null, 2), "utf8");
  }
};

// src/storage/vault-file-adapter.ts
var import_node_crypto = require("node:crypto");
var import_node_path = require("node:path");
var import_promises2 = require("node:fs/promises");

// src/sync/content-encoding.ts
var BINARY_MARKER_PREFIX = "__SHS_BINARY_B64__:";
function decodeTransportContent(contentB64, encoding) {
  if (!contentB64) {
    return "";
  }
  if (encoding === "binary_base64") {
    return `${BINARY_MARKER_PREFIX}${contentB64}`;
  }
  return Buffer.from(contentB64, "base64").toString("utf8");
}
function encodeManifestContent(content) {
  if (content.startsWith(BINARY_MARKER_PREFIX)) {
    return {
      content_b64: content.slice(BINARY_MARKER_PREFIX.length),
      content_encoding: "binary_base64"
    };
  }
  return {
    content_b64: Buffer.from(content, "utf8").toString("base64"),
    content_encoding: "utf8"
  };
}

// src/storage/vault-file-adapter.ts
var SETTINGS_FILE_NAME = ".obsidian-self-hosted-sync.json";
var IGNORED_ROOT_ENTRIES = /* @__PURE__ */ new Set([".obsidian", ".git", ".trash"]);
var IGNORED_FILE_NAMES = /* @__PURE__ */ new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
var BINARY_EXTENSIONS = /* @__PURE__ */ new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".webp",
  ".svg",
  ".ico",
  ".pdf",
  ".zip",
  ".7z",
  ".tar",
  ".gz",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
  ".webm",
  ".wasm",
  ".exe",
  ".dll",
  ".so",
  ".dylib"
]);
function hashContent(content) {
  return (0, import_node_crypto.createHash)("sha256").update(content).digest("hex");
}
function normalizeRelativePath(input) {
  if (!input) {
    throw new Error("invalid path");
  }
  const path = input.trim().replace(/\\/g, "/");
  if (!path || path.startsWith("/")) {
    throw new Error(`unsafe path: ${input}`);
  }
  const normalized = import_node_path.posix.normalize(path.replace(/^\.\//, ""));
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`unsafe path: ${input}`);
  }
  return normalized;
}
function isBinaryPath(relativePath) {
  const normalized = relativePath.toLowerCase();
  const slash = normalized.lastIndexOf("/");
  const dot = normalized.lastIndexOf(".");
  if (dot <= slash) {
    return false;
  }
  return BINARY_EXTENSIONS.has(normalized.slice(dot));
}
function hasNullByte(content) {
  return content.includes(0);
}
function encodeBinaryContent(content) {
  return `${BINARY_MARKER_PREFIX}${content.toString("base64")}`;
}
function decodeBinaryContent(content) {
  return Buffer.from(content.slice(BINARY_MARKER_PREFIX.length), "base64");
}
var FileSystemVaultAdapter = class {
  constructor(vaultRoot) {
    __publicField(this, "vaultRootAbs");
    __publicField(this, "vaultRootComparable");
    this.vaultRootAbs = (0, import_node_path.resolve)(vaultRoot);
    this.vaultRootComparable = this.toComparablePath(this.vaultRootAbs);
  }
  toComparablePath(path) {
    const resolved = (0, import_node_path.resolve)(path);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  }
  isWithinVault(absolutePath) {
    const rel = (0, import_node_path.relative)(this.vaultRootComparable, this.toComparablePath(absolutePath));
    return rel === "" || rel !== ".." && !rel.startsWith(`..${import_node_path.sep}`);
  }
  resolveVaultPath(relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    const absolute = (0, import_node_path.resolve)(this.vaultRootAbs, ...normalized.split("/"));
    if (!this.isWithinVault(absolute)) {
      throw new Error(`unsafe path: ${relativePath}`);
    }
    return absolute;
  }
  async walkDirectory(absoluteDir, relativeDir, output) {
    const entries = await (0, import_promises2.readdir)(absoluteDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (!relativeDir && IGNORED_ROOT_ENTRIES.has(relativePath)) {
        continue;
      }
      if (!relativeDir && relativePath === SETTINGS_FILE_NAME) {
        continue;
      }
      const absolutePath = this.resolveVaultPath(relativePath);
      if (entry.isDirectory()) {
        await this.walkDirectory(absolutePath, relativePath, output);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (IGNORED_FILE_NAMES.has(entry.name)) {
        continue;
      }
      const raw = await (0, import_promises2.readFile)(absolutePath);
      const content = isBinaryPath(relativePath) || hasNullByte(raw) ? encodeBinaryContent(raw) : raw.toString("utf8");
      output.push({
        path: relativePath,
        content,
        hash: hashContent(content)
      });
    }
  }
  async collectManifest() {
    const files = [];
    await this.walkDirectory(this.vaultRootAbs, "", files);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return files;
  }
  async exists(absolutePath) {
    try {
      await (0, import_promises2.stat)(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
  async pruneEmptyDirectories(fromAbsoluteDir) {
    let current = (0, import_node_path.resolve)(fromAbsoluteDir);
    if (!this.isWithinVault(current)) {
      return;
    }
    while (this.isWithinVault(current) && current !== this.vaultRootAbs) {
      try {
        const entries = await (0, import_promises2.readdir)(current);
        if (entries.length > 0) {
          return;
        }
        await (0, import_promises2.rm)(current, { recursive: true, force: true });
      } catch {
        return;
      }
      const parent = (0, import_node_path.dirname)(current);
      if (parent === current) {
        return;
      }
      current = parent;
    }
  }
  async applyOperation(op) {
    if (op.op_type === "delete") {
      const absolutePath = this.resolveVaultPath(op.path);
      await (0, import_promises2.rm)(absolutePath, { force: true });
      await this.pruneEmptyDirectories((0, import_node_path.dirname)(absolutePath));
      return;
    }
    if (op.op_type === "rename" && op.new_path) {
      const sourcePath = this.resolveVaultPath(op.path);
      const targetPath = this.resolveVaultPath(op.new_path);
      if (!await this.exists(sourcePath)) {
        return;
      }
      await (0, import_promises2.mkdir)((0, import_node_path.dirname)(targetPath), { recursive: true });
      await (0, import_promises2.rename)(sourcePath, targetPath);
      await this.pruneEmptyDirectories((0, import_node_path.dirname)(sourcePath));
      return;
    }
    if (op.op_type === "upsert") {
      const absolutePath = this.resolveVaultPath(op.path);
      await (0, import_promises2.mkdir)((0, import_node_path.dirname)(absolutePath), { recursive: true });
      const content = decodeTransportContent(op.content_b64, op.content_encoding);
      if (content.startsWith(BINARY_MARKER_PREFIX)) {
        await (0, import_promises2.writeFile)(absolutePath, decodeBinaryContent(content));
        return;
      }
      await (0, import_promises2.writeFile)(absolutePath, content, "utf8");
    }
  }
  async applyPulledChanges(pull) {
    const changes = Array.isArray(pull.changes) ? pull.changes : [];
    for (const change of changes) {
      const ops = Array.isArray(change.ops) ? change.ops : [];
      for (const op of ops) {
        await this.applyOperation(op);
      }
    }
  }
};

// src/sync/sync-api-client.ts
var SyncApiClient = class {
  constructor(baseUrl, getToken) {
    this.baseUrl = baseUrl;
    this.getToken = getToken;
  }
  authHeaders() {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  async registerClient(spaceId, payload) {
    const response = await fetch(`${this.baseUrl}/v1/spaces/${spaceId}/clients`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`register client failed: ${response.status}`);
    }
    return await response.json();
  }
  async pullChanges(spaceId, fromVersion) {
    const response = await fetch(`${this.baseUrl}/v1/spaces/${spaceId}/changes?from_version=${fromVersion}`, {
      headers: {
        ...this.authHeaders()
      }
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`pull failed: ${response.status} ${body}`);
    }
    return response.json();
  }
  async getConflictSet(spaceId, conflictSetId) {
    const response = await fetch(`${this.baseUrl}/v1/spaces/${spaceId}/conflicts/${conflictSetId}`, {
      headers: {
        ...this.authHeaders()
      }
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`get conflict set failed: ${response.status} ${body}`);
    }
    return await response.json();
  }
  async pushChanges(spaceId, payload) {
    const response = await fetch(`${this.baseUrl}/v1/spaces/${spaceId}/changes`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.authHeaders()
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`push failed: ${response.status} ${body}`);
    }
    return response.json();
  }
  async resolveConflicts(spaceId, conflictSetId, payload) {
    const response = await fetch(
      `${this.baseUrl}/v1/spaces/${spaceId}/conflicts/${conflictSetId}/resolutions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...this.authHeaders()
        },
        body: JSON.stringify(payload)
      }
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`resolve failed: ${response.status} ${body}`);
    }
    return await response.json();
  }
};

// src/sync/sync-orchestrator.ts
var import_node_crypto2 = require("node:crypto");
function calculateManifestDelta(base, current) {
  const baseMap = new Map(base.map((file) => [file.path, file]));
  const currentMap = new Map(current.map((file) => [file.path, file]));
  const upserts = [];
  const deletes = [];
  for (const [path, file] of currentMap) {
    const old = baseMap.get(path);
    if (!old || old.hash !== file.hash) {
      upserts.push(file);
    }
  }
  for (const path of baseMap.keys()) {
    if (!currentMap.has(path)) {
      deletes.push(path);
    }
  }
  return { upserts, deletes };
}
function hashContent2(content) {
  return (0, import_node_crypto2.createHash)("sha256").update(content).digest("hex");
}
function applyPulledChanges(baseManifest, pull) {
  const next = new Map(baseManifest.map((item) => [item.path, { ...item }]));
  const changes = Array.isArray(pull.changes) ? pull.changes : [];
  for (const change of changes) {
    const ops = Array.isArray(change.ops) ? change.ops : [];
    for (const op of ops) {
      if (op.op_type === "delete") {
        next.delete(op.path);
        continue;
      }
      if (op.op_type === "rename" && op.new_path) {
        const current = next.get(op.path);
        next.delete(op.path);
        if (current) {
          next.set(op.new_path, { ...current, path: op.new_path });
        }
        continue;
      }
      if (op.op_type === "upsert") {
        const existing = next.get(op.path);
        const content = op.content_b64 ? decodeTransportContent(op.content_b64, op.content_encoding) : existing?.content ?? "";
        next.set(op.path, {
          path: op.path,
          content,
          hash: hashContent2(content)
        });
      }
    }
  }
  return [...next.values()];
}
var SyncOrchestrator = class {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }
  async sync(spaceId, clientId, baseVersion, expectedHead, baseManifest, currentManifest) {
    const pullRaw = await this.apiClient.pullChanges(spaceId, baseVersion);
    const pull = pullRaw;
    const rebasedBaseManifest = applyPulledChanges(baseManifest, pull);
    const rebasedCurrentManifest = [...currentManifest];
    const nextBaseVersion = Number(pull.head_version ?? baseVersion);
    const nextExpectedHead = Number(pull.head_version ?? expectedHead);
    const delta = calculateManifestDelta(baseManifest, currentManifest);
    const operations = [
      ...delta.upserts.map((item) => {
        const encoded = encodeManifestContent(item.content);
        return {
          op_type: "upsert",
          path: item.path,
          content_b64: encoded.content_b64,
          content_encoding: encoded.content_encoding
        };
      }),
      ...delta.deletes.map((path) => ({
        op_type: "delete",
        path
      }))
    ];
    const pushRaw = await this.apiClient.pushChanges(spaceId, {
      client_id: clientId,
      idempotency_key: (0, import_node_crypto2.randomUUID)(),
      base_version: baseVersion,
      expected_head: nextExpectedHead,
      ops: operations
    });
    const push = pushRaw;
    return {
      pull,
      push,
      delta,
      rebasedBaseManifest,
      rebasedCurrentManifest,
      nextBaseVersion
    };
  }
};

// src/ui/sync-status-view.ts
var SyncStatusViewModel = class {
  constructor() {
    __publicField(this, "status", {
      state: "idle",
      message: "\u7B49\u5F85\u540C\u6B65",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  setSyncing() {
    this.status = {
      state: "syncing",
      message: "\u540C\u6B65\u8FDB\u884C\u4E2D",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      conflictSetId: void 0
    };
  }
  setSuccess(message = "\u540C\u6B65\u6210\u529F") {
    this.status = {
      state: "success",
      message,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      conflictSetId: void 0
    };
  }
  setError(message) {
    this.status = {
      state: "error",
      message,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      conflictSetId: void 0
    };
  }
  setConflict(conflictSetId, message) {
    this.status = {
      state: "conflict",
      message: message ?? (conflictSetId ? `\u5B58\u5728\u672A\u89E3\u51B3\u51B2\u7A81\uFF1A${conflictSetId}` : "\u5B58\u5728\u672A\u89E3\u51B3\u51B2\u7A81"),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      conflictSetId
    };
  }
  getStatus() {
    return this.status;
  }
};

// src/ui/conflict-notice.ts
function formatConflictNotice(path, conflictPath) {
  return {
    path,
    conflictPath,
    message: conflictPath ? `\u68C0\u6D4B\u5230\u51B2\u7A81\uFF1A${path}\uFF0C\u5DF2\u4FDD\u7559\u526F\u672C ${conflictPath}` : `\u68C0\u6D4B\u5230\u51B2\u7A81\uFF1A${path}\uFF0C\u8BF7\u624B\u52A8\u5904\u7406`
  };
}

// src/main.ts
function isConflictSetGoneError(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  return /(?:get conflict set failed|resolve failed):\s*(404|422)\b/.test(error.message);
}
var SelfHostedSyncPlugin = class {
  constructor(settingsStore = new SettingsStore(".obsidian-self-hosted-sync.json")) {
    __publicField(this, "settingsStore");
    __publicField(this, "statusView", new SyncStatusViewModel());
    this.settingsStore = settingsStore;
  }
  async runManualSyncWithVault(vaultPath) {
    const adapter = new FileSystemVaultAdapter(vaultPath);
    try {
      const currentManifest = await adapter.collectManifest();
      await this.runManualSync(currentManifest, {
        applyPulledChanges: (pull) => adapter.applyPulledChanges(pull),
        collectManifest: () => adapter.collectManifest()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      if (/\bpull failed:\s*401\b/.test(message) || /\bpush failed:\s*401\b/.test(message)) {
        this.statusView.setError("\u8BA4\u8BC1\u5DF2\u8FC7\u671F\uFF08401\uFF09\uFF0C\u8BF7\u5230\u63D2\u4EF6\u8BBE\u7F6E\u9875\u91CD\u65B0\u70B9\u51FB\u201C\u6CE8\u518C\u201D\u5E76\u4FDD\u5B58\u540E\u91CD\u8BD5");
        return;
      }
      this.statusView.setError(message);
    }
  }
  async runManualSync(currentManifest, hooks) {
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
        `\u5B58\u5728\u672A\u89E3\u51B3\u51B2\u7A81\uFF08${syncState.pendingConflict.conflictSetId}\uFF09\uFF0C\u8BF7\u5148\u5B8C\u6210\u51B2\u7A81\u5904\u7406`
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
          conflictSetId ? `\u540C\u6B65\u68C0\u6D4B\u5230\u51B2\u7A81\uFF08${conflictSetId}\uFF09\uFF0C\u5DF2\u4FDD\u7559\u672C\u5730\u5185\u5BB9\uFF0C\u8BF7\u5148\u5B8C\u6210\u51B2\u7A81\u5904\u7406` : "\u540C\u6B65\u68C0\u6D4B\u5230\u51B2\u7A81\uFF0C\u5DF2\u4FDD\u7559\u672C\u5730\u5185\u5BB9\uFF0C\u8BF7\u5148\u5B8C\u6210\u51B2\u7A81\u5904\u7406"
        );
        return;
      }
      if (hooks?.applyPulledChanges) {
        await hooks.applyPulledChanges(result.pull);
      }
      const persistedManifest = hooks?.collectManifest ? await hooks.collectManifest() : result.rebasedCurrentManifest;
      const nextHead = Number(result.push.new_head_version ?? result.pull.head_version ?? syncState.expectedHead);
      await this.settingsStore.save({
        ...settings,
        syncState: {
          baseVersion: nextHead,
          expectedHead: nextHead,
          baseManifest: persistedManifest,
          pendingConflict: void 0
        }
      });
      this.statusView.setSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      if (/\bpull failed:\s*401\b/.test(message) || /\bpush failed:\s*401\b/.test(message)) {
        this.statusView.setError("\u8BA4\u8BC1\u5DF2\u8FC7\u671F\uFF08401\uFF09\uFF0C\u8BF7\u5230\u63D2\u4EF6\u8BBE\u7F6E\u9875\u91CD\u65B0\u70B9\u51FB\u201C\u6CE8\u518C\u201D\u5E76\u4FDD\u5B58\u540E\u91CD\u8BD5");
        return;
      }
      this.statusView.setError(message);
    }
  }
  async getPendingConflictPreview() {
    const settings = await this.settingsStore.load();
    const pendingConflict = settings.syncState?.pendingConflict;
    if (!pendingConflict) {
      return null;
    }
    try {
      const apiClient = new SyncApiClient(settings.serverUrl, () => settings.accessToken);
      const conflictSet = await apiClient.getConflictSet(settings.spaceId, pendingConflict.conflictSetId);
      const byType = {};
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
            pendingConflict: void 0
          }
        });
        this.statusView.setError("\u5F85\u5904\u7406\u51B2\u7A81\u5728\u670D\u52A1\u7AEF\u5DF2\u5931\u6548\uFF0C\u5DF2\u6E05\u7406\u672C\u5730\u72B6\u6001\uFF0C\u8BF7\u91CD\u65B0\u540C\u6B65");
        return null;
      }
      throw error;
    }
  }
  async resolvePendingConflictByStrategyWithVault(vaultPath, strategy) {
    const adapter = new FileSystemVaultAdapter(vaultPath);
    await this.resolvePendingConflictByStrategy(strategy, {
      applyPulledChanges: (pull) => adapter.applyPulledChanges(pull),
      collectManifest: () => adapter.collectManifest()
    });
  }
  async resolvePendingConflictByStrategy(strategy, hooks) {
    const preview = await this.getPendingConflictPreview();
    if (!preview) {
      this.statusView.setError("\u6CA1\u6709\u5F85\u5904\u7406\u51B2\u7A81");
      return;
    }
    const resolutions = preview.items.map((item) => ({
      path: item.path,
      strategy
    }));
    await this.resolvePendingConflict(resolutions, hooks);
  }
  async resolvePendingConflictWithVault(vaultPath, resolutions) {
    const adapter = new FileSystemVaultAdapter(vaultPath);
    await this.resolvePendingConflict(resolutions, {
      applyPulledChanges: (pull) => adapter.applyPulledChanges(pull),
      collectManifest: () => adapter.collectManifest()
    });
  }
  async resolvePendingConflict(resolutions, hooks) {
    const settings = await this.settingsStore.load();
    const syncState = settings.syncState;
    const pendingConflict = syncState?.pendingConflict;
    if (!pendingConflict || !syncState) {
      this.statusView.setError("\u6CA1\u6709\u5F85\u5904\u7406\u51B2\u7A81");
      return;
    }
    if (!hooks?.applyPulledChanges || !hooks.collectManifest) {
      this.statusView.setError("\u7F3A\u5C11\u672C\u5730\u843D\u76D8\u9002\u914D\u5668\uFF0C\u65E0\u6CD5\u5B89\u5168\u5B8C\u6210\u51B2\u7A81\u89E3\u51B3");
      return;
    }
    this.statusView.setSyncing();
    let resolveHead = null;
    try {
      const apiClient = new SyncApiClient(settings.serverUrl, () => settings.accessToken);
      const resolveResult = await apiClient.resolveConflicts(settings.spaceId, pendingConflict.conflictSetId, {
        expected_head: pendingConflict.expectedHead,
        resolutions
      });
      resolveHead = Number(resolveResult.new_head_version ?? pendingConflict.expectedHead);
      const pullRaw = await apiClient.pullChanges(settings.spaceId, syncState.baseVersion);
      const pull = pullRaw;
      await hooks.applyPulledChanges(pull);
      const persistedManifest = await hooks.collectManifest();
      const nextHead = Number(resolveResult.new_head_version ?? pull.head_version ?? pendingConflict.expectedHead);
      await this.settingsStore.save({
        ...settings,
        syncState: {
          baseVersion: nextHead,
          expectedHead: nextHead,
          baseManifest: persistedManifest,
          pendingConflict: void 0
        }
      });
      this.statusView.setSuccess("\u51B2\u7A81\u5DF2\u89E3\u51B3\u5E76\u540C\u6B65\u5B8C\u6210");
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
            pendingConflict: void 0
          }
        });
        this.statusView.setError("\u51B2\u7A81\u96C6\u5728\u670D\u52A1\u7AEF\u5DF2\u5931\u6548\uFF0C\u5DF2\u6E05\u7406\u672C\u5730\u72B6\u6001\uFF0C\u8BF7\u91CD\u65B0\u540C\u6B65");
        return;
      }
      this.statusView.setError(error instanceof Error ? error.message : "unknown error");
    }
  }
  async clearPendingConflictAfterServerResolve(settings, syncState, resolveHead, error) {
    try {
      await this.settingsStore.save({
        ...settings,
        syncState: {
          ...syncState,
          expectedHead: resolveHead,
          pendingConflict: void 0
        }
      });
      const suffix = error instanceof Error ? `\uFF1A${error.message}` : "";
      this.statusView.setError(`\u670D\u52A1\u7AEF\u51B2\u7A81\u5DF2\u89E3\u51B3\uFF0C\u4F46\u672C\u5730\u66F4\u65B0\u672A\u5B8C\u6210\uFF0C\u8BF7\u91CD\u65B0\u540C\u6B65${suffix}`);
    } catch (saveError) {
      const saveSuffix = saveError instanceof Error ? `\uFF1B\u72B6\u6001\u4FDD\u5B58\u5931\u8D25\uFF1A${saveError.message}` : "";
      this.statusView.setError(`\u670D\u52A1\u7AEF\u51B2\u7A81\u5DF2\u89E3\u51B3\uFF0C\u4F46\u672C\u5730\u72B6\u6001\u6E05\u7406\u5931\u8D25${saveSuffix}`);
    }
  }
  getStatus() {
    return this.statusView.getStatus();
  }
};

// src/ui/settings-tab.ts
var SettingsTabModel = class {
  constructor(settingsStore) {
    this.settingsStore = settingsStore;
  }
  async saveSettings(payload) {
    const current = await this.settingsStore.load();
    const identityChanged = current.serverUrl !== payload.serverUrl || current.spaceId !== payload.spaceId || current.clientId !== payload.clientId;
    await this.settingsStore.save({
      ...current,
      ...payload,
      syncState: identityChanged ? void 0 : current.syncState
    });
  }
  async testConnection() {
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
};

// src/sync/register-client.ts
async function registerClientAndPersist(apiClient, settingsStore, payload) {
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
    syncState: void 0
  });
}

// src/obsidian-entry.ts
var DEFAULT_SETTINGS2 = {
  serverUrl: "",
  spaceId: "",
  clientId: "",
  accessToken: ""
};
function normalizeSettings(raw) {
  const next = typeof raw === "object" && raw !== null ? raw : {};
  return {
    ...DEFAULT_SETTINGS2,
    ...next
  };
}
var ObsidianSettingsStore = class {
  constructor(plugin) {
    this.plugin = plugin;
    __publicField(this, "saveChain", Promise.resolve());
  }
  async load() {
    return normalizeSettings(await this.plugin.loadData());
  }
  async save(next) {
    const run = this.saveChain.then(() => this.plugin.saveData(next));
    this.saveChain = run.then(() => void 0, () => void 0);
    await run;
  }
};
var ObsidianSyncSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin, settingsStore, syncCore, resolveVaultPath) {
    super(app, plugin);
    this.settingsStore = settingsStore;
    this.syncCore = syncCore;
    this.resolveVaultPath = resolveVaultPath;
    __publicField(this, "model");
    this.model = new SettingsTabModel(settingsStore);
  }
  display() {
    void this.render();
  }
  async render() {
    const container = this.containerEl;
    container.replaceChildren();
    const loaded = await this.settingsStore.load();
    let draft = { ...loaded };
    let registerDeviceId = loaded.clientId || `device-${Date.now()}`;
    let registerClientName = "Obsidian";
    new import_obsidian.Setting(container).setName("Server URL").setDesc("\u793A\u4F8B: http://127.0.0.1:8787").addText((text) => {
      text.setPlaceholder("http://127.0.0.1:8787").setValue(draft.serverUrl).onChange((value) => {
        draft.serverUrl = value.trim();
      });
    });
    new import_obsidian.Setting(container).setName("Space ID").setDesc("\u670D\u52A1\u7AEF\u7A7A\u95F4\u6807\u8BC6").addText((text) => {
      text.setPlaceholder("space-id").setValue(draft.spaceId).onChange((value) => {
        draft.spaceId = value.trim();
      });
    });
    new import_obsidian.Setting(container).setName("Access Token").setDesc("\u5BA2\u6237\u7AEF\u8BBF\u95EE\u4EE4\u724C").addText((text) => {
      text.setPlaceholder("token").setValue(draft.accessToken).onChange((value) => {
        draft.accessToken = value.trim();
      });
    });
    new import_obsidian.Setting(container).setName("Client ID").setDesc("\u5F53\u524D\u5BA2\u6237\u7AEF\u6807\u8BC6").addText((text) => {
      text.setPlaceholder("client-id").setValue(draft.clientId).onChange((value) => {
        draft.clientId = value.trim();
      });
    });
    new import_obsidian.Setting(container).setName("Register Device ID").setDesc("\u7528\u4E8E\u5411\u670D\u52A1\u7AEF\u6CE8\u518C\u5BA2\u6237\u7AEF").addText((text) => {
      text.setPlaceholder("device-id").setValue(registerDeviceId).onChange((value) => {
        registerDeviceId = value.trim();
      });
    });
    new import_obsidian.Setting(container).setName("Register Client Name").setDesc("\u5C55\u793A\u7ED9\u670D\u52A1\u7AEF\u7684\u5BA2\u6237\u7AEF\u540D\u79F0").addText((text) => {
      text.setPlaceholder("Obsidian").setValue(registerClientName).onChange((value) => {
        registerClientName = value.trim() || "Obsidian";
      });
    });
    new import_obsidian.Setting(container).setName("\u4FDD\u5B58\u914D\u7F6E").setDesc("\u4FDD\u5B58\u5F53\u524D\u8FDE\u63A5\u4E0E\u51ED\u636E").addButton((button) => {
      button.setButtonText("\u4FDD\u5B58").setCta().onClick(async () => {
        try {
          await this.model.saveSettings({
            serverUrl: draft.serverUrl,
            spaceId: draft.spaceId,
            accessToken: draft.accessToken,
            clientId: draft.clientId
          });
          new import_obsidian.Notice("\u914D\u7F6E\u5DF2\u4FDD\u5B58");
        } catch (error) {
          new import_obsidian.Notice(error instanceof Error ? error.message : "\u914D\u7F6E\u4FDD\u5B58\u5931\u8D25");
        }
      });
    }).addButton((button) => {
      button.setButtonText("\u6D4B\u8BD5\u8FDE\u63A5").onClick(async () => {
        try {
          await this.model.saveSettings({
            serverUrl: draft.serverUrl,
            spaceId: draft.spaceId,
            accessToken: draft.accessToken,
            clientId: draft.clientId
          });
          const ok = await this.model.testConnection();
          new import_obsidian.Notice(ok ? "\u8FDE\u63A5\u6210\u529F" : "\u8FDE\u63A5\u5931\u8D25");
        } catch (error) {
          new import_obsidian.Notice(error instanceof Error ? error.message : "\u8FDE\u63A5\u5931\u8D25");
        }
      });
    });
    new import_obsidian.Setting(container).setName("\u6CE8\u518C\u5BA2\u6237\u7AEF").setDesc("\u4ECE\u670D\u52A1\u7AEF\u83B7\u53D6 client_id \u4E0E access_token").addButton((button) => {
      button.setButtonText("\u6CE8\u518C").onClick(async () => {
        if (!draft.serverUrl || !draft.spaceId || !registerDeviceId) {
          new import_obsidian.Notice("\u8BF7\u5148\u586B\u5199 Server URL / Space ID / Register Device ID");
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
          new import_obsidian.Notice(`\u6CE8\u518C\u6210\u529F: ${refreshed.clientId}`);
          await this.render();
        } catch (error) {
          new import_obsidian.Notice(error instanceof Error ? error.message : "\u6CE8\u518C\u5931\u8D25");
        }
      });
    });
    await this.renderConflictSection(container);
  }
  async renderConflictSection(container) {
    const title = document.createElement("h3");
    title.textContent = "\u51B2\u7A81\u5904\u7406";
    container.appendChild(title);
    const helper = document.createElement("p");
    helper.textContent = "\u68C0\u6D4B\u5230\u51B2\u7A81\u540E\uFF0C\u53EF\u5728\u8FD9\u91CC\u67E5\u770B\u51B2\u7A81\u9879\u5E76\u9009\u62E9\u4FDD\u7559\u672C\u5730\uFF08ours\uFF09\u6216\u670D\u52A1\u7AEF\uFF08theirs\uFF09\u3002";
    container.appendChild(helper);
    const preview = await this.syncCore.getPendingConflictPreview();
    if (!preview) {
      const empty = document.createElement("p");
      empty.textContent = "\u5F53\u524D\u6CA1\u6709\u5F85\u5904\u7406\u51B2\u7A81\u3002";
      container.appendChild(empty);
      return;
    }
    const summary = document.createElement("p");
    const typeSummary = Object.entries(preview.summary.byType).map(([type, count]) => `${type}:${count}`).join(", ");
    summary.textContent = `\u51B2\u7A81\u96C6 ${preview.conflictSetId}\uFF0C\u5171 ${preview.summary.total} \u9879${typeSummary ? `\uFF08${typeSummary}\uFF09` : ""}`;
    container.appendChild(summary);
    const list = document.createElement("div");
    const drafts = /* @__PURE__ */ new Map();
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
      ours.text = "\u4FDD\u7559\u672C\u5730";
      const theirs = document.createElement("option");
      theirs.value = "theirs";
      theirs.text = "\u4FDD\u7559\u670D\u52A1\u7AEF";
      const manual = document.createElement("option");
      manual.value = "manual";
      manual.text = "\u624B\u52A8\u7F16\u8F91";
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
      deleteWrap.append(" \u624B\u52A8\u89E3\u51B3\u4E3A\u5220\u9664\u8BE5\u6587\u4EF6");
      if (!manualEditable) {
        const hint = document.createElement("div");
        hint.textContent = "\u8BE5\u51B2\u7A81\u6D89\u53CA\u4E8C\u8FDB\u5236\u5185\u5BB9\uFF0C\u6682\u4E0D\u652F\u6301\u624B\u52A8\u7F16\u8F91\uFF0C\u8BF7\u4F7F\u7528\u4FDD\u7559\u672C\u5730/\u670D\u52A1\u7AEF\u3002";
        hint.style.opacity = "0.8";
        manualWrap.appendChild(hint);
      } else {
        manualWrap.appendChild(deleteWrap);
        manualWrap.appendChild(manualText);
      }
      select.onchange = () => {
        const draft = drafts.get(item.path);
        if (draft) {
          draft.strategy = select.value === "theirs" ? "theirs" : select.value === "manual" ? "manual" : "ours";
        }
        manualWrap.style.display = select.value === "manual" ? "block" : "none";
      };
      row.appendChild(select);
      list.appendChild(row);
      list.appendChild(manualWrap);
    }
    container.appendChild(list);
    new import_obsidian.Setting(container).setName("\u5FEB\u901F\u5904\u7406").setDesc("\u4E00\u952E\u6309\u7EDF\u4E00\u7B56\u7565\u89E3\u51B3\u5168\u90E8\u51B2\u7A81").addButton((button) => {
      button.setButtonText("\u5168\u90E8\u4FDD\u7559\u672C\u5730").onClick(async () => {
        await this.resolveAllConflicts("ours");
      });
    }).addButton((button) => {
      button.setButtonText("\u5168\u90E8\u4FDD\u7559\u670D\u52A1\u7AEF").onClick(async () => {
        await this.resolveAllConflicts("theirs");
      });
    }).addButton((button) => {
      button.setButtonText("\u5237\u65B0\u51B2\u7A81").onClick(async () => {
        await this.render();
      });
    });
    new import_obsidian.Setting(container).setName("\u9010\u6761\u5904\u7406").setDesc("\u6309\u4E0A\u65B9\u6BCF\u4E00\u6761\u9009\u62E9\u7684\u7B56\u7565\u63D0\u4EA4\u51B2\u7A81\u89E3\u51B3").addButton((button) => {
      button.setButtonText("\u63D0\u4EA4\u9010\u6761\u89E3\u51B3").setCta().onClick(async () => {
        const vaultPath = this.resolveVaultPath();
        if (!vaultPath) {
          new import_obsidian.Notice("\u5F53\u524D Vault \u9002\u914D\u5668\u4E0D\u652F\u6301\u672C\u5730\u6587\u4EF6\u8DEF\u5F84\uFF0C\u4EC5\u684C\u9762\u6A21\u5F0F\u53EF\u7528");
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
                strategy: "manual",
                delete: true
              };
            }
            return {
              path: item.path,
              strategy: "manual",
              content_b64: Buffer.from(draft.manualContent, "utf8").toString("base64"),
              content_encoding: "utf8"
            };
          });
          await this.syncCore.resolvePendingConflictWithVault(vaultPath, resolutions);
          new import_obsidian.Notice(this.syncCore.getStatus().message);
          await this.render();
        } catch (error) {
          new import_obsidian.Notice(error instanceof Error ? error.message : "\u51B2\u7A81\u89E3\u51B3\u5931\u8D25");
        }
      });
    });
  }
  async resolveAllConflicts(strategy) {
    const vaultPath = this.resolveVaultPath();
    if (!vaultPath) {
      new import_obsidian.Notice("\u5F53\u524D Vault \u9002\u914D\u5668\u4E0D\u652F\u6301\u672C\u5730\u6587\u4EF6\u8DEF\u5F84\uFF0C\u4EC5\u684C\u9762\u6A21\u5F0F\u53EF\u7528");
      return;
    }
    try {
      await this.syncCore.resolvePendingConflictByStrategyWithVault(vaultPath, strategy);
      new import_obsidian.Notice(this.syncCore.getStatus().message);
      await this.render();
    } catch (error) {
      new import_obsidian.Notice(error instanceof Error ? error.message : "\u51B2\u7A81\u89E3\u51B3\u5931\u8D25");
    }
  }
};
var SelfHostedSyncObsidianPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settingsStore");
    __publicField(this, "syncCore");
  }
  async onload() {
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
          new import_obsidian.Notice("\u5F53\u524D\u6CA1\u6709\u5F85\u5904\u7406\u51B2\u7A81");
          return;
        }
        const typeSummary = Object.entries(preview.summary.byType).map(([type, count]) => `${type}:${count}`).join(", ");
        new import_obsidian.Notice(
          `\u51B2\u7A81\u96C6 ${preview.conflictSetId}\uFF0C\u5171 ${preview.summary.total} \u9879${typeSummary ? ` (${typeSummary})` : ""}`
        );
      }
    });
    this.addCommand({
      id: "self-hosted-sync-resolve-ours",
      name: "Self Hosted Sync: Resolve all conflicts (ours)",
      callback: async () => {
        const vaultPath = this.getVaultPath();
        if (!vaultPath) {
          new import_obsidian.Notice("\u5F53\u524D Vault \u9002\u914D\u5668\u4E0D\u652F\u6301\u672C\u5730\u6587\u4EF6\u8DEF\u5F84\uFF0C\u4EC5\u684C\u9762\u6A21\u5F0F\u53EF\u7528");
          return;
        }
        await this.syncCore.resolvePendingConflictByStrategyWithVault(vaultPath, "ours");
        new import_obsidian.Notice(this.syncCore.getStatus().message);
      }
    });
    this.addCommand({
      id: "self-hosted-sync-resolve-theirs",
      name: "Self Hosted Sync: Resolve all conflicts (theirs)",
      callback: async () => {
        const vaultPath = this.getVaultPath();
        if (!vaultPath) {
          new import_obsidian.Notice("\u5F53\u524D Vault \u9002\u914D\u5668\u4E0D\u652F\u6301\u672C\u5730\u6587\u4EF6\u8DEF\u5F84\uFF0C\u4EC5\u684C\u9762\u6A21\u5F0F\u53EF\u7528");
          return;
        }
        await this.syncCore.resolvePendingConflictByStrategyWithVault(vaultPath, "theirs");
        new import_obsidian.Notice(this.syncCore.getStatus().message);
      }
    });
  }
  getVaultPath() {
    const adapter = this.app.vault.adapter;
    if (typeof adapter.getBasePath !== "function") {
      return null;
    }
    return adapter.getBasePath();
  }
  async runManualSyncFromVault() {
    const vaultPath = this.getVaultPath();
    if (!vaultPath) {
      new import_obsidian.Notice("\u5F53\u524D Vault \u9002\u914D\u5668\u4E0D\u652F\u6301\u672C\u5730\u6587\u4EF6\u8DEF\u5F84\uFF0C\u4EC5\u684C\u9762\u6A21\u5F0F\u53EF\u7528");
      return;
    }
    await this.syncCore.runManualSyncWithVault(vaultPath);
    new import_obsidian.Notice(this.syncCore.getStatus().message);
  }
};
