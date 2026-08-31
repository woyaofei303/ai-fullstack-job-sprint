import type { Express } from "express";
import type { HttpContext } from "../../context.js";
import { registerPublicConversationRoutes } from "./conversations.js";
import { registerWidgetRoutes } from "./widgets.js";

export function registerPublicRoutes(app: Express, context: HttpContext) {
  app.use("/api/public", context.rateLimit);
  registerWidgetRoutes(app, context);
  registerPublicConversationRoutes(app, context);
}
