import { createServer } from "./api/server.js";

async function bootstrap() {
  const port = Number.parseInt(process.env.SYNC_SERVER_PORT ?? "8787", 10);
  const host = process.env.SYNC_SERVER_HOST ?? "0.0.0.0";
  const jwtSecret = process.env.JWT_SECRET ?? "dev-secret";

  const app = await createServer({ jwtSecret });
  await app.listen({ port, host });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
