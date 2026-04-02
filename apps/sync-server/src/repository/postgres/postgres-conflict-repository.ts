import type { ConflictSet } from "../sync-repository.interface.js";
import { PostgresSyncRepository } from "./postgres-sync-repository.js";

export class PostgresConflictRepository {
  constructor(private readonly repository: PostgresSyncRepository) {}

  async save(spaceId: string, payload: Omit<ConflictSet, "conflict_set_id" | "status">): Promise<ConflictSet> {
    return this.repository.saveConflictSet(spaceId, payload);
  }

  async get(spaceId: string, conflictSetId: string): Promise<ConflictSet | null> {
    return this.repository.getConflictSet(spaceId, conflictSetId);
  }

  async resolve(spaceId: string, conflictSetId: string): Promise<void> {
    await this.repository.resolveConflictSet(spaceId, conflictSetId);
  }
}
