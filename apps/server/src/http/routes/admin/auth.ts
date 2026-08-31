import crypto from "node:crypto";
import type { Express } from "express";
import {
  digestToken,
  newSessionToken,
  verifyPassword,
} from "../../../infrastructure/security/crypto.js";
import type { HttpContext } from "../../context.js";
import { readCookie } from "../../middleware/auth.js";
import { cleanText, stripPassword } from "../../shared/validation.js";

export function registerAuthRoutes(app: Express, context: HttpContext) {
  const { input, audit, rateLimit, verifyOrigin, authenticate } = context;

  app.post(
    "/api/admin/auth/login",
    rateLimit,
    verifyOrigin,
    async (request, response) => {
      const email = cleanText(request.body?.email, 240).toLowerCase();
      const password =
        typeof request.body?.password === "string" ? request.body.password : "";
      const result = await input.pool.query(
        `SELECT id, email, display_name AS "displayName", role, password_hash AS "passwordHash"
       FROM users WHERE email = $1 AND enabled`,
        [email],
      );
      if (
        !result.rowCount ||
        !(await verifyPassword(password, result.rows[0].passwordHash))
      ) {
        return response.status(401).json({ error: "邮箱或密码错误。" });
      }
      const session = newSessionToken();
      await input.pool.query(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '7 days')`,
        [crypto.randomUUID(), result.rows[0].id, session.hash],
      );
      response.cookie("support_session", session.token, {
        httpOnly: true,
        secure: input.adminUrl.startsWith("https://"),
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });
      await audit(result.rows[0], "login", "session");
      response.json(stripPassword(result.rows[0]));
    },
  );

  app.use("/api/admin", verifyOrigin, authenticate);
  app.get("/api/admin/auth/me", (_request, response) =>
    response.json(response.locals.user),
  );
  app.post("/api/admin/auth/logout", async (request, response) => {
    const token = readCookie(request, "support_session");
    if (token)
      await input.pool.query("DELETE FROM sessions WHERE token_hash = $1", [
        digestToken(token),
      ]);
    response.clearCookie("support_session", { path: "/" }).status(204).end();
  });
}
