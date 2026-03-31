import type { IdempotentResult } from "../sync-repository.interface.js";
import { PostgresSyncRepository } from "./postgres-sync-repository.js";

export class PostgresIdempotencyRepository {
  constructor(private readonly repository: PostgresSyncRepository) {}

  get(spaceId: string, key: string): IdempotentResult | undefined {
    return this.repository.getIdempotentResult(spaceId, key);
  }
}
