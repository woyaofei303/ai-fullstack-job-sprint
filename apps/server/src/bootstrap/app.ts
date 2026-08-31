import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";
import { type AppDependencies, createHttpContext } from "../http/context.js";
import { registerAiAgentRoutes } from "../http/routes/admin/ai-agents.js";
import { registerAuthRoutes } from "../http/routes/admin/auth.js";
import { registerChannelRoutes } from "../http/routes/admin/channels.js";
import { registerContactRoutes } from "../http/routes/admin/contacts.js";
import { registerConversationRoutes } from "../http/routes/admin/conversations.js";
import { registerDashboardRoutes } from "../http/routes/admin/dashboard.js";
import { registerKnowledgeRoutes } from "../http/routes/admin/knowledge.js";
import { registerSettingRoutes } from "../http/routes/admin/settings.js";
import { registerUserRoutes } from "../http/routes/admin/users.js";
import { registerTelegramRoutes } from "../http/routes/integrations/telegram.js";
import { registerPublicRoutes } from "../http/routes/public/index.js";

export type { AppDependencies } from "../http/context.js";

export function createApp(input: AppDependencies) {
  const app = express();
  const context = createHttpContext(input);

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader("X-Frame-Options", "SAMEORIGIN");
    response.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    response.setHeader(
      "X-Request-Id",
      request.header("x-request-id") || crypto.randomUUID(),
    );
    next();
  });

  app.get("/api/health", async (_request, response) => {
    await input.pool.query("SELECT 1");
    response.json({
      ok: true,
      mockMode: input.mockMode,
      redis: input.cache.isReady,
    });
  });

  registerPublicRoutes(app, context);
  registerTelegramRoutes(app, context);
  registerAuthRoutes(app, context);
  registerDashboardRoutes(app, context);
  registerConversationRoutes(app, context);
  registerContactRoutes(app, context);
  registerAiAgentRoutes(app, context);
  registerKnowledgeRoutes(app, context);
  registerChannelRoutes(app, context);
  registerUserRoutes(app, context);
  registerSettingRoutes(app, context);

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      console.error(error);
      if (
        error instanceof multer.MulterError &&
        error.code === "LIMIT_FILE_SIZE"
      ) {
        return response.status(413).json({ error: "文件超过大小限制。" });
      }
      if (
        error instanceof Error &&
        /required|必须|名称|问题|答案|URL|模型|回复|AI 角色|默认 AI|Token|邮箱|密码|姓名/.test(
          error.message,
        )
      ) {
        return response.status(400).json({ error: error.message });
      }
      response.status(500).json({ error: "服务器暂时无法完成请求。" });
    },
  );

  return app;
}
