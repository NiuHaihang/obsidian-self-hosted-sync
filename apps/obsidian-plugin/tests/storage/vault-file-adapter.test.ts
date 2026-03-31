import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileSystemVaultAdapter } from "../../src/storage/vault-file-adapter.js";

const BINARY_MARKER_PREFIX = "__SHS_BINARY_B64__:";

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

describe("file system vault adapter", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("collects manifest with stable relative paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "vault-adapter-"));
    tempDirs.push(root);

    await writeTextFile(join(root, "b.md"), "B");
    await writeTextFile(join(root, "notes", "a.md"), "A");
    await writeTextFile(join(root, ".obsidian-self-hosted-sync.json"), "{}");

    const adapter = new FileSystemVaultAdapter(root);
    const manifest = await adapter.collectManifest();

    expect(manifest.map((item) => item.path)).toEqual(["b.md", "notes/a.md"]);
    expect(manifest.map((item) => item.content)).toEqual(["B", "A"]);
    expect(manifest.every((item) => item.hash.length === 64)).toBe(true);
  });

  it("encodes binary attachments during manifest collection", async () => {
    const root = await mkdtemp(join(tmpdir(), "vault-adapter-"));
    tempDirs.push(root);

    await writeTextFile(join(root, "note.md"), "note");
    await writeFile(join(root, "image.png"), Buffer.from([0xff, 0xd8, 0xff]));

    const adapter = new FileSystemVaultAdapter(root);
    const manifest = await adapter.collectManifest();

    expect(manifest.map((item) => item.path)).toEqual(["image.png", "note.md"]);
    const image = manifest.find((item) => item.path === "image.png");
    expect(image?.content.startsWith(BINARY_MARKER_PREFIX)).toBe(true);
  });

  it("applies upsert delete and rename operations from pull", async () => {
    const root = await mkdtemp(join(tmpdir(), "vault-adapter-"));
    tempDirs.push(root);

    await writeTextFile(join(root, "a.md"), "A");
    await writeTextFile(join(root, "folder", "old.md"), "OLD");

    const adapter = new FileSystemVaultAdapter(root);
    await adapter.applyPulledChanges({
      changes: [
        {
          ops: [
            { op_type: "upsert", path: "remote.md", content_b64: "cmVtb3Rl" },
            { op_type: "rename", path: "folder/old.md", new_path: "renamed/new.md" },
            { op_type: "delete", path: "a.md" }
          ]
        }
      ]
    });

    const manifest = await adapter.collectManifest();
    expect(manifest.map((item) => item.path)).toEqual(["remote.md", "renamed/new.md"]);
    expect(await readFile(join(root, "remote.md"), "utf8")).toBe("remote");
    expect(await readFile(join(root, "renamed", "new.md"), "utf8")).toBe("OLD");
  });

  it("rejects path traversal in pulled operations", async () => {
    const root = await mkdtemp(join(tmpdir(), "vault-adapter-"));
    tempDirs.push(root);

    const adapter = new FileSystemVaultAdapter(root);
    await expect(
      adapter.applyPulledChanges({
        changes: [{ ops: [{ op_type: "upsert", path: "../escape.md", content_b64: "ZXNjYXBl" }] }]
      })
    ).rejects.toThrow("unsafe path");

    await expect(access(resolve(root, "..", "escape.md"))).rejects.toBeTruthy();
  });

  it("handles missing delete path without failing and keeps vault root", async () => {
    const root = await mkdtemp(join(tmpdir(), "vault-adapter-"));
    tempDirs.push(root);

    const adapter = new FileSystemVaultAdapter(root);
    await expect(
      adapter.applyPulledChanges({
        changes: [{ ops: [{ op_type: "delete", path: "missing/path.md" }] }]
      })
    ).resolves.toBeUndefined();

    await expect(access(root)).resolves.toBeUndefined();
  });

  it("writes binary upsert operations from encoded payload", async () => {
    const root = await mkdtemp(join(tmpdir(), "vault-adapter-"));
    tempDirs.push(root);

    const adapter = new FileSystemVaultAdapter(root);
    await adapter.applyPulledChanges({
      changes: [{
        ops: [{
          op_type: "upsert",
          path: "photo.jpg",
          content_b64: "AAEC",
          content_encoding: "binary_base64"
        }]
      }]
    });

    const photo = await readFile(join(root, "photo.jpg"));
    expect(photo.equals(Buffer.from([0x00, 0x01, 0x02]))).toBe(true);
  });
});
