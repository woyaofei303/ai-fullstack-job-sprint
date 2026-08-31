import crypto from "node:crypto";
import type { Express } from "express";
import { encryptSecret } from "../../../infrastructure/security/crypto.js";
import { configureTelegramBot } from "../../../modules/channels/telegram.js";
import type { HttpContext } from "../../context.js";
import {
  cleanText,
  requiredText,
  stringList,
} from "../../shared/validation.js";

export function registerChannelRoutes(app: Express, context: HttpContext) {
  const { input, audit, adminOnly } = context;

  app.get("/api/admin/channels", adminOnly, async (_request, response) => {
    const result = await input.pool.query(
      `SELECT c.id,c.type,c.name,c.public_id AS "publicId",c.default_ai_agent_id AS "defaultAiAgentId",c.config,c.enabled,c.created_at AS "createdAt",
              (c.encrypted_secret IS NOT NULL) AS "hasSecret",
              coalesce(json_agg(json_build_object('id',s.id,'publicId',s.public_id,'labelZh',s.label_zh,'labelEn',s.label_en,'aiAgentId',s.ai_agent_id) ORDER BY s.sort_order) FILTER (WHERE s.id IS NOT NULL),'[]') AS entries
       FROM channel_connections c LEFT JOIN service_entries s ON s.channel_connection_id=c.id GROUP BY c.id ORDER BY c.created_at`,
    );
    response.json(
      result.rows.map((row) => ({
        ...row,
        config: { ...row.config, webhookSecret: undefined },
      })),
    );
  });

  app.post("/api/admin/channels", adminOnly, async (request, response) => {
    const type = request.body?.type === "telegram" ? "telegram" : "web";
    const id = crypto.randomUUID();
    const defaultAiAgentId = requiredText(
      request.body?.defaultAiAgentId,
      "默认 AI",
    );
    const publicId = `${type === "web" ? "wgt" : "tgb"}_${crypto.randomBytes(6).toString("hex")}`;
    let encryptedSecret: string | null = null;
    let config: Record<string, unknown> =
      type === "web"
        ? { allowedOrigins: stringList(request.body?.allowedOrigins, []) }
        : {};
    if (type === "telegram") {
      const token = requiredText(request.body?.token, "Telegram Token");
      const webhookSecret = crypto.randomBytes(24).toString("base64url");
      const bot = await configureTelegramBot(
        token,
        `${input.supportUrl}/api/integrations/telegram/${id}/webhook`,
        webhookSecret,
      );
      encryptedSecret = encryptSecret(token, input.encryptionKey);
      config = { webhookSecret, botUsername: bot.username ?? "" };
    }
    const result = await input.pool.query(
      `INSERT INTO channel_connections (id,type,name,public_id,default_ai_agent_id,encrypted_secret,config)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,type,name,public_id AS "publicId",config,enabled`,
      [
        id,
        type,
        requiredText(request.body?.name, "名称"),
        publicId,
        defaultAiAgentId,
        encryptedSecret,
        config,
      ],
    );
    await input.pool.query(
      `INSERT INTO service_entries (id,channel_connection_id,ai_agent_id,public_id,label_zh,label_en,description_zh,description_en)
       VALUES ($1,$2,$3,$4,'通用咨询','General support','产品与售后问题','Product and after-sales questions')`,
      [
        crypto.randomUUID(),
        id,
        defaultAiAgentId,
        `general_${crypto.randomBytes(4).toString("hex")}`,
      ],
    );
    await audit(response.locals.user, "create", "channel", id);
    response.status(201).json({
      ...result.rows[0],
      config: { ...result.rows[0].config, webhookSecret: undefined },
    });
  });

  app.patch("/api/admin/channels/:id", adminOnly, async (request, response) => {
    const result = await input.pool.query(
      `UPDATE channel_connections SET name=$2,default_ai_agent_id=$3,enabled=$4,
              config=CASE WHEN type='web' THEN jsonb_build_object('allowedOrigins',$5::jsonb) ELSE config END,updated_at=now()
       WHERE id=$1 RETURNING id,type,name,public_id AS "publicId",config,enabled`,
      [
        request.params.id,
        requiredText(request.body?.name, "名称"),
        requiredText(request.body?.defaultAiAgentId, "默认 AI"),
        request.body?.enabled !== false,
        JSON.stringify(stringList(request.body?.allowedOrigins, [])),
      ],
    );
    if (!result.rowCount)
      return response.status(404).json({ error: "渠道不存在。" });
    await audit(
      response.locals.user,
      "update",
      "channel",
      String(request.params.id),
    );
    response.json(result.rows[0]);
  });

  app.post(
    "/api/admin/channels/:id/entries",
    adminOnly,
    async (request, response) => {
      const result = await input.pool.query(
        `INSERT INTO service_entries (id,channel_connection_id,ai_agent_id,public_id,label_zh,label_en,description_zh,description_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          crypto.randomUUID(),
          request.params.id,
          requiredText(request.body?.aiAgentId, "AI 角色"),
          `svc_${crypto.randomBytes(5).toString("hex")}`,
          requiredText(request.body?.labelZh, "中文名称"),
          requiredText(request.body?.labelEn, "英文名称"),
          cleanText(request.body?.descriptionZh, 500),
          cleanText(request.body?.descriptionEn, 500),
        ],
      );
      response.status(201).json(result.rows[0]);
    },
  );
}
