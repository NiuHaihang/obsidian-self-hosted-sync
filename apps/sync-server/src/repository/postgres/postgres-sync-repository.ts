import { InMemorySyncRepository } from "../sync-repository.js";
import type {
  ChangeOperation,
  CommitResult,
  ConflictSet,
  IdempotentResult,
  PullResult,
  SyncRepositoryTx,
  TxCapableSyncRepository
} from "../sync-repository.interface.js";
import type { MergeResultType } from "../../merge/three-way-merge.js";

class MemoryTxRepository extends InMemorySyncRepository implements SyncRepositoryTx {
  async commit(): Promise<void> {
    return;
  }

  async rollback(): Promise<void> {
    return;
  }
}

export class PostgresSyncRepository implements TxCapableSyncRepository {
  private static readonly shared = new MemoryTxRepository();

  constructor(private readonly fallback = PostgresSyncRepository.shared) {}

  registerClient(spaceId: string, clientId?: string): string {
    return this.fallback.registerClient(spaceId, clientId);
  }

  getHeadVersion(spaceId: string): number {
    return this.fallback.getHeadVersion(spaceId);
  }

  getSnapshot(spaceId: string, version: number): Record<string, string> | null {
    return this.fallback.getSnapshot(spaceId, version);
  }

  saveCommit(
    spaceId: string,
    authorClientId: string,
    snapshot: Record<string, string>,
    ops: ChangeOperation[],
    mergeMode: MergeResultType,
    idempotencyKey?: string,
    conflictSetId?: string
  ): CommitResult {
    return this.fallback.saveCommit(
      spaceId,
      authorClientId,
      snapshot,
      ops,
      mergeMode,
      idempotencyKey,
      conflictSetId
    );
  }

  pullChanges(spaceId: string, fromVersion: number, limit = 200, cursor?: string): PullResult {
    return this.fallback.pullChanges(spaceId, fromVersion, limit, cursor);
  }

  saveConflictSet(spaceId: string, payload: Omit<ConflictSet, "conflict_set_id" | "status">): ConflictSet {
    return this.fallback.saveConflictSet(spaceId, payload);
  }

  getConflictSet(spaceId: string, conflictSetId: string): ConflictSet | null {
    return this.fallback.getConflictSet(spaceId, conflictSetId);
  }

  resolveConflictSet(spaceId: string, conflictSetId: string): void {
    this.fallback.resolveConflictSet(spaceId, conflictSetId);
  }

  getIdempotentResult(spaceId: string, key: string): IdempotentResult | undefined {
    return this.fallback.getIdempotentResult(spaceId, key);
  }

  async withTransaction<T>(work: (tx: SyncRepositoryTx) => Promise<T>): Promise<T> {
    return work(this.fallback);
  }
}
