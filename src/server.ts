import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./infra/logger.js";
import { ensureVectorExtension } from "./infra/db.js";

async function main() {
  await ensureVectorExtension();
  const app = await buildApp();

  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info(`Verix Search listening on http://${env.HOST}:${env.PORT}`);

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
