import crypto from "node:crypto";
import type { Express } from "express";
import type pg from "pg";
import { searchChunks } from "../../../infrastructure/qdrant/client.js";
import { answerFromKnowledge } from "../../../modules/ai/service.js";
import type { HttpContext } from "../../context.js";
import {
  allowedLanguage,
  cleanText,
  numberBetween,
  requiredText,
  stringList,
} from "../../shared/validation.js";

export function registerAiAgentRoutes(app: Express, context: HttpContext) {
  const { input, audit, adminOnly } = context;

  app.get("/api/admin/ai-agents", adminOnly, async (_request, response) => {
    const result = await input.pool.query(
      `SELECT a.*, coalesce(array_agg(k.knowledge_base_id) FILTER (WHERE k.knowledge_base_id IS NOT NULL), '{}') AS "knowledgeBaseIds"
       FROM ai_agents a LEFT JOIN ai_agent_knowledge_bases k ON k.ai_agent_id = a.id GROUP BY a.id ORDER BY a.created_at`,
    );
    response.json(result.rows);
  });

  app.post(
    "/api/admin/ai-agents/:id/debug",
    adminOnly,
    async (request, response) => {
      const question = requiredText(request.body?.question, "问题");
      const result = await input.pool.query(
        `SELECT a.model,a.system_prompt AS "systemPrompt",a.temperature,a.language,a.fallback_message AS "fallbackMessage",
                coalesce(array_agg(k.knowledge_base_id) FILTER (WHERE k.knowledge_base_id IS NOT NULL), '{}') AS "knowledgeBaseIds"
         FROM ai_agents a LEFT JOIN ai_agent_knowledge_bases k ON k.ai_agent_id=a.id
         WHERE a.id=$1 GROUP BY a.id`,
        [request.params.id],
      );
      if (!result.rowCount)
        return response.status(404).json({ error: "AI 角色不存在。" });
      const agent = result.rows[0];
      const ai = await input.getAiConnection();
      const matches = await searchChunks(
        question,
        agent.knowledgeBaseIds,
        input.qdrantUrl,
        ai,
      );
      const sourceRows = matches.length
        ? await input.pool.query(
            `SELECT id,content FROM chunks WHERE id=ANY($1::bigint[])`,
            [matches.map(({ id }) => id)],
          )
        : { rows: [] };
      const sources = sourceRows.rows.map((row) => ({
        id: Number(row.id),
        content: String(row.content),
      }));
      const answer = await answerFromKnowledge(
        { question, sources, agent },
        ai,
      );
      response.json({
        answer: answer?.answer ?? agent.fallbackMessage,
        sourceIds: answer?.sourceIds ?? [],
        matchedSourceIds: matches.map(({ id }) => id),
      });
    },
  );

  app.post("/api/admin/ai-agents", adminOnly, async (request, response) => {
    const id = crypto.randomUUID();
    const result = await input.pool.query(
      `INSERT INTO ai_agents (id, name, description, system_prompt, tone, language, model, temperature, fallback_message, handoff_keywords)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        id,
        requiredText(request.body?.name, "名称"),
        cleanText(request.body?.description, 1000),
        requiredText(request.body?.systemPrompt, "提示词"),
        cleanText(request.body?.tone, 40) || "friendly",
        allowedLanguage(request.body?.language),
        requiredText(request.body?.model, "模型"),
        numberBetween(request.body?.temperature, 0, 1, 0.2),
        requiredText(request.body?.fallbackMessage, "兜底回复"),
        stringList(request.body?.handoffKeywords, ["人工", "human"]),
      ],
    );
    await bindKnowledgeBases(input.pool, id, request.body?.knowledgeBaseIds);
    await audit(response.locals.user, "create", "ai_agent", id);
    response.status(201).json(result.rows[0]);
  });

  app.patch(
    "/api/admin/ai-agents/:id",
    adminOnly,
    async (request, response) => {
      const result = await input.pool.query(
        `UPDATE ai_agents SET name=$2, description=$3, system_prompt=$4, tone=$5, language=$6, model=$7,
              temperature=$8, fallback_message=$9, handoff_keywords=$10, enabled=$11, updated_at=now()
       WHERE id=$1 RETURNING *`,
        [
          request.params.id,
          requiredText(request.body?.name, "名称"),
          cleanText(request.body?.description, 1000),
          requiredText(request.body?.systemPrompt, "提示词"),
          cleanText(request.body?.tone, 40) || "friendly",
          allowedLanguage(request.body?.language),
          requiredText(request.body?.model, "模型"),
          numberBetween(request.body?.temperature, 0, 1, 0.2),
          requiredText(request.body?.fallbackMessage, "兜底回复"),
          stringList(request.body?.handoffKeywords, ["人工", "human"]),
          request.body?.enabled !== false,
        ],
      );
      if (!result.rowCount)
        return response.status(404).json({ error: "AI 角色不存在。" });
      await bindKnowledgeBases(
        input.pool,
        String(request.params.id),
        request.body?.knowledgeBaseIds,
      );
      await audit(
        response.locals.user,
        "update",
        "ai_agent",
        String(request.params.id),
      );
      response.json(result.rows[0]);
    },
  );

  app.delete(
    "/api/admin/ai-agents/:id",
    adminOnly,
    async (request, response) => {
      const result = await input.pool.query(
        "DELETE FROM ai_agents WHERE id = $1 RETURNING id",
        [request.params.id],
      );
      if (!result.rowCount)
        return response
          .status(404)
          .json({ error: "AI 角色不存在或仍被渠道使用。" });
      await audit(
        response.locals.user,
        "delete",
        "ai_agent",
        String(request.params.id),
      );
      response.status(204).end();
    },
  );
}

async function bindKnowledgeBases(
  pool: pg.Pool,
  agentId: string,
  ids: unknown,
) {
  await pool.query(
    "DELETE FROM ai_agent_knowledge_bases WHERE ai_agent_id=$1",
    [agentId],
  );
  for (const knowledgeBaseId of stringList(ids, [])) {
    await pool.query(
      `INSERT INTO ai_agent_knowledge_bases (ai_agent_id,knowledge_base_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [agentId, knowledgeBaseId],
    );
  }
}
