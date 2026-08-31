import type { Express } from "express";
import type { HttpContext } from "../../context.js";

export function registerWidgetRoutes(app: Express, context: HttpContext) {
  const { input } = context;

  app.get("/api/public/widgets/:publicId", async (request, response) => {
    const result = await input.pool.query(
      `SELECT c.id, c.name, c.public_id AS "publicId", c.config,
              a.name AS "agentName", a.avatar_url AS "agentAvatar"
       FROM channel_connections c JOIN ai_agents a ON a.id = c.default_ai_agent_id
       WHERE c.public_id = $1 AND c.type = 'web' AND c.enabled`,
      [request.params.publicId],
    );
    if (!result.rowCount)
      return response.status(404).json({ error: "客服入口不存在。" });
    const channel = result.rows[0];
    const entries = await input.pool.query(
      `SELECT public_id AS "publicId", label_zh AS "labelZh", label_en AS "labelEn",
              description_zh AS "descriptionZh", description_en AS "descriptionEn"
       FROM service_entries WHERE channel_connection_id = $1 AND enabled ORDER BY sort_order, created_at`,
      [channel.id],
    );
    const settings = await input.pool.query(
      "SELECT value FROM system_settings WHERE key = 'general'",
    );
    const telegram = await input.pool.query(
      `SELECT config->>'botUsername' AS username FROM channel_connections
       WHERE type = 'telegram' AND enabled AND config->>'botUsername' IS NOT NULL LIMIT 1`,
    );
    response.json({
      ...channel,
      config: undefined,
      allowedOrigins: channel.config?.allowedOrigins ?? [],
      entries: entries.rows,
      brand: settings.rows[0]?.value ?? {},
      telegramUsername: telegram.rows[0]?.username ?? null,
      whatsappAvailable: false,
    });
  });
}
