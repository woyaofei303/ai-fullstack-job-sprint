import crypto from "node:crypto";
import type { Express } from "express";
import { hashPassword } from "../../../infrastructure/security/crypto.js";
import type { HttpContext } from "../../context.js";
import { requiredText } from "../../shared/validation.js";

export function registerUserRoutes(app: Express, context: HttpContext) {
  const { input, audit, adminOnly } = context;

  app.get("/api/admin/users", adminOnly, async (_request, response) => {
    const result = await input.pool.query(
      `SELECT id,email,display_name AS "displayName",role,enabled,created_at AS "createdAt" FROM users ORDER BY created_at`,
    );
    response.json(result.rows);
  });

  app.post("/api/admin/users", adminOnly, async (request, response) => {
    const password = requiredText(request.body?.password, "密码");
    if (password.length < 10)
      return response.status(400).json({ error: "密码至少 10 个字符。" });
    const result = await input.pool.query(
      `INSERT INTO users (id,email,display_name,password_hash,role) VALUES ($1,$2,$3,$4,$5)
       RETURNING id,email,display_name AS "displayName",role,enabled`,
      [
        crypto.randomUUID(),
        requiredText(request.body?.email, "邮箱").toLowerCase(),
        requiredText(request.body?.displayName, "姓名"),
        await hashPassword(password),
        request.body?.role === "agent" ? "agent" : "admin",
      ],
    );
    await audit(response.locals.user, "create", "user", result.rows[0].id);
    response.status(201).json(result.rows[0]);
  });

  app.patch("/api/admin/users/:id", adminOnly, async (request, response) => {
    const result = await input.pool.query(
      `UPDATE users SET display_name=$2,role=$3,enabled=$4,updated_at=now() WHERE id=$1
       RETURNING id,email,display_name AS "displayName",role,enabled`,
      [
        request.params.id,
        requiredText(request.body?.displayName, "姓名"),
        request.body?.role === "agent" ? "agent" : "admin",
        request.body?.enabled !== false,
      ],
    );
    if (!result.rowCount)
      return response.status(404).json({ error: "成员不存在。" });
    await audit(
      response.locals.user,
      "update",
      "user",
      String(request.params.id),
    );
    response.json(result.rows[0]);
  });
}
