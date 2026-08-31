import crypto from "node:crypto";
import type pg from "pg";
import {
  deleteDocumentVectors,
  indexChunks,
} from "../../infrastructure/qdrant/client.js";
import type { AiConnection } from "../ai/service.js";

export async function ingestDocument(
  pool: pg.Pool,
  documentId: string,
  qdrantUrl: string,
  ai: AiConnection,
) {
  const result = await pool.query(
    `SELECT c.id, c.content, c.document_id AS "documentId",
            d.knowledge_base_id AS "knowledgeBaseId"
     FROM chunks c JOIN documents d ON d.id = c.document_id
     WHERE d.id = $1 ORDER BY c.position`,
    [documentId],
  );
  if (!result.rowCount) throw new Error("Document has no chunks");
  await pool.query(
    "UPDATE documents SET status = 'processing', error = NULL WHERE id = $1",
    [documentId],
  );
  try {
    await indexChunks(result.rows, qdrantUrl, ai);
    await pool.query(
      `UPDATE documents SET status = 'ready', error = NULL, updated_at = now() WHERE id = $1`,
      [documentId],
    );
    await pool.query(
      `UPDATE ingestion_jobs SET status = 'done', error = NULL, updated_at = now()
       WHERE document_id = $1 AND status <> 'done'`,
      [documentId],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingestion failed";
    await pool.query(
      "UPDATE documents SET status = 'failed', error = $2 WHERE id = $1",
      [documentId, message],
    );
    await pool.query(
      `INSERT INTO ingestion_jobs (id, document_id, operation, status, attempts, error, next_run_at)
       VALUES ($1, $2, 'upsert', 'failed', 1, $3, now() + interval '5 minutes')
       ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), documentId, message],
    );
    throw error;
  }
}

export async function ingestPendingDocuments(
  pool: pg.Pool,
  qdrantUrl: string,
  ai: AiConnection,
) {
  const result = await pool.query(
    `SELECT id FROM documents WHERE status IN ('pending', 'failed') ORDER BY created_at LIMIT 20`,
  );
  for (const row of result.rows) {
    await ingestDocument(pool, row.id, qdrantUrl, ai).catch((error) =>
      console.warn(
        `Knowledge ingestion failed for ${row.id}:`,
        error instanceof Error ? error.message : error,
      ),
    );
  }
}

export async function deleteDocument(
  pool: pg.Pool,
  documentId: string,
  qdrantUrl: string,
) {
  await deleteDocumentVectors(documentId, qdrantUrl);
  return pool.query("DELETE FROM documents WHERE id = $1 RETURNING id", [
    documentId,
  ]);
}
