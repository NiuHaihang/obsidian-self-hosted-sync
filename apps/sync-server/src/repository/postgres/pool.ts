import { Pool, type PoolConfig } from "pg";
import type { DatabaseConfig } from "../../config/database.js";

export function createPgPool(config: DatabaseConfig): Pool {
  const poolConfig: PoolConfig = {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: config.max,
    idleTimeoutMillis: config.idleTimeoutMs,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    application_name: "self-hosted-sync"
  };

  return new Pool(poolConfig);
}

export async function checkPgConnection(pool: Pool): Promise<boolean> {
  try {
    const result = await pool.query("select 1 as ok");
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}
