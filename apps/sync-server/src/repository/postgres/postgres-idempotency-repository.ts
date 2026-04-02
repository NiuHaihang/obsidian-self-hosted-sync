import type { IdempotentResult } from "../sync-repository.interface.js";
import { PostgresSyncRepository } from "./postgres-sync-repository.js";

export class PostgresIdempotencyRepository {
  constructor(private readonly repository: PostgresSyncRepository) {}

  async get(spaceId: string, key: string): Promise<IdempotentResult | undefined> {
    return this.repository.getIdempotentResult(spaceId, key);
  }
}
