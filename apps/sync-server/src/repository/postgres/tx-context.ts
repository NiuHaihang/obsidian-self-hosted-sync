import type { Pool, PoolClient } from "pg";

export class PgTxContext {
  private client: PoolClient | null = null;

  constructor(private readonly pool: Pool) {}

  async begin(): Promise<PoolClient> {
    if (this.client) {
      return this.client;
    }

    this.client = await this.pool.connect();
    await this.client.query("begin");
    return this.client;
  }

  async commit(): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.query("commit");
    this.client.release();
    this.client = null;
  }

  async rollback(): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.query("rollback");
    this.client.release();
    this.client = null;
  }
}

export async function withPgTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const tx = new PgTxContext(pool);
  const client = await tx.begin();
  try {
    const result = await work(client);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
