import crypto from "node:crypto";
import path from "node:path";
import type { Express } from "express";
import {
  digestToken,
  newSessionToken,
} from "../../../infrastructure/security/crypto.js";
import { processInbound } from "../../../modules/conversations/process-inbound.js";
import type { HttpContext } from "../../context.js";
import { writeEvent } from "../../shared/events.js";
import { cleanText, safeObject } from "../../shared/validation.js";
import { imageUpload } from "../../uploads.js";

export function registerPublicConversationRoutes(
  app: Express,
  context: HttpContext,
) {
  const { input, events, support: deps, authorizeConversation } = context;

  app.post("/api/public/visitors", async (request, response) => {
    const {
      publicId,
      serviceEntryId,
      name,
      email,
      visitorToken,
      externalId,
      profile,
      privacyAccepted,
    } = request.body ?? {};
    if (!privacyAccepted)
      return response.status(400).json({ error: "请先同意隐私政策。" });
    const channelResult = await input.pool.query(
      `SELECT id, default_ai_agent_id AS "defaultAiAgentId" FROM channel_connections
       WHERE public_id = $1 AND type = 'web' AND enabled`,
      [publicId],
    );
    if (!channelResult.rowCount)
      return response.status(404).json({ error: "客服入口不存在。" });
    const channel = channelResult.rows[0];
    const entryResult = serviceEntryId
      ? await input.pool.query(
          `SELECT id, ai_agent_id AS "aiAgentId" FROM service_entries
           WHERE public_id = $1 AND channel_connection_id = $2 AND enabled`,
          [serviceEntryId, channel.id],
        )
      : { rows: [], rowCount: 0 };
    if (serviceEntryId && !entryResult.rowCount)
      return response.status(400).json({ error: "服务入口无效。" });
    const existing =
      typeof visitorToken === "string"
        ? await input.pool.query(
            `SELECT i.id, i.contact_id AS "contactId" FROM channel_identities i
           WHERE i.channel_connection_id = $1 AND i.visitor_token_hash = $2`,
            [channel.id, digestToken(visitorToken)],
          )
        : { rows: [], rowCount: 0 };
    const issued = existing.rowCount ? null : newSessionToken();
    const client = await input.pool.connect();
    try {
      await client.query("BEGIN");
      let identityId = existing.rows[0]?.id as string | undefined;
      if (!identityId) {
        const contactId = crypto.randomUUID();
        identityId = crypto.randomUUID();
        await client.query(
          `INSERT INTO contacts (id, name, email) VALUES ($1, $2, $3)`,
          [contactId, cleanText(name, 120), cleanText(email, 240)],
        );
        await client.query(
          `INSERT INTO channel_identities (id, contact_id, channel_connection_id, external_id, profile, visitor_token_hash)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            identityId,
            contactId,
            channel.id,
            `web:${crypto.randomUUID()}`,
            { ...safeObject(profile), externalId: cleanText(externalId, 240) },
            issued?.hash,
          ],
        );
      } else {
        await client.query(
          `UPDATE contacts SET name = coalesce(nullif($2, ''), name), email = coalesce(nullif($3, ''), email), updated_at = now()
           WHERE id = $1`,
          [
            existing.rows[0].contactId,
            cleanText(name, 120),
            cleanText(email, 240),
          ],
        );
      }
      let conversation = await client.query(
        `SELECT id, status FROM conversations WHERE channel_connection_id = $1 AND channel_identity_id = $2 AND status <> 'closed'`,
        [channel.id, identityId],
      );
      if (!conversation.rowCount) {
        conversation = await client.query(
          `INSERT INTO conversations (id, channel_connection_id, channel_identity_id, service_entry_id, ai_agent_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id, status`,
          [
            crypto.randomUUID(),
            channel.id,
            identityId,
            entryResult.rows[0]?.id ?? null,
            entryResult.rows[0]?.aiAgentId ?? channel.defaultAiAgentId,
          ],
        );
      }
      await client.query("COMMIT");
      response.status(201).json({
        conversationId: conversation.rows[0].id,
        visitorToken: issued?.token ?? visitorToken,
        status: conversation.rows[0].status,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post(
    "/api/public/conversations/:id/messages",
    authorizeConversation,
    imageUpload.single("image"),
    async (request, response) => {
      if (response.locals.conversation.status === "closed")
        return response.status(409).json({
          error: "会话已结束，请开始新会话。",
          status: "closed",
        });
      const text = cleanText(request.body?.text, 4000);
      if (!text && !request.file)
        return response.status(400).json({ error: "请输入消息或选择图片。" });
      const result = await processInbound(deps, {
        conversationId: String(request.params.id),
        text,
        platformMessageId:
          cleanText(request.body?.clientMessageId, 200) || undefined,
        ...(request.file
          ? {
              image: {
                bytes: request.file.buffer,
                originalName: path.basename(request.file.originalname),
              },
            }
          : {}),
      });
      response.status(result.duplicate ? 200 : 201).json(result);
    },
  );

  app.post(
    "/api/public/conversations/:id/handoff",
    authorizeConversation,
    async (request, response) => {
      await input.pool.query(
        `UPDATE conversations SET status = 'waiting_human', handoff_reason = 'requested_human'
       WHERE id = $1 AND status = 'ai_active'`,
        [request.params.id],
      );
      const message = await input.pool.query(
        `INSERT INTO messages (id, conversation_id, sender, text) VALUES ($1, $2, 'system', $3)
       RETURNING id, sender, text, created_at AS "createdAt"`,
        [crypto.randomUUID(), request.params.id, "已请求人工客服，请稍候。"],
      );
      events.emit(String(request.params.id), {
        type: "message",
        data: message.rows[0],
      });
      events.emit(String(request.params.id), {
        type: "status",
        data: { status: "waiting_human" },
      });
      response.json({ status: "waiting_human" });
    },
  );

  app.get(
    "/api/public/conversations/:id/events",
    authorizeConversation,
    async (request, response) => {
      response.set({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const snapshot = await input.pool.query(
        `SELECT m.id, m.sender, m.text, m.source_chunk_ids AS "sourceIds", m.created_at AS "createdAt",
              coalesce(json_agg(json_build_object('id', a.id, 'mimeType', a.mime_type)) FILTER (WHERE a.id IS NOT NULL), '[]') AS attachments
       FROM messages m LEFT JOIN attachments a ON a.message_id = m.id
       WHERE m.conversation_id = $1 GROUP BY m.id ORDER BY m.created_at`,
        [request.params.id],
      );
      writeEvent(response, "snapshot", {
        messages: snapshot.rows,
        status: response.locals.conversation.status,
      });
      const listener = (event: { type: string; data: unknown }) =>
        writeEvent(response, event.type, event.data);
      events.on(String(request.params.id), listener);
      const keepAlive = setInterval(
        () => response.write(": keepalive\n\n"),
        20_000,
      );
      request.on("close", () => {
        clearInterval(keepAlive);
        events.off(String(request.params.id), listener);
      });
    },
  );

  app.get(
    "/api/public/conversations/:id/attachments/:attachmentId",
    authorizeConversation,
    async (request, response) => {
      const result = await input.pool.query(
        `SELECT a.mime_type AS "mimeType", a.storage_path AS "storagePath"
       FROM attachments a JOIN messages m ON m.id = a.message_id
       WHERE a.id = $1 AND m.conversation_id = $2`,
        [request.params.attachmentId, request.params.id],
      );
      if (!result.rowCount)
        return response.status(404).json({ error: "图片不存在。" });
      response
        .type(result.rows[0].mimeType)
        .sendFile(path.resolve(input.mediaDir, result.rows[0].storagePath));
    },
  );
}
