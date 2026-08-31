import crypto from "node:crypto";
import type { Express } from "express";
import { decryptSecret } from "../../../infrastructure/security/crypto.js";
import { sendTelegramText } from "../../../modules/channels/telegram.js";
import type { HttpContext, User } from "../../context.js";
import { cleanText } from "../../shared/validation.js";

export function registerConversationRoutes(app: Express, context: HttpContext) {
  const { input, events, audit } = context;

  app.get("/api/admin/conversations", async (request, response) => {
    const status = cleanText(request.query.status, 40);
    const mine = request.query.mine === "true";
    const result = await input.pool.query(
      `SELECT c.id, c.status, c.handoff_reason AS "handoffReason", c.last_message_at AS "lastMessageAt",
              c.assigned_user_id AS "assignedUserId", coalesce(nullif(ct.name, ''), ci.external_id) AS "contactName",
              ch.name AS "channelName", ch.type AS "channelType", a.name AS "aiAgentName",
              (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS preview
       FROM conversations c JOIN channel_identities ci ON ci.id = c.channel_identity_id
       JOIN contacts ct ON ct.id = ci.contact_id JOIN channel_connections ch ON ch.id = c.channel_connection_id
       JOIN ai_agents a ON a.id = c.ai_agent_id
       WHERE ($1 = '' OR c.status = $1) AND (NOT $2 OR c.assigned_user_id = $3)
       ORDER BY c.last_message_at DESC LIMIT 100`,
      [status, mine, (response.locals.user as User).id],
    );
    response.json(result.rows);
  });

  app.get("/api/admin/conversations/:id", async (request, response) => {
    const conversation = await input.pool.query(
      `SELECT c.*, ct.name AS "contactName", ct.email AS "contactEmail", ct.notes AS "contactNotes",
              ch.name AS "channelName", ch.type AS "channelType", u.display_name AS "assignedName"
       FROM conversations c JOIN channel_identities ci ON ci.id = c.channel_identity_id
       JOIN contacts ct ON ct.id = ci.contact_id JOIN channel_connections ch ON ch.id = c.channel_connection_id
       LEFT JOIN users u ON u.id = c.assigned_user_id WHERE c.id = $1`,
      [request.params.id],
    );
    if (!conversation.rowCount)
      return response.status(404).json({ error: "会话不存在。" });
    const messages = await input.pool.query(
      `SELECT m.id, m.sender, m.text, m.delivery_status AS "deliveryStatus", m.source_chunk_ids AS "sourceIds",
              m.created_at AS "createdAt", u.display_name AS "senderName"
       FROM messages m LEFT JOIN users u ON u.id = m.sender_user_id
       WHERE m.conversation_id = $1 ORDER BY m.created_at`,
      [request.params.id],
    );
    response.json({
      conversation: conversation.rows[0],
      messages: messages.rows,
    });
  });

  app.post("/api/admin/conversations/:id/claim", async (request, response) => {
    const user = response.locals.user as User;
    const result = await input.pool.query(
      `UPDATE conversations SET status = 'human_active', assigned_user_id = $2
       WHERE id = $1 AND status = 'waiting_human' AND assigned_user_id IS NULL RETURNING *`,
      [request.params.id, user.id],
    );
    if (!result.rowCount)
      return response.status(409).json({ error: "会话已被领取或状态已变化。" });
    events.emit(request.params.id, {
      type: "status",
      data: { status: "human_active" },
    });
    await audit(user, "claim", "conversation", request.params.id);
    response.json(result.rows[0]);
  });

  app.post("/api/admin/conversations/:id/reply", async (request, response) => {
    const user = response.locals.user as User;
    const text = cleanText(request.body?.text, 4000);
    if (!text) return response.status(400).json({ error: "回复不能为空。" });
    const allowed = await input.pool.query(
      `SELECT c.id, c.status, c.assigned_user_id, ch.type, ch.encrypted_secret AS "encryptedSecret", ci.external_id AS "externalId"
       FROM conversations c JOIN channel_connections ch ON ch.id = c.channel_connection_id
       JOIN channel_identities ci ON ci.id = c.channel_identity_id WHERE c.id = $1`,
      [request.params.id],
    );
    const conversation = allowed.rows[0];
    if (
      conversation?.status !== "human_active" ||
      (user.role !== "admin" && conversation.assigned_user_id !== user.id)
    ) {
      return response.status(409).json({ error: "请先领取该会话。" });
    }
    const message = await input.pool.query(
      `INSERT INTO messages (id, conversation_id, sender, sender_user_id, text, delivery_status)
       VALUES ($1, $2, 'agent', $3, $4, $5)
       RETURNING id, sender, text, delivery_status AS "deliveryStatus", created_at AS "createdAt"`,
      [
        crypto.randomUUID(),
        request.params.id,
        user.id,
        text,
        conversation.type === "telegram" ? "pending" : "sent",
      ],
    );
    if (conversation.type === "telegram") {
      try {
        const delivered = await sendTelegramText(
          decryptSecret(conversation.encryptedSecret, input.encryptionKey),
          conversation.externalId,
          text,
        );
        await input.pool.query(
          "UPDATE messages SET delivery_status = 'sent', platform_message_id = $2 WHERE id = $1",
          [message.rows[0].id, String(delivered.message_id)],
        );
        message.rows[0].deliveryStatus = "sent";
      } catch (error) {
        await input.pool.query(
          "UPDATE messages SET delivery_status = 'failed', error = $2 WHERE id = $1",
          [
            message.rows[0].id,
            error instanceof Error ? error.message : "Delivery failed",
          ],
        );
        message.rows[0].deliveryStatus = "failed";
      }
    }
    await input.pool.query(
      "UPDATE conversations SET last_message_at = now() WHERE id = $1",
      [request.params.id],
    );
    events.emit(request.params.id, { type: "message", data: message.rows[0] });
    response.status(201).json(message.rows[0]);
  });

  app.post(
    "/api/admin/conversations/:id/resume-ai",
    async (request, response) => {
      await input.pool.query(
        `UPDATE conversations SET status = 'ai_active', assigned_user_id = NULL, handoff_reason = NULL WHERE id = $1 AND status <> 'closed'`,
        [request.params.id],
      );
      events.emit(request.params.id, {
        type: "status",
        data: { status: "ai_active" },
      });
      await audit(
        response.locals.user,
        "resume_ai",
        "conversation",
        request.params.id,
      );
      response.json({ status: "ai_active" });
    },
  );

  app.post("/api/admin/conversations/:id/close", async (request, response) => {
    await input.pool.query(
      `UPDATE conversations SET status = 'closed', ended_at = now(), ai_resolved = assigned_user_id IS NULL WHERE id = $1`,
      [request.params.id],
    );
    events.emit(request.params.id, {
      type: "status",
      data: { status: "closed" },
    });
    await audit(
      response.locals.user,
      "close",
      "conversation",
      request.params.id,
    );
    response.json({ status: "closed" });
  });
}
