export type StorageBackend = "memory" | "postgres";

export interface DatabaseConfig {
  backend: StorageBackend;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  max: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

export function loadDatabaseConfig(): DatabaseConfig {
  const backendRaw = (process.env.SYNC_STORAGE_BACKEND ?? "memory").toLowerCase();
  const backend: StorageBackend = backendRaw === "postgres" ? "postgres" : "memory";

  return {
    backend,
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: readInt("POSTGRES_PORT", 5432),
    user: process.env.POSTGRES_USER ?? "sync",
    password: process.env.POSTGRES_PASSWORD ?? "sync",
    database: process.env.POSTGRES_DB ?? "sync",
    max: readInt("POSTGRES_POOL_MAX", 20),
    idleTimeoutMs: readInt("POSTGRES_POOL_IDLE_TIMEOUT_MS", 10000),
    connectionTimeoutMs: readInt("POSTGRES_POOL_CONNECT_TIMEOUT_MS", 5000),
    statementTimeoutMs: readInt("POSTGRES_STATEMENT_TIMEOUT_MS", 5000)
  };
}

export function getDatabaseConnectionString(config: DatabaseConfig): string {
  const user = encodeURIComponent(config.user);
  const password = encodeURIComponent(config.password);
  return `postgresql://${user}:${password}@${config.host}:${config.port}/${config.database}`;
}
