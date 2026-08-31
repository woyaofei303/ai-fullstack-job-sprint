import type { Express } from "express";
import type { HttpContext } from "../../context.js";
import { cleanText } from "../../shared/validation.js";

export function registerDashboardRoutes(app: Express, context: HttpContext) {
  const { input } = context;

  app.get("/api/admin/dashboard", async (request, response) => {
    const days = Math.min(365, Math.max(1, Number(request.query.days) || 7));
    const channelId = cleanText(request.query.channelId, 80) || null;
    const aiAgentId = cleanText(request.query.aiAgentId, 80) || null;
    const result = await input.pool.query(
      `SELECT count(*)::int AS conversations,
              count(*) FILTER (WHERE ai_resolved)::int AS "aiResolved",
              count(*) FILTER (WHERE handoff_reason IS NOT NULL)::int AS handoffs,
              count(*) FILTER (WHERE status = 'waiting_human')::int AS waiting,
              coalesce(round(avg(extract(epoch FROM (first_response_at - created_at))) FILTER (WHERE first_response_at IS NOT NULL))::int, 0) AS "firstResponseSeconds"
       FROM conversations
       WHERE created_at >= now() - ($1 || ' days')::interval
         AND ($2::uuid IS NULL OR channel_connection_id=$2)
         AND ($3::uuid IS NULL OR ai_agent_id=$3)`,
      [days, channelId, aiAgentId],
    );
    response.json(result.rows[0]);
  });
}
