import { EventEmitter } from "node:events";
import type { RequestHandler } from "express";
import type pg from "pg";
import type { AiConnection } from "../modules/ai/service.js";
import type { SupportDependencies } from "../modules/conversations/process-inbound.js";
import { createAuthentication } from "./middleware/auth.js";
import { createOriginVerifier } from "./middleware/origin.js";
import { createRateLimiter } from "./middleware/rate-limit.js";
import type { User } from "./types.js";

export type { User } from "./types.js";

export type AppDependencies = {
  pool: pg.Pool;
  cache: {
    isReady: boolean;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
  };
  events?: EventEmitter;
  mediaDir: string;
  qdrantUrl: string;
  adminUrl: string;
  supportUrl: string;
  encryptionKey: Buffer;
  mockMode: boolean;
  getAiConnection(): Promise<AiConnection>;
};

export type HttpContext = {
  input: AppDependencies;
  events: EventEmitter;
  support: SupportDependencies;
  audit(
    user: User | undefined,
    action: string,
    targetType: string,
    targetId?: string,
    details?: object,
  ): Promise<void>;
  rateLimit: RequestHandler;
  authenticate: RequestHandler;
  adminOnly: RequestHandler;
  verifyOrigin: RequestHandler;
  authorizeConversation: RequestHandler;
};

export function createHttpContext(input: AppDependencies): HttpContext {
  const events = input.events ?? new EventEmitter();
  events.setMaxListeners(0);
  const support: SupportDependencies = { ...input, events };
  const authentication = createAuthentication(input.pool);

  async function audit(
    user: User | undefined,
    action: string,
    targetType: string,
    targetId = "",
    details = {},
  ) {
    await input.pool.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)`,
      [user?.id ?? null, action, targetType, targetId, details],
    );
  }

  return {
    input,
    events,
    support,
    audit,
    rateLimit: createRateLimiter(input.cache),
    verifyOrigin: createOriginVerifier(input.adminUrl, input.mockMode),
    ...authentication,
  };
}
