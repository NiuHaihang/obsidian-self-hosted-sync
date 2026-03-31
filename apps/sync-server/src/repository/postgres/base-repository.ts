import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { mapPgError } from "./error-mapper.js";

export type Queryable = Pool | PoolClient;

export abstract class PgBaseRepository {
  constructor(protected readonly db: Queryable) {}

  protected async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    try {
      return await this.db.query<T>(sql, params);
    } catch (error) {
      throw mapPgError(error);
    }
  }

  protected async oneOrNull<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | null> {
    const result = await this.query<T>(sql, params);
    return result.rows[0] ?? null;
  }
}
