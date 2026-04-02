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

export interface PullResult {
  head_version: number;
  changes: ChangeLog[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface IdempotentResult {
  newHeadVersion: number;
  mergeResult: MergeResultType;
  conflictSetId?: string;
}

export interface SyncRepository {
  registerClient(spaceId: string, clientId?: string): Promise<string>;
  getHeadVersion(spaceId: string): Promise<number>;
  getSnapshot(spaceId: string, version: number): Promise<Record<string, string> | null>;
  saveCommit(
    spaceId: string,
    authorClientId: string,
    snapshot: Record<string, string>,
    ops: ChangeOperation[],
    mergeMode: MergeResultType,
    idempotencyKey?: string,
    conflictSetId?: string
  ): Promise<CommitResult>;
  pullChanges(spaceId: string, fromVersion: number, limit?: number, cursor?: string): Promise<PullResult>;
  saveConflictSet(spaceId: string, payload: Omit<ConflictSet, "conflict_set_id" | "status">): Promise<ConflictSet>;
  getConflictSet(spaceId: string, conflictSetId: string): Promise<ConflictSet | null>;
  resolveConflictSet(spaceId: string, conflictSetId: string): Promise<void>;
  getIdempotentResult(spaceId: string, key: string): Promise<IdempotentResult | undefined>;
}

export interface SyncRepositoryTx extends SyncRepository {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface TxCapableSyncRepository extends SyncRepository {
  withTransaction<T>(work: (tx: SyncRepositoryTx) => Promise<T>): Promise<T>;
}
