import { randomUUID } from "node:crypto";
import type { MergeConflictItem, MergeResultType } from "../merge/three-way-merge.js";

export type OperationType = "upsert" | "delete" | "rename";
export type ContentEncoding = "utf8" | "binary_base64";

export interface ChangeOperation {
  op_type: OperationType;
  path: string;
  new_path?: string;
  content_b64?: string;
  content_encoding?: ContentEncoding;
  blob_ref?: string;
  content_hash?: string;
}

export interface ChangeLog {
  version: number;
  author_client_id: string;
  ts: string;
  ops: ChangeOperation[];
}

export interface ConflictSet {
  conflict_set_id: string;
  status: "open" | "resolved";
  base_version: number;
  head_version: number;
  items: MergeConflictItem[];
}

export interface CommitResult {
  version: number;
  mergeMode: MergeResultType;
}

interface SpaceState {
  headVersion: number;
  snapshots: Map<number, Record<string, string>>;
  changes: ChangeLog[];
  conflictSets: Map<string, ConflictSet>;
  idempotency: Map<string, { newHeadVersion: number; mergeResult: MergeResultType; conflictSetId?: string }>;
  clients: Set<string>;
}

export interface PullResult {
  head_version: number;
  changes: ChangeLog[];
  next_cursor: string | null;
  has_more: boolean;
}

export class InMemorySyncRepository {
  private readonly spaces = new Map<string, SpaceState>();
  private txChain: Promise<void> = Promise.resolve();

  private ensureSpace(spaceId: string): SpaceState {
    const existing = this.spaces.get(spaceId);
    if (existing) {
      return existing;
    }

    const created: SpaceState = {
      headVersion: 0,
      snapshots: new Map([[0, {}]]),
      changes: [],
      conflictSets: new Map(),
      idempotency: new Map(),
      clients: new Set()
    };

    this.spaces.set(spaceId, created);
    return created;
  }

  async registerClient(spaceId: string, clientId?: string): Promise<string> {
    const state = this.ensureSpace(spaceId);
    const resolved = clientId ?? randomUUID();
    state.clients.add(resolved);
    return resolved;
  }

  async getHeadVersion(spaceId: string): Promise<number> {
    return this.ensureSpace(spaceId).headVersion;
  }

  async getSnapshot(spaceId: string, version: number): Promise<Record<string, string> | null> {
    const snapshot = this.ensureSpace(spaceId).snapshots.get(version);
    return snapshot ? { ...snapshot } : null;
  }

  async saveCommit(
    spaceId: string,
    authorClientId: string,
    snapshot: Record<string, string>,
    ops: ChangeOperation[],
    mergeMode: MergeResultType,
    idempotencyKey?: string,
    conflictSetId?: string
  ): Promise<CommitResult> {
    const state = this.ensureSpace(spaceId);
    const nextVersion = state.headVersion + 1;
    state.headVersion = nextVersion;
    state.snapshots.set(nextVersion, { ...snapshot });
    state.changes.push({
      version: nextVersion,
      author_client_id: authorClientId,
      ts: new Date().toISOString(),
      ops
    });

    if (idempotencyKey) {
      state.idempotency.set(idempotencyKey, {
        newHeadVersion: nextVersion,
        mergeResult: mergeMode,
        conflictSetId
      });
    }

    return { version: nextVersion, mergeMode };
  }

  async pullChanges(spaceId: string, fromVersion: number, limit = 200, cursor?: string): Promise<PullResult> {
    const state = this.ensureSpace(spaceId);
    const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    const candidates = state.changes.filter((change) => change.version > fromVersion);
    const page = candidates.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return {
      head_version: state.headVersion,
      changes: page,
      next_cursor: nextOffset < candidates.length ? String(nextOffset) : null,
      has_more: nextOffset < candidates.length
    };
  }

  async saveConflictSet(spaceId: string, payload: Omit<ConflictSet, "conflict_set_id" | "status">): Promise<ConflictSet> {
    const state = this.ensureSpace(spaceId);
    const conflictSet: ConflictSet = {
      conflict_set_id: randomUUID(),
      status: "open",
      ...payload
    };
    state.conflictSets.set(conflictSet.conflict_set_id, conflictSet);
    return conflictSet;
  }

  async getConflictSet(spaceId: string, conflictSetId: string): Promise<ConflictSet | null> {
    const state = this.ensureSpace(spaceId);
    const set = state.conflictSets.get(conflictSetId);
    return set ? { ...set, items: [...set.items] } : null;
  }

  async resolveConflictSet(spaceId: string, conflictSetId: string): Promise<void> {
    const state = this.ensureSpace(spaceId);
    const set = state.conflictSets.get(conflictSetId);
    if (!set) {
      return;
    }

    set.status = "resolved";
    state.conflictSets.set(conflictSetId, set);
  }

  async getIdempotentResult(spaceId: string, key: string): Promise<
    | { newHeadVersion: number; mergeResult: MergeResultType; conflictSetId?: string }
    | undefined
  > {
    return this.ensureSpace(spaceId).idempotency.get(key);
  }

  async withTransaction<T>(work: (tx: InMemorySyncRepository) => Promise<T>): Promise<T> {
    const run = this.txChain.then(() => work(this));
    this.txChain = run.then(() => undefined, () => undefined);
    return run;
  }

  async commit(): Promise<void> {
    return;
  }

  async rollback(): Promise<void> {
    return;
  }
}
