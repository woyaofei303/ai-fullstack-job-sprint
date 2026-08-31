import crypto from "node:crypto";
import pg from "pg";
import { hashPassword } from "../infrastructure/security/crypto.js";
import { migrate } from "./migrate.js";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .flatMap((value, index, all) =>
      value.startsWith("--") ? [[value.slice(2), all[index + 1]]] : [],
    ),
);
const email = args.email?.trim().toLowerCase();
const displayName = args.name?.trim() || "Administrator";
const role = args.role === "agent" ? "agent" : "admin";
const password = process.env.ADMIN_PASSWORD;

if (!email || !password || password.length < 10) {
  console.error(
    "Usage: ADMIN_PASSWORD='at-least-10-characters' pnpm admin:create --email admin@example.com --name Administrator [--role admin|agent]",
  );
  process.exit(1);
}

await migrate();
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/app",
});
const result = await pool.query(
  `INSERT INTO users (id,email,display_name,password_hash,role)
   VALUES ($1,$2,$3,$4,$5)
   ON CONFLICT (email) DO UPDATE SET display_name=excluded.display_name,password_hash=excluded.password_hash,role=excluded.role,enabled=true,updated_at=now()
   RETURNING id,email,display_name AS "displayName",role`,
  [crypto.randomUUID(), email, displayName, await hashPassword(password), role],
);
console.log(JSON.stringify(result.rows[0]));
await pool.end();
