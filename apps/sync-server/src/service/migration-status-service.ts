import type { Pool } from "pg";

export interface MigrationStatus {
  current_version: string;
  pending_count: number;
  db_connected: boolean;
}

export class MigrationStatusService {
  constructor(private readonly pool: Pool | null) {}

  async getStatus(expectedVersions: string[] = []): Promise<MigrationStatus> {
    if (!this.pool) {
      return {
        current_version: "none",
        pending_count: expectedVersions.length,
        db_connected: false
      };
    }

    try {
      const rows = await this.pool.query<{ version: string }>(
        "select version from schema_migrations order by version asc"
      );
      const applied = rows.rows.map((row: { version: string }) => row.version);
      const current = applied[applied.length - 1] ?? "none";
      const pending = expectedVersions.filter((version) => !applied.includes(version)).length;
      return {
        current_version: current,
        pending_count: pending,
        db_connected: true
      };
    } catch {
      return {
        current_version: "unknown",
        pending_count: expectedVersions.length,
        db_connected: false
      };
    }
  }
}
