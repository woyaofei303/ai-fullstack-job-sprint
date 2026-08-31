import type { Request, RequestHandler } from "express";
import type pg from "pg";
import { digestToken } from "../../infrastructure/security/crypto.js";
import type { User } from "../types.js";

export function createAuthentication(pool: pg.Pool): {
  authenticate: RequestHandler;
  adminOnly: RequestHandler;
  authorizeConversation: RequestHandler;
} {
  const authenticate: RequestHandler = async (request, response, next) => {
    const token = readCookie(request, "support_session");
    if (!token) {
      response.status(401).json({ error: "请先登录。" });
      return;
    }
    const result = await pool.query(
      `SELECT u.id, u.email, u.display_name AS "displayName", u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.enabled`,
      [digestToken(token)],
    );
    if (!result.rowCount) {
      response.status(401).json({ error: "登录已过期。" });
      return;
    }
    response.locals.user = result.rows[0] as User;
    next();
  };

  const adminOnly: RequestHandler = (_request, response, next) => {
    if ((response.locals.user as User).role !== "admin") {
      response.status(403).json({ error: "需要管理员权限。" });
      return;
    }
    next();
  };

  const authorizeConversation: RequestHandler = async (
    request,
    response,
    next,
  ) => {
    const token = request.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      response.status(401).json({ error: "访客令牌缺失。" });
      return;
    }
    const result = await pool.query(
      `SELECT c.id, c.status FROM conversations c
       JOIN channel_identities i ON i.id = c.channel_identity_id
       WHERE c.id = $1 AND i.visitor_token_hash = $2`,
      [request.params.id, digestToken(token)],
    );
    if (!result.rowCount) {
      response.status(401).json({ error: "访客令牌无效。" });
      return;
    }
    response.locals.conversation = result.rows[0];
    next();
  };

  return { authenticate, adminOnly, authorizeConversation };
}

export function readCookie(request: Request, name: string) {
  const match = request
    .header("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}
