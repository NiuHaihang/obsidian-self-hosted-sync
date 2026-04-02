import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { createTestServer, encode, registerClient } from "../contract/helpers.js";
import { startPgTestContainer } from "./helpers/pg-test-container.js";

const MIGRATIONS_DIR = "apps/sync-server/src/repository/migrations";

async function applyMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    create table if not exists schema_migrations (
      version text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const appliedRows = await pool.query<{ version: string }>("select version from schema_migrations");
  const applied = new Set(appliedRows.rows.map((row) => row.version));
  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) {
      continue;
    }

    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query("insert into schema_migrations(version, checksum) values($1, $2)", [version, "test"]);
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }
}

describe("restart persistence pg integration", () => {
  it("keeps committed data after service restart in postgres backend", async () => {
    const previousEnv = {
      SYNC_STORAGE_BACKEND: process.env.SYNC_STORAGE_BACKEND,
      POSTGRES_HOST: process.env.POSTGRES_HOST,
      POSTGRES_PORT: process.env.POSTGRES_PORT,
      POSTGRES_USER: process.env.POSTGRES_USER,
      POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
      POSTGRES_DB: process.env.POSTGRES_DB,
      SYNC_ALLOW_DEGRADED_POSTGRES: process.env.SYNC_ALLOW_DEGRADED_POSTGRES
    };

    const pg = await startPgTestContainer();
    const pool = new Pool({
      host: pg.host,
      port: pg.port,
      user: pg.user,
      password: pg.password,
      database: pg.database
    });

    process.env.SYNC_STORAGE_BACKEND = "postgres";
    process.env.POSTGRES_HOST = pg.host;
    process.env.POSTGRES_PORT = String(pg.port);
    process.env.POSTGRES_USER = pg.user;
    process.env.POSTGRES_PASSWORD = pg.password;
    process.env.POSTGRES_DB = pg.database;
    delete process.env.SYNC_ALLOW_DEGRADED_POSTGRES;

    await applyMigrations(pool);

    try {
      const first = await createTestServer();
      const spaceId = "space-restart-pg";
      const registration = await registerClient(first, spaceId, "device-restart-pg");

      const push = await first.inject({
        method: "POST",
        url: `/v1/spaces/${spaceId}/changes`,
        headers: { authorization: `Bearer ${registration.access_token}` },
        payload: {
          client_id: registration.client_id,
          idempotency_key: "restart-idem-1",
          base_version: 0,
          expected_head: 0,
          ops: [{ op_type: "upsert", path: "restart.md", content_b64: encode("persist") }]
        }
      });

      expect(push.statusCode).toBe(200);
      await first.close();

      const second = await createTestServer();
      const pull = await second.inject({
        method: "GET",
        url: `/v1/spaces/${spaceId}/changes?from_version=0`,
        headers: { authorization: `Bearer ${registration.access_token}` }
      });

      expect(pull.statusCode).toBe(200);
      expect((pull.json().changes as unknown[]).length).toBeGreaterThan(0);
      await second.close();
    } finally {
      await pool.end();
      await pg.stop();
      const restore = (key: keyof typeof previousEnv) => {
        const value = previousEnv[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      };

      restore("SYNC_STORAGE_BACKEND");
      restore("POSTGRES_HOST");
      restore("POSTGRES_PORT");
      restore("POSTGRES_USER");
      restore("POSTGRES_PASSWORD");
      restore("POSTGRES_DB");
      restore("SYNC_ALLOW_DEGRADED_POSTGRES");
    }
  }, 60000);
});
