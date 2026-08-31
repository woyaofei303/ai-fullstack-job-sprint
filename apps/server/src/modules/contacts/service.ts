import type { Pool } from "pg";
import { removeImage } from "../../infrastructure/media/storage.js";

export async function listContacts(pool: Pool) {
  const result = await pool.query(
    `SELECT c.id, c.name, c.email, c.phone, c.notes, c.created_at AS "createdAt",
            count(ci.id)::int AS identities FROM contacts c LEFT JOIN channel_identities ci ON ci.contact_id = c.id
     GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 200`,
  );
  return result.rows;
}

export async function updateContact(
  pool: Pool,
  id: string,
  values: { name: string; email: string; phone: string; notes: string },
) {
  const result = await pool.query(
    `UPDATE contacts SET name = $2, email = $3, phone = $4, notes = $5, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, values.name, values.email, values.phone, values.notes],
  );
  return result.rows[0];
}

export async function mergeContacts(
  pool: Pool,
  targetId: string,
  sourceId: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE channel_identities SET contact_id = $1 WHERE contact_id = $2",
      [targetId, sourceId],
    );
    await client.query("DELETE FROM contacts WHERE id = $1", [sourceId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function exportContact(pool: Pool, id: string) {
  const [contact, identities, conversations] = await Promise.all([
    pool.query("SELECT * FROM contacts WHERE id = $1", [id]),
    pool.query(
      "SELECT id, external_id, profile, created_at FROM channel_identities WHERE contact_id = $1",
      [id],
    ),
    pool.query(
      `SELECT c.*, coalesce(json_agg(m ORDER BY m.created_at) FILTER (WHERE m.id IS NOT NULL), '[]') AS messages
       FROM conversations c JOIN channel_identities i ON i.id = c.channel_identity_id
       LEFT JOIN messages m ON m.conversation_id = c.id WHERE i.contact_id = $1 GROUP BY c.id`,
      [id],
    ),
  ]);
  if (!contact.rowCount) return;
  return {
    contact: contact.rows[0],
    identities: identities.rows,
    conversations: conversations.rows,
  };
}

export async function deleteContact(pool: Pool, mediaDir: string, id: string) {
  const paths = await pool.query(
    `SELECT a.storage_path FROM attachments a JOIN messages m ON m.id = a.message_id
     JOIN conversations c ON c.id = m.conversation_id JOIN channel_identities i ON i.id = c.channel_identity_id
     WHERE i.contact_id = $1`,
    [id],
  );
  const result = await pool.query(
    "DELETE FROM contacts WHERE id = $1 RETURNING id",
    [id],
  );
  if (!result.rowCount) return false;
  await Promise.all(
    paths.rows.map(({ storage_path }) => removeImage(mediaDir, storage_path)),
  );
  return true;
}
