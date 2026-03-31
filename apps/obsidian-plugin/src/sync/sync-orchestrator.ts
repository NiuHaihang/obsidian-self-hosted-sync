import { createHash, randomUUID } from "node:crypto";
import type { ChangeOperation } from "../../../sync-server/src/repository/sync-repository.js";
import { SyncApiClient } from "./sync-api-client.js";
import { decodeTransportContent, encodeManifestContent, type ContentEncoding } from "./content-encoding.js";

export interface FileManifest {
  path: string;
  hash: string;
  content: string;
}

export interface ManifestDelta {
  upserts: FileManifest[];
  deletes: string[];
}

export interface PullOperation {
  op_type: "upsert" | "delete" | "rename";
  path: string;
  new_path?: string;
  content_b64?: string;
  content_encoding?: ContentEncoding;
}

export interface PullChange {
  ops?: PullOperation[];
}

export interface PullResponse {
  head_version?: number;
  changes?: PullChange[];
}

export interface PushResponse {
  new_head_version?: number;
  merge_result?: "fast_forward" | "merged" | "conflict";
  conflict_set_id?: string;
}

export function calculateManifestDelta(base: FileManifest[], current: FileManifest[]): ManifestDelta {
  const baseMap = new Map(base.map((file) => [file.path, file]));
  const currentMap = new Map(current.map((file) => [file.path, file]));

  const upserts: FileManifest[] = [];
  const deletes: string[] = [];

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

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function applyPulledChanges(baseManifest: FileManifest[], pull: PullResponse): FileManifest[] {
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
        const content = op.content_b64
          ? decodeTransportContent(op.content_b64, op.content_encoding)
          : (existing?.content ?? "");
        next.set(op.path, {
          path: op.path,
          content,
          hash: hashContent(content)
        });
      }
    }
  }

  return [...next.values()];
}

export class SyncOrchestrator {
  constructor(private readonly apiClient: SyncApiClient) {}

  async sync(
    spaceId: string,
    clientId: string,
    baseVersion: number,
    expectedHead: number,
    baseManifest: FileManifest[],
    currentManifest: FileManifest[]
  ): Promise<{
    pull: PullResponse;
    push: PushResponse;
    delta: ManifestDelta;
    rebasedBaseManifest: FileManifest[];
    rebasedCurrentManifest: FileManifest[];
    nextBaseVersion: number;
  }> {
    const pullRaw = await this.apiClient.pullChanges(spaceId, baseVersion);
    const pull = pullRaw as PullResponse;

    const rebasedBaseManifest = applyPulledChanges(baseManifest, pull);
    const rebasedCurrentManifest = [...currentManifest];
    const nextBaseVersion = Number(pull.head_version ?? baseVersion);
    const nextExpectedHead = Number(pull.head_version ?? expectedHead);

    const delta = calculateManifestDelta(baseManifest, currentManifest);
    const operations: ChangeOperation[] = [
      ...delta.upserts.map((item) => {
        const encoded = encodeManifestContent(item.content);
        return {
          op_type: "upsert" as const,
          path: item.path,
          content_b64: encoded.content_b64,
          content_encoding: encoded.content_encoding
        };
      }),
      ...delta.deletes.map((path) => ({
        op_type: "delete" as const,
        path
      }))
    ];

    const pushRaw = await this.apiClient.pushChanges(spaceId, {
      client_id: clientId,
      idempotency_key: randomUUID(),
      base_version: baseVersion,
      expected_head: nextExpectedHead,
      ops: operations
    });
    const push = pushRaw as PushResponse;

    return {
      pull,
      push,
      delta,
      rebasedBaseManifest,
      rebasedCurrentManifest,
      nextBaseVersion
    };
  }
}
