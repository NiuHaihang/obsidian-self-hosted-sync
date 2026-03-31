import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BlobStore } from "./blob-store.js";

export class LocalBlobStore implements BlobStore {
  constructor(private readonly baseDir: string) {}

  async put(content: Buffer): Promise<string> {
    const hash = createHash("sha256").update(content).digest("hex");
    const key = `${hash}-${randomUUID()}`;
    const filePath = join(this.baseDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    return key;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const filePath = join(this.baseDir, key);
      return await readFile(filePath);
    } catch {
      return null;
    }
  }
}
