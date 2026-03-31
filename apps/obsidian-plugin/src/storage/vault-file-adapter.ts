import { createHash } from "node:crypto";
import { dirname, posix, relative, resolve, sep } from "node:path";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import type { FileManifest, PullOperation, PullResponse } from "../sync/sync-orchestrator.js";
import { BINARY_MARKER_PREFIX, decodeTransportContent } from "../sync/content-encoding.js";

const SETTINGS_FILE_NAME = ".obsidian-self-hosted-sync.json";
const BINARY_EXTENSIONS = new Set([
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

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeRelativePath(input: string): string {
  if (!input) {
    throw new Error("invalid path");
  }

  const path = input.trim().replace(/\\/g, "/");
  if (!path || path.startsWith("/")) {
    throw new Error(`unsafe path: ${input}`);
  }

  const normalized = posix.normalize(path.replace(/^\.\//, ""));
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`unsafe path: ${input}`);
  }

  return normalized;
}

function isBinaryPath(relativePath: string): boolean {
  const normalized = relativePath.toLowerCase();
  const slash = normalized.lastIndexOf("/");
  const dot = normalized.lastIndexOf(".");
  if (dot <= slash) {
    return false;
  }

  return BINARY_EXTENSIONS.has(normalized.slice(dot));
}

function encodeBinaryContent(content: Buffer): string {
  return `${BINARY_MARKER_PREFIX}${content.toString("base64")}`;
}

function decodeBinaryContent(content: string): Buffer {
  return Buffer.from(content.slice(BINARY_MARKER_PREFIX.length), "base64");
}

export class FileSystemVaultAdapter {
  private readonly vaultRootAbs: string;
  private readonly vaultRootComparable: string;

  constructor(vaultRoot: string) {
    this.vaultRootAbs = resolve(vaultRoot);
    this.vaultRootComparable = this.toComparablePath(this.vaultRootAbs);
  }

  private toComparablePath(path: string): string {
    const resolved = resolve(path);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  }

  private isWithinVault(absolutePath: string): boolean {
    const rel = relative(this.vaultRootComparable, this.toComparablePath(absolutePath));
    return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`));
  }

  private resolveVaultPath(relativePath: string): string {
    const normalized = normalizeRelativePath(relativePath);
    const absolute = resolve(this.vaultRootAbs, ...normalized.split("/"));
    if (!this.isWithinVault(absolute)) {
      throw new Error(`unsafe path: ${relativePath}`);
    }
    return absolute;
  }

  private async walkDirectory(absoluteDir: string, relativeDir: string, output: FileManifest[]): Promise<void> {
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
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

      const content = isBinaryPath(relativePath)
        ? encodeBinaryContent(await readFile(absolutePath))
        : await readFile(absolutePath, "utf8");
      output.push({
        path: relativePath,
        content,
        hash: hashContent(content)
      });
    }
  }

  async collectManifest(): Promise<FileManifest[]> {
    const files: FileManifest[] = [];
    await this.walkDirectory(this.vaultRootAbs, "", files);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return files;
  }

  private async exists(absolutePath: string): Promise<boolean> {
    try {
      await stat(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  private async pruneEmptyDirectories(fromAbsoluteDir: string): Promise<void> {
    let current = resolve(fromAbsoluteDir);
    if (!this.isWithinVault(current)) {
      return;
    }

    while (this.isWithinVault(current) && current !== this.vaultRootAbs) {
      try {
        const entries = await readdir(current);
        if (entries.length > 0) {
          return;
        }

        await rm(current, { recursive: true, force: true });
      } catch {
        return;
      }

      const parent = dirname(current);
      if (parent === current) {
        return;
      }
      current = parent;
    }
  }

  private async applyOperation(op: PullOperation): Promise<void> {
    if (op.op_type === "delete") {
      const absolutePath = this.resolveVaultPath(op.path);
      await rm(absolutePath, { force: true });
      await this.pruneEmptyDirectories(dirname(absolutePath));
      return;
    }

    if (op.op_type === "rename" && op.new_path) {
      const sourcePath = this.resolveVaultPath(op.path);
      const targetPath = this.resolveVaultPath(op.new_path);
      if (!(await this.exists(sourcePath))) {
        return;
      }

      await mkdir(dirname(targetPath), { recursive: true });
      await rename(sourcePath, targetPath);
      await this.pruneEmptyDirectories(dirname(sourcePath));
      return;
    }

    if (op.op_type === "upsert") {
      const absolutePath = this.resolveVaultPath(op.path);
      await mkdir(dirname(absolutePath), { recursive: true });

      const content = decodeTransportContent(op.content_b64, op.content_encoding);
      if (content.startsWith(BINARY_MARKER_PREFIX)) {
        await writeFile(absolutePath, decodeBinaryContent(content));
        return;
      }

      await writeFile(absolutePath, content, "utf8");
    }
  }

  async applyPulledChanges(pull: PullResponse): Promise<void> {
    const changes = Array.isArray(pull.changes) ? pull.changes : [];
    for (const change of changes) {
      const ops = Array.isArray(change.ops) ? change.ops : [];
      for (const op of ops) {
        await this.applyOperation(op);
      }
    }
  }
}
