import type { Express } from "express";
import { resetKnowledgeIndex } from "../../../infrastructure/qdrant/client.js";
import { encryptSecret } from "../../../infrastructure/security/crypto.js";
import {
  answerFromKnowledge,
  createEmbeddings,
  describeImage,
} from "../../../modules/ai/service.js";
import { ingestPendingDocuments } from "../../../modules/knowledge/ingestion.js";
import type { HttpContext } from "../../context.js";
import {
  cleanText,
  numberBetween,
  requiredText,
} from "../../shared/validation.js";

export function registerSettingRoutes(app: Express, context: HttpContext) {
  const { input, audit, adminOnly } = context;

  app.get("/api/admin/settings", adminOnly, async (_request, response) => {
    const result = await input.pool.query(
      'SELECT key,value,(encrypted_value IS NOT NULL) AS "hasSecret" FROM system_settings ORDER BY key',
    );
    response.json(
      Object.fromEntries(
        result.rows.map((row) => [
          row.key,
          { ...row.value, hasSecret: row.hasSecret },
        ]),
      ),
    );
  });

  app.patch("/api/admin/settings", adminOnly, async (request, response) => {
    const general = request.body?.general;
    if (general) {
      const retentionDays = numberBetween(general.retentionDays, 30, 365, 180);
      await input.pool.query(
        `UPDATE system_settings SET value=$1,updated_at=now() WHERE key='general'`,
        [
          {
            brandName: cleanText(general.brandName, 120) || "Support Desk",
            privacyUrl: cleanText(general.privacyUrl, 500),
            retentionDays,
          },
        ],
      );
    }
    const ai = request.body?.ai;
    if (ai) {
      const previous = await input.pool.query(
        `SELECT value->>'embeddingModel' AS "embeddingModel" FROM system_settings WHERE key='ai'`,
      );
      const embeddingModel = requiredText(ai.embeddingModel, "Embedding 模型");
      await input.pool.query(
        `UPDATE system_settings SET value=$1,encrypted_value=coalesce($2,encrypted_value),updated_at=now() WHERE key='ai'`,
        [
          {
            baseUrl: requiredText(ai.baseUrl, "AI Base URL"),
            embeddingModel,
          },
          ai.apiKey
            ? encryptSecret(
                requiredText(ai.apiKey, "API Key"),
                input.encryptionKey,
              )
            : null,
        ],
      );
      if (previous.rows[0]?.embeddingModel !== embeddingModel) {
        await resetKnowledgeIndex(input.qdrantUrl);
        await input.pool.query(
          `UPDATE documents SET status='pending',error=NULL,updated_at=now()`,
        );
        void ingestPendingDocuments(
          input.pool,
          input.qdrantUrl,
          await input.getAiConnection(),
        );
      }
    }
    await audit(response.locals.user, "update", "settings");
    response.json({ ok: true });
  });

  app.post(
    "/api/admin/settings/test-ai",
    adminOnly,
    async (_request, response) => {
      const ai = await input.getAiConnection();
      const [embedding] = await createEmbeddings(["connection test"], ai);
      const configured = (
        await input.pool.query(
          `SELECT model,system_prompt,temperature,language FROM ai_agents WHERE enabled=true ORDER BY created_at LIMIT 1`,
        )
      ).rows[0];
      const agent = configured
        ? {
            model: String(configured.model),
            systemPrompt: String(configured.system_prompt),
            temperature: Number(configured.temperature),
            language: configured.language as "auto" | "zh-CN" | "en",
          }
        : {
            model: "gpt-4.1-mini",
            systemPrompt: "Answer only from the source.",
            temperature: 0,
            language: "en" as const,
          };
      const answer = await answerFromKnowledge(
        {
          question: "What is the test status?",
          sources: [{ id: 1, content: "The test status is connected." }],
          agent,
        },
        ai,
      );
      const visionQuery = await describeImage(
        {
          bytes: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
          mimeType: "image/png",
          caption: "connection test",
        },
        agent,
        ai,
      );
      response.json({
        ok: Boolean(answer && visionQuery && embedding.length),
        textAndJson: Boolean(answer),
        vision: Boolean(visionQuery),
        embeddingDimensions: embedding.length,
        mock: ai.mock,
      });
    },
  );

  app.get("/api/admin/audit-logs", adminOnly, async (_request, response) => {
    const result = await input.pool.query(
      `SELECT l.*,u.display_name AS "userName" FROM audit_logs l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 200`,
    );
    response.json(result.rows);
  });
}
