export interface MigrationConfig {
  migrationsDir: string;
  tableName: string;
}

export const migrationConfig: MigrationConfig = {
  migrationsDir: "apps/sync-server/src/repository/migrations",
  tableName: "schema_migrations"
};
