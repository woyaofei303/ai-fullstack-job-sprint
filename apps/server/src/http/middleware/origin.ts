import type { RequestHandler } from "express";

export function createOriginVerifier(
  adminUrl: string,
  allowMissingOrigin: boolean,
): RequestHandler {
  const adminOrigin = new URL(adminUrl).origin;
  return (request, response, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
    const origin = request.header("origin");
    if (!origin && allowMissingOrigin) return next();
    if (origin !== adminOrigin) {
      response.status(403).json({ error: "请求来源无效。" });
      return;
    }
    next();
  };
}
