import { PostgreSqlContainer } from "@testcontainers/postgresql";

export interface PgTestRuntime {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionString: string;
  stop: () => Promise<void>;
}

export async function startPgTestContainer(): Promise<PgTestRuntime> {
  const container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("sync_test")
    .withUsername("sync")
    .withPassword("sync")
    .start();

  return {
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    connectionString: container.getConnectionUri(),
    stop: async () => {
      await container.stop();
    }
  };
}
