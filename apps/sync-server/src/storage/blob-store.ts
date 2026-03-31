export interface BlobStore {
  put(content: Buffer): Promise<string>;
  get(key: string): Promise<Buffer | null>;
}
