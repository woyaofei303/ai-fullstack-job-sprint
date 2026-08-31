import { EventEmitter } from "node:events";
import { createDatabasePool } from "../infrastructure/database/client.js";
import { createRedisCache } from "../infrastructure/redis/client.js";
import {
  decryptSecret,
  readEncryptionKey,
} from "../infrastructure/security/crypto.js";
import type { AiConnection } from "../modules/ai/service.js";
import { runHousekeeping } from "../modules/conversations/housekeeping.js";
import { ingestPendingDocuments } from "../modules/knowledge/ingestion.js";
import { migrate } from "../scripts/migrate.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8000);
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/app";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const qdrantUrl = process.env.QDRANT_URL ?? "http://localhost:6333";
const mediaDir =
  process.env.MEDIA_DIR ??
  new URL("../../../../.media", import.meta.url).pathname;
const adminUrl =
  process.env.ADMIN_URL ?? process.env.PUBLIC_URL ?? "http://localhost:8001";
const supportUrl =
  process.env.SUPPORT_URL ?? process.env.PUBLIC_URL ?? "http://localhost:8002";
const mockMode = process.env.MOCK_MODE !== "false";
const encryptionKey = readEncryptionKey(
  process.env.APP_ENCRYPTION_KEY,
  mockMode,
);
const pool = createDatabasePool(databaseUrl);
const cache = createRedisCache(redisUrl);
const events = new EventEmitter();

async function getAiConnection(): Promise<AiConnection> {
  const result = await pool.query(
    `SELECT value, encrypted_value AS "encryptedValue" FROM system_settings WHERE key='ai'`,
  );
  const setting = result.rows[0] ?? { value: {} };
  return {
    mock: mockMode,
    baseUrl:
      setting.value.baseUrl ??
      process.env.OPENAI_BASE_URL ??
      "https://api.openai.com/v1",
    embeddingModel:
      setting.value.embeddingModel ??
      process.env.EMBEDDING_MODEL ??
      "text-embedding-3-small",
    apiKey: setting.encryptedValue
      ? decryptSecret(setting.encryptedValue, encryptionKey)
      : process.env.OPENAI_API_KEY,
  };
}

async function start() {
  if (!mockMode && !process.env.APP_ENCRYPTION_KEY)
    throw new Error("APP_ENCRYPTION_KEY is required when MOCK_MODE=false");
  await migrate();
  await pool.query("SELECT 1");
  await cache
    .connect()
    .catch((error) =>
      console.warn(
        "Redis unavailable; rate limiting is degraded.",
        error.message,
      ),
    );
  const app = createApp({
    pool,
    cache,
    events,
    mediaDir,
    qdrantUrl,
    adminUrl,
    supportUrl,
    encryptionKey,
    mockMode,
    getAiConnection,
  });
  const server = app.listen(port, () =>
    console.log(
      `Support API listening on ${port} (${mockMode ? "mock" : "real AI"} mode)`,
    ),
  );
  void ingestPendingDocuments(pool, qdrantUrl, await getAiConnection());
  await runHousekeeping(pool, mediaDir);
  const timer = setInterval(
    () =>
      void runHousekeeping(pool, mediaDir).catch((error) =>
        console.error("Housekeeping failed:", error),
      ),
    6 * 60 * 60 * 1000,
  );
  timer.unref();
  const stop = () =>
    server.close(() =>
      Promise.all([
        pool.end(),
        cache.isOpen ? cache.quit() : Promise.resolve(),
      ]).finally(() => process.exit(0)),
    );
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

start().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
