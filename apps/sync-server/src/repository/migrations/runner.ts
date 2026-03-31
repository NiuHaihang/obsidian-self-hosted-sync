import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PoolClient } from "pg";
import { loadDatabaseConfig } from "../../config/database.js";
import { createPgPool } from "../postgres/pool.js";

const MIGRATIONS_DIR = "apps/sync-server/src/repository/migrations";

async function ensureMigrationTable(client: PoolClient) {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

function checksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i += 1) {
    hash = (hash * 31 + content.charCodeAt(i)) >>> 0;
  }
  return String(hash);
}

async function run() {
  const config = loadDatabaseConfig();
  if (config.backend !== "postgres") {
    throw new Error("db:migrate 仅支持 SYNC_STORAGE_BACKEND=postgres");
  }

  const pool = createPgPool(config);
  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);

    const appliedRows = await client.query<{ version: string; checksum: string }>(
      "select version, checksum from schema_migrations"
    );
    const applied = new Map(
      appliedRows.rows.map((row: { version: string; checksum: string }) => [row.version, row.checksum])
    );

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const path = join(MIGRATIONS_DIR, file);
      const sql = await readFile(path, "utf8");
      const sum = checksum(sql);
      const existing = applied.get(version);
      if (existing && existing !== sum) {
        throw new Error(`Migration checksum mismatch: ${version}`);
      }
      if (existing) {
        continue;
      }

      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into schema_migrations(version, checksum) values($1, $2)",
          [version, sum]
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
