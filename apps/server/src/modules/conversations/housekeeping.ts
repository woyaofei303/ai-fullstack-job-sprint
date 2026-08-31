import type pg from "pg";
import { removeImage } from "../../infrastructure/media/storage.js";

export async function runHousekeeping(pool: pg.Pool, mediaDir: string) {
  await pool.query(
    `UPDATE conversations SET status='closed',ended_at=now()
     WHERE status<>'closed' AND last_message_at < now() - interval '24 hours'`,
  );
  await pool.query("DELETE FROM sessions WHERE expires_at < now()");
  const setting = await pool.query(
    "SELECT value FROM system_settings WHERE key='general'",
  );
  const days = Math.min(
    365,
    Math.max(30, Number(setting.rows[0]?.value?.retentionDays) || 180),
  );
  const paths = await pool.query(
    `SELECT a.storage_path FROM attachments a JOIN messages m ON m.id=a.message_id
     WHERE m.created_at < now() - ($1 || ' days')::interval`,
    [days],
  );
  await pool.query(
    `DELETE FROM messages WHERE created_at < now() - ($1 || ' days')::interval`,
    [days],
  );
  await Promise.all(
    paths.rows.map(({ storage_path }) => removeImage(mediaDir, storage_path)),
  );
}
