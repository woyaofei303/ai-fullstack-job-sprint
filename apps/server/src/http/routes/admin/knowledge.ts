import crypto from "node:crypto";
import path from "node:path";
import type { Express } from "express";
import { chunkText } from "../../../modules/knowledge/chunking.js";
import {
  deleteDocument,
  ingestDocument,
} from "../../../modules/knowledge/ingestion.js";
import type { HttpContext } from "../../context.js";
import { cleanText, requiredText } from "../../shared/validation.js";
import { knowledgeUpload as kbUpload } from "../../uploads.js";

export function registerKnowledgeRoutes(app: Express, context: HttpContext) {
  const { input, audit, adminOnly } = context;

  app.get(
    "/api/admin/knowledge-bases",
    adminOnly,
    async (_request, response) => {
      const result = await input.pool.query(
        `SELECT k.*, count(DISTINCT d.id)::int AS documents, count(DISTINCT c.id)::int AS chunks
       FROM knowledge_bases k LEFT JOIN documents d ON d.knowledge_base_id = k.id
       LEFT JOIN chunks c ON c.document_id = d.id GROUP BY k.id ORDER BY k.created_at`,
      );
      response.json(result.rows);
    },
  );

  app.post(
    "/api/admin/knowledge-bases",
    adminOnly,
    async (request, response) => {
      const result = await input.pool.query(
        `INSERT INTO knowledge_bases (id, name, description) VALUES ($1,$2,$3) RETURNING *`,
        [
          crypto.randomUUID(),
          requiredText(request.body?.name, "名称"),
          cleanText(request.body?.description, 1000),
        ],
      );
      await audit(
        response.locals.user,
        "create",
        "knowledge_base",
        result.rows[0].id,
      );
      response.status(201).json(result.rows[0]);
    },
  );

  app.get(
    "/api/admin/knowledge-bases/:id/documents",
    adminOnly,
    async (request, response) => {
      const result = await input.pool.query(
        `SELECT d.*, count(c.id)::int AS chunks FROM documents d LEFT JOIN chunks c ON c.document_id=d.id
       WHERE d.knowledge_base_id=$1 GROUP BY d.id ORDER BY d.created_at DESC`,
        [request.params.id],
      );
      response.json(result.rows);
    },
  );

  app.post(
    "/api/admin/knowledge-bases/:id/documents",
    adminOnly,
    kbUpload.single("file"),
    async (request, response) => {
      if (!request.file)
        return response.status(400).json({ error: "请选择文件。" });
      const extension = path.extname(request.file.originalname).toLowerCase();
      if (![".txt", ".md"].includes(extension))
        return response.status(415).json({ error: "仅支持 TXT 或 Markdown。" });
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(
          request.file.buffer,
        );
      } catch {
        return response
          .status(400)
          .json({ error: "文件必须使用 UTF-8 编码。" });
      }
      const chunks = chunkText(text);
      if (!chunks.length)
        return response.status(400).json({ error: "文件没有可索引文本。" });
      const documentId = crypto.randomUUID();
      const client = await input.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO documents (id,name,size,knowledge_base_id,status) VALUES ($1,$2,$3,$4,'pending')`,
          [
            documentId,
            path.basename(request.file.originalname),
            request.file.size,
            request.params.id,
          ],
        );
        for (const [position, content] of chunks.entries()) {
          await client.query(
            "INSERT INTO chunks (document_id,position,content) VALUES ($1,$2,$3)",
            [documentId, position, content],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      await ingestDocument(
        input.pool,
        documentId,
        input.qdrantUrl,
        await input.getAiConnection(),
      ).catch(() => undefined);
      await audit(response.locals.user, "upload", "document", documentId);
      response.status(201).json({ id: documentId, chunks: chunks.length });
    },
  );

  app.post(
    "/api/admin/knowledge-bases/:id/faqs",
    adminOnly,
    async (request, response) => {
      const question = requiredText(request.body?.question, "问题");
      const answer = requiredText(request.body?.answer, "答案");
      const documentId = crypto.randomUUID();
      const faqId = crypto.randomUUID();
      const client = await input.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO documents (id,name,size,knowledge_base_id,source_type,status) VALUES ($1,$2,$3,$4,'faq','pending')`,
          [
            documentId,
            question.slice(0, 120),
            Buffer.byteLength(`${question}\n${answer}`),
            request.params.id,
          ],
        );
        await client.query(
          "INSERT INTO chunks (document_id,position,content) VALUES ($1,0,$2)",
          [documentId, `Q: ${question}\nA: ${answer}`],
        );
        await client.query(
          `INSERT INTO faq_entries (id,knowledge_base_id,document_id,question,answer) VALUES ($1,$2,$3,$4,$5)`,
          [faqId, request.params.id, documentId, question, answer],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      await ingestDocument(
        input.pool,
        documentId,
        input.qdrantUrl,
        await input.getAiConnection(),
      ).catch(() => undefined);
      response.status(201).json({ id: faqId, documentId });
    },
  );

  app.get(
    "/api/admin/knowledge-bases/:id/faqs",
    adminOnly,
    async (request, response) => {
      const result = await input.pool.query(
        `SELECT id,document_id AS "documentId",question,answer,created_at AS "createdAt",updated_at AS "updatedAt"
         FROM faq_entries WHERE knowledge_base_id=$1 ORDER BY updated_at DESC`,
        [request.params.id],
      );
      response.json(result.rows);
    },
  );

  app.patch("/api/admin/faqs/:id", adminOnly, async (request, response) => {
    const question = requiredText(request.body?.question, "问题");
    const answer = requiredText(request.body?.answer, "答案");
    const faq = await input.pool.query(
      `UPDATE faq_entries SET question=$2,answer=$3,updated_at=now() WHERE id=$1
       RETURNING id,document_id AS "documentId",question,answer`,
      [request.params.id, question, answer],
    );
    if (!faq.rowCount)
      return response.status(404).json({ error: "FAQ 不存在。" });
    await input.pool.query(
      `UPDATE documents SET name=$2,size=$3,status='pending',error=NULL,updated_at=now() WHERE id=$1`,
      [
        faq.rows[0].documentId,
        question.slice(0, 120),
        Buffer.byteLength(`${question}\n${answer}`),
      ],
    );
    await input.pool.query(
      `UPDATE chunks SET content=$2,updated_at=now() WHERE document_id=$1 AND position=0`,
      [faq.rows[0].documentId, `Q: ${question}\nA: ${answer}`],
    );
    await ingestDocument(
      input.pool,
      faq.rows[0].documentId,
      input.qdrantUrl,
      await input.getAiConnection(),
    ).catch(() => undefined);
    await audit(
      response.locals.user,
      "update",
      "faq",
      String(request.params.id),
    );
    response.json(faq.rows[0]);
  });

  app.delete("/api/admin/faqs/:id", adminOnly, async (request, response) => {
    const faq = await input.pool.query(
      `SELECT document_id AS "documentId" FROM faq_entries WHERE id=$1`,
      [request.params.id],
    );
    if (!faq.rowCount)
      return response.status(404).json({ error: "FAQ 不存在。" });
    await deleteDocument(input.pool, faq.rows[0].documentId, input.qdrantUrl);
    await audit(
      response.locals.user,
      "delete",
      "faq",
      String(request.params.id),
    );
    response.status(204).end();
  });

  app.post(
    "/api/admin/documents/:id/retry",
    adminOnly,
    async (request, response) => {
      await ingestDocument(
        input.pool,
        String(request.params.id),
        input.qdrantUrl,
        await input.getAiConnection(),
      );
      response.json({ status: "ready" });
    },
  );

  app.delete(
    "/api/admin/documents/:id",
    adminOnly,
    async (request, response) => {
      const result = await deleteDocument(
        input.pool,
        String(request.params.id),
        input.qdrantUrl,
      );
      if (!result.rowCount)
        return response.status(404).json({ error: "文档不存在。" });
      await audit(
        response.locals.user,
        "delete",
        "document",
        String(request.params.id),
      );
      response.status(204).end();
    },
  );
}
