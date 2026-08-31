import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/app";

export async function migrate(
  directory = fileURLToPath(
    new URL("../../../../db/migrations", import.meta.url),
  ),
): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const applied = new Set(
    (
      await pool.query<{ name: string }>("SELECT name FROM schema_migrations")
    ).rows.map(({ name }) => name),
  );
  const files = (await fs.readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of files) {
    if (applied.has(name)) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(await fs.readFile(path.join(directory, name), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        name,
      ]);
      await client.query("COMMIT");
      console.log(`Applied migration ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
