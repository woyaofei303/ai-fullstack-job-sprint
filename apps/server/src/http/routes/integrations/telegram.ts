import crypto from "node:crypto";
import type { Express } from "express";
import type pg from "pg";
import { decryptSecret } from "../../../infrastructure/security/crypto.js";
import {
  downloadTelegramPhoto,
  parseTelegramUpdate,
  sendTelegramText,
  sendTelegramTyping,
} from "../../../modules/channels/telegram.js";
import { processInbound } from "../../../modules/conversations/process-inbound.js";
import type { HttpContext } from "../../context.js";

export function registerTelegramRoutes(app: Express, context: HttpContext) {
  const { input, support: deps } = context;

  app.post(
    "/api/integrations/telegram/:connectionId/webhook",
    async (request, response) => {
      const channelResult = await input.pool.query(
        `SELECT id, encrypted_secret AS "encryptedSecret", config, default_ai_agent_id AS "defaultAiAgentId"
       FROM channel_connections WHERE id = $1 AND type = 'telegram' AND enabled`,
        [request.params.connectionId],
      );
      if (!channelResult.rowCount) return response.status(404).end();
      const channel = channelResult.rows[0];
      const providedSecret = crypto
        .createHash("sha256")
        .update(request.header("x-telegram-bot-api-secret-token") ?? "")
        .digest();
      const expectedSecret = crypto
        .createHash("sha256")
        .update(channel.config.webhookSecret ?? "invalid")
        .digest();
      if (!crypto.timingSafeEqual(providedSecret, expectedSecret))
        return response.status(401).end();
      const inbound = parseTelegramUpdate(request.body);
      if (!inbound) return response.json({ ok: true });
      const claimed = await input.pool.query(
        `INSERT INTO telegram_updates (channel_connection_id, update_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING update_id`,
        [channel.id, inbound.updateId],
      );
      if (!claimed.rowCount)
        return response.json({ ok: true, duplicate: true });
      try {
        const token = decryptSecret(
          channel.encryptedSecret,
          input.encryptionKey,
        );
        const start = inbound.text.match(/^\/start(?:\s+([\w-]+))?/);
        const entries = await input.pool.query(
          `SELECT id, public_id AS "publicId", ai_agent_id AS "aiAgentId", label_zh AS "labelZh"
       FROM service_entries WHERE channel_connection_id = $1 AND enabled ORDER BY sort_order, created_at`,
          [channel.id],
        );
        if (start && !start[1] && entries.rowCount) {
          await sendTelegramText(
            token,
            inbound.externalId,
            "请选择服务入口：",
            {
              inline_keyboard: entries.rows.map((entry) => [
                {
                  text: entry.labelZh,
                  url: `https://t.me/${channel.config.botUsername}?start=${entry.publicId}`,
                },
              ]),
            },
          );
          return response.json({ ok: true });
        }
        const entry =
          entries.rows.find((item) => item.publicId === start?.[1]) ??
          entries.rows[0];
        const conversationId = await ensureTelegramConversation(
          input.pool,
          channel,
          inbound,
          entry,
        );
        await sendTelegramTyping(token, inbound.externalId).catch(
          () => undefined,
        );
        const imageBytes = inbound.photoFileId
          ? await downloadTelegramPhoto(token, inbound.photoFileId)
          : undefined;
        const result = await processInbound(deps, {
          conversationId,
          text: start ? "你好" : inbound.text,
          platformMessageId: inbound.platformMessageId,
          ...(imageBytes
            ? { image: { bytes: imageBytes, originalName: "telegram-image" } }
            : {}),
        });
        let outboundText =
          "outbound" in result ? result.outbound?.text : undefined;
        if (result.duplicate) {
          const lastReply = await input.pool.query(
            `SELECT text FROM messages WHERE conversation_id=$1 AND sender IN ('ai','agent') ORDER BY created_at DESC LIMIT 1`,
            [conversationId],
          );
          outboundText = lastReply.rows[0]?.text;
        }
        if (outboundText)
          await sendTelegramText(token, inbound.externalId, outboundText);
        response.json({ ok: true });
      } catch (error) {
        await input.pool.query(
          `DELETE FROM telegram_updates WHERE channel_connection_id=$1 AND update_id=$2`,
          [channel.id, inbound.updateId],
        );
        throw error;
      }
    },
  );
}

async function ensureTelegramConversation(
  pool: pg.Pool,
  channel: { id: string; defaultAiAgentId: string },
  inbound: ReturnType<typeof parseTelegramUpdate> & {},
  entry?: { id: string; aiAgentId: string },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let identity = await client.query(
      `SELECT id FROM channel_identities WHERE channel_connection_id=$1 AND external_id=$2`,
      [channel.id, inbound.externalId],
    );
    if (!identity.rowCount) {
      const contactId = crypto.randomUUID();
      await client.query("INSERT INTO contacts (id,name) VALUES ($1,$2)", [
        contactId,
        inbound.name,
      ]);
      identity = await client.query(
        `INSERT INTO channel_identities (id,contact_id,channel_connection_id,external_id,profile)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [
          crypto.randomUUID(),
          contactId,
          channel.id,
          inbound.externalId,
          { username: inbound.username },
        ],
      );
    }
    let conversation = await client.query(
      `SELECT id FROM conversations WHERE channel_connection_id=$1 AND channel_identity_id=$2 AND status<>'closed'`,
      [channel.id, identity.rows[0].id],
    );
    if (!conversation.rowCount) {
      conversation = await client.query(
        `INSERT INTO conversations (id,channel_connection_id,channel_identity_id,service_entry_id,ai_agent_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [
          crypto.randomUUID(),
          channel.id,
          identity.rows[0].id,
          entry?.id ?? null,
          entry?.aiAgentId ?? channel.defaultAiAgentId,
        ],
      );
    }
    await client.query("COMMIT");
    return conversation.rows[0].id as string;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
