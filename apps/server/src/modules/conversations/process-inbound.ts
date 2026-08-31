import crypto from "node:crypto";
import type { EventEmitter } from "node:events";
import type pg from "pg";
import {
  readImage,
  removeImage,
  saveImage,
} from "../../infrastructure/media/storage.js";
import { searchChunks } from "../../infrastructure/qdrant/client.js";
import type {
  AiAgentConfig,
  AiConnection,
  KnowledgeSource,
} from "../ai/service.js";
import { answerFromKnowledge, describeImage } from "../ai/service.js";
import { decideAutomation } from "./automation.js";

export type SupportDependencies = {
  pool: pg.Pool;
  events: EventEmitter;
  mediaDir: string;
  qdrantUrl: string;
  getAiConnection(): Promise<AiConnection>;
};

export type InboundMessage = {
  conversationId: string;
  text: string;
  platformMessageId?: string;
  image?: { bytes: Buffer; originalName: string };
};

export async function processInbound(
  deps: SupportDependencies,
  input: InboundMessage,
) {
  const messageId = crypto.randomUUID();
  const client = await deps.pool.connect();
  let storedImage:
    | { storagePath: string; mimeType: string; size: number }
    | undefined;
  let attachmentId: string | undefined;
  try {
    if (input.image)
      storedImage = await saveImage(input.image.bytes, deps.mediaDir);
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO messages (id, conversation_id, sender, text, platform_message_id)
       VALUES ($1, $2, 'visitor', $3, $4)
       ON CONFLICT (conversation_id, platform_message_id) DO NOTHING
       RETURNING id, sender, text, created_at AS "createdAt"`,
      [
        messageId,
        input.conversationId,
        input.text.trim().slice(0, 4000),
        input.platformMessageId ?? null,
      ],
    );
    if (!inserted.rowCount) {
      await client.query("ROLLBACK");
      if (storedImage)
        await removeImage(deps.mediaDir, storedImage.storagePath);
      return { duplicate: true as const };
    }
    if (storedImage) {
      attachmentId = crypto.randomUUID();
      await client.query(
        `INSERT INTO attachments (id, message_id, mime_type, size, storage_path, original_name)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          attachmentId,
          messageId,
          storedImage.mimeType,
          storedImage.size,
          storedImage.storagePath,
          input.image?.originalName ?? "image",
        ],
      );
    }
    await client.query(
      `UPDATE conversations SET last_message_at = now() WHERE id = $1`,
      [input.conversationId],
    );
    await client.query("COMMIT");
    deps.events.emit(input.conversationId, {
      type: "message",
      data: {
        ...inserted.rows[0],
        attachments: attachmentId
          ? [{ id: attachmentId, mimeType: storedImage?.mimeType }]
          : [],
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (storedImage) await removeImage(deps.mediaDir, storedImage.storagePath);
    throw error;
  } finally {
    client.release();
  }

  const conversation = await deps.pool.query(
    `SELECT c.status, a.id AS "agentId", a.system_prompt AS "systemPrompt",
            a.model, a.temperature, a.language, a.fallback_message AS "fallbackMessage",
            a.handoff_keywords AS "handoffKeywords",
            coalesce(array_agg(ak.knowledge_base_id) FILTER (WHERE ak.knowledge_base_id IS NOT NULL), '{}') AS "knowledgeBaseIds"
     FROM conversations c JOIN ai_agents a ON a.id = c.ai_agent_id
     LEFT JOIN ai_agent_knowledge_bases ak ON ak.ai_agent_id = a.id
     WHERE c.id = $1
     GROUP BY c.id, a.id`,
    [input.conversationId],
  );
  const context = conversation.rows[0];
  if (context?.status !== "ai_active") return { duplicate: false as const };

  const handoff = decideAutomation({
    text: input.text,
    handoffKeywords: context.handoffKeywords,
    hasKnowledge: true,
    servicesAvailable: true,
  });
  if (handoff.kind === "handoff") {
    return handoffConversation(
      deps,
      input.conversationId,
      context.fallbackMessage,
      handoff.reason,
    );
  }

  try {
    const ai = await deps.getAiConnection();
    const agent: AiAgentConfig = {
      model: context.model,
      systemPrompt: context.systemPrompt,
      temperature: context.temperature,
      language: context.language,
    };
    let query = input.text.trim();
    let image: { bytes: Buffer; mimeType: string } | undefined;
    if (storedImage) {
      image = {
        bytes: await readImage(deps.mediaDir, storedImage.storagePath),
        mimeType: storedImage.mimeType,
      };
      query = await describeImage({ ...image, caption: query }, agent, ai);
    }
    if (!query)
      return handoffConversation(
        deps,
        input.conversationId,
        context.fallbackMessage,
        "empty_message",
      );
    const matches = await searchChunks(
      query,
      context.knowledgeBaseIds,
      deps.qdrantUrl,
      ai,
    );
    const sourceRows = matches.length
      ? await deps.pool.query(
          `SELECT id, content FROM chunks WHERE id = ANY($1::bigint[])`,
          [matches.map(({ id }) => id)],
        )
      : { rows: [] };
    const byId = new Map(
      sourceRows.rows.map((row: KnowledgeSource) => [
        Number(row.id),
        { id: Number(row.id), content: row.content },
      ]),
    );
    const sources = matches.flatMap(({ id }) =>
      byId.has(id) ? [byId.get(id)!] : [],
    );
    const answer = await answerFromKnowledge(
      { question: input.text || query, sources, agent, image },
      ai,
    );
    if (!answer)
      return handoffConversation(
        deps,
        input.conversationId,
        context.fallbackMessage,
        "no_knowledge",
      );
    return addAutomatedMessage(
      deps,
      input.conversationId,
      answer.answer,
      answer.sourceIds,
    );
  } catch (error) {
    console.error(
      "AI automation failed:",
      error instanceof Error ? error.message : error,
    );
    return handoffConversation(
      deps,
      input.conversationId,
      context.fallbackMessage,
      "automation_error",
    );
  }
}

async function handoffConversation(
  deps: SupportDependencies,
  conversationId: string,
  fallbackMessage: string,
  reason?: string,
) {
  await deps.pool.query(
    `UPDATE conversations SET status = 'waiting_human', handoff_reason = $2 WHERE id = $1 AND status = 'ai_active'`,
    [conversationId, reason ?? "requested_human"],
  );
  const result = await addAutomatedMessage(
    deps,
    conversationId,
    fallbackMessage,
    [],
  );
  deps.events.emit(conversationId, {
    type: "status",
    data: { status: "waiting_human", reason },
  });
  return { ...result, status: "waiting_human" as const };
}

async function addAutomatedMessage(
  deps: SupportDependencies,
  conversationId: string,
  text: string,
  sourceIds: number[],
) {
  const result = await deps.pool.query(
    `INSERT INTO messages (id, conversation_id, sender, text, source_chunk_ids)
     VALUES ($1, $2, 'ai', $3, $4) RETURNING id, sender, text, source_chunk_ids AS "sourceIds", created_at AS "createdAt"`,
    [crypto.randomUUID(), conversationId, text, sourceIds],
  );
  await deps.pool.query(
    `UPDATE conversations SET first_response_at = coalesce(first_response_at, now()), last_message_at = now() WHERE id = $1`,
    [conversationId],
  );
  deps.events.emit(conversationId, { type: "message", data: result.rows[0] });
  return {
    duplicate: false as const,
    outbound: result.rows[0],
    status: "ai_active" as const,
  };
}
