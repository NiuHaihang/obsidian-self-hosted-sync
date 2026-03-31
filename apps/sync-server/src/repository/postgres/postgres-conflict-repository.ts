import type { ConflictSet } from "../sync-repository.interface.js";
import { PostgresSyncRepository } from "./postgres-sync-repository.js";

export class PostgresConflictRepository {
  constructor(private readonly repository: PostgresSyncRepository) {}

  save(spaceId: string, payload: Omit<ConflictSet, "conflict_set_id" | "status">): ConflictSet {
    return this.repository.saveConflictSet(spaceId, payload);
  }

  get(spaceId: string, conflictSetId: string): ConflictSet | null {
    return this.repository.getConflictSet(spaceId, conflictSetId);
  }

  resolve(spaceId: string, conflictSetId: string): void {
    this.repository.resolveConflictSet(spaceId, conflictSetId);
  }
}
